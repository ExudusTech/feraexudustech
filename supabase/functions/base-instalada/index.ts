// Installed base (Lote 11) on existing modules: clients, comodatos (points), schedules + schedule_evidencias (visits/checklist),
// maintenance_schedule (replacement work orders and urgent requests). No parallel tables.
// Every write first reads the target with the caller's own access (RLS), then writes with the service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acaoRevisitaErro, areaDoCliente, avaliacaoErro, enderecoImportado, ESTADO_LABEL, MANUTENCOES_ACEITAS, OCORRENCIA_ATIVACAO, ocorrenciaUrgenteMessage, parseImportRows, pontoErro, podeGravarLocalizacao, statusPontoNovo, type ImportRow } from "../_shared/base-instalada.ts";
import { addDias, ERRO_SEM_ROTA, maxPorDiaValido, planejarAtivacoes, type LinhaAtivacao } from "../_shared/ativacao.ts";
const AVISO_SEM_ROTA = "Cidade sem rota cadastrada: não gera visita automática, fica em \"Aguardando data\"";
import { googleOcupado } from "../_shared/google-calendar.ts";
import { geocodeClient } from "../_shared/geocode.ts";
import { nextMaintenance } from "../_shared/visit-exec.ts";
import { teamAlert } from "../_shared/team-alert.ts";
import { acoesEtiqueta, formatEtiqueta, numeroEmLote, parseEtiqueta, STATUS_APARELHO_LABEL } from "../_shared/etiquetas.ts";
import { qtdAparelhos } from "../_shared/estoque.ts";
import { agendaDataErro, agendaDoPlano, proximaPassagem } from "../_shared/revisita.ts";
import { agendarRevisitaCliente, contextoRevisita, hojeSP } from "../_shared/revisita-agendar.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const uuidOrNull = (v: unknown) => typeof v === "string" && UUID.test(v) ? v : null;
const ACTIONS = ["buscar_local", "nova_manutencao", "ponto_novo", "avaliar", "localizacao_cliente", "ocorrencia_status", "pedido_decidir", "importar", "importar_previa", "material_separado",
  "ativacao_previa", "ativacao_criar", "agenda_cliente",
  "etiqueta_info", "etiqueta_vincular", "etiqueta_separar", "etiqueta_desfazer_separacao", "etiqueta_instalar", "etiqueta_trocar_ponto", "etiqueta_retirar", "etiqueta_substituir"];
const MANUT: readonly string[] = MANUTENCOES_ACEITAS;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Não autorizado" }, 401);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json({ error: "Requisição inválida" }, 400); }
  if (!ACTIONS.includes(b.action)) return json({ error: "Requisição inválida" }, 400);

  // Origin/author headers let the database attribute stock movements to the caller (trusted only with the service role).
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { global: { headers: { "x-fera-origem": "app", "x-fera-usuario": user.id } } });
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role as string));
  const privileged = ["admin", "super_admin", "gestor"].some((r) => roleSet.has(r));
  const { data: me } = await admin.from("profiles").select("name, organization_id").eq("user_id", user.id).maybeSingle();
  const org = me?.organization_id as string | undefined;
  if (!org) return json({ error: "Organização não encontrada" }, 403);
  const consultor = (me?.name as string) ?? "Equipe";
  const bg = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p.catch(() => undefined)) ?? p;

  // Visit the caller may execute (assigned consultant or manager).
  const loadVisit = async (id: unknown) => {
    if (!UUID.test(String(id ?? ""))) return null;
    const { data: s } = await caller.from("schedules").select("id, organization_id, status, assigned_to, created_by, client_id, lead_id, operacao_material, ocorrencia_tipo, clients(name, latitude), leads(empresa_nome, company)").eq("id", id).maybeSingle();
    if (!s) return null;
    if (!privileged && s.assigned_to !== user.id && !(s.assigned_to === null && s.created_by === user.id)) return null;
    return s as any;
  };
  const productOk = async (id: string | null) => {
    if (!id) return null;
    const { data } = await admin.from("products").select("id, name").eq("id", id).eq("organization_id", org).maybeSingle();
    return data;
  };

  if (String(b.action).startsWith("etiqueta_")) return await etiqueta(b, { admin, caller, user, org, privileged, roleSet, loadVisit, productOk });

  switch (b.action) {
    case "material_separado": {
      // Who separates material: the visit's consultant, operacional (stock) or a manager. Read with caller RLS first.
      if (!UUID.test(String(b.id ?? ""))) return json({ error: "Requisição inválida" }, 400);
      const { data: s } = await caller.from("schedules").select("id, organization_id, assigned_to, material_status, exige_material").eq("id", b.id).maybeSingle();
      if (!s || s.organization_id !== org) return json({ error: "Agendamento não encontrado" }, 404);
      if (!privileged && !roleSet.has("operacional") && s.assigned_to !== user.id) return json({ error: "Sem permissão para marcar o material" }, 403);
      if (!s.exige_material) return json({ error: "Este agendamento não tem material a separar" }, 409);
      const separado = b.desfazer !== true;
      const { error } = await admin.from("schedules").update({ material_status: separado ? "separado" : "pendente",
        material_separado_em: separado ? new Date().toISOString() : null, material_separado_por: separado ? user.id : null }).eq("id", s.id);
      if (error) { console.error("[base-instalada] material", error.code); return json({ error: "Não foi possível salvar" }, 400); }
      return json({ ok: true });
    }
    case "buscar_local": {
      const q = txt(b.q, 120);
      const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
      if (q.length < 3 || !key) return json({ resultados: [] });
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", signal: AbortSignal.timeout(8000),
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents" },
          body: JSON.stringify({ textQuery: q, languageCode: "pt-BR", regionCode: "BR", maxResultCount: 5,
            locationBias: { circle: { center: { latitude: -22.88, longitude: -42.02 }, radius: 50000 } } }) });
        const data = res.ok ? await res.json() : { places: [] };
        const resultados = (data.places ?? []).map((p: any) => ({ place_id: p.id, nome: p.displayName?.text ?? "", endereco: p.formattedAddress ?? "",
          lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null,
          cidade: (p.addressComponents ?? []).find((c: any) => (c.types ?? []).includes("administrative_area_level_2"))?.longText ?? null,
          estado: (p.addressComponents ?? []).find((c: any) => (c.types ?? []).includes("administrative_area_level_1"))?.shortText ?? null }));
        return json({ resultados });
      } catch { return json({ resultados: [] }); }
    }
    case "nova_manutencao": {
      let clientId = uuidOrNull(b.client_id);
      let clientName = "";
      if (clientId) {
        const { data: c } = await caller.from("clients").select("id, name").eq("id", clientId).maybeSingle();
        if (!c) return json({ error: "Cliente não encontrado" }, 404);
        clientName = c.name;
      } else {
        const nome = txt(b.nome, 160);
        if (nome.length < 2) return json({ error: "Informe o nome do estabelecimento" }, 400);
        const p = b.place ?? {};
        const cidade = txt(p.cidade, 80) || txt(b.cidade, 80) || null;
        const { data: dup } = await admin.from("clients").select("id, name").eq("organization_id", org).ilike("name", nome).limit(5);
        const same = (dup ?? []).find(() => true);
        if (same && !b.forcar) return json({ error: "Já existe um cliente com esse nome", duplicado: same }, 409);
        const { data: c, error } = await admin.from("clients").insert({ organization_id: org, name: nome, company: nome, status: "active",
          address: txt(p.endereco, 300) || null, city: cidade, state: txt(p.estado, 4) || null, place_id: txt(p.place_id, 200) || null,
          latitude: num(p.lat), longitude: num(p.lng), localizacao_origem: num(p.lat) !== null ? "google" : null,
          created_by: user.id, assigned_user_id: user.id }).select("id, name").single();
        if (error) { console.error("[base-instalada] client", error.code); return json({ error: "Não foi possível cadastrar o cliente" }, 400); }
        clientId = c.id; clientName = c.name;
      }
      const now = new Date(Date.now() - 3 * 3_600_000);
      const { data: s, error: se } = await admin.from("schedules").insert({ organization_id: org, title: `Manutenção — ${clientName}`, client_id: clientId,
        scheduled_date: now.toISOString().slice(0, 10), start_time: now.toISOString().slice(11, 16), status: "agendado", schedule_type: "manutencao",
        schedule_subtype: "MANUTENCAO", source: "campo", assigned_to: user.id, created_by: user.id, confirmacao_status: "nao_aplicavel" }).select("id").single();
      if (se) { console.error("[base-instalada] schedule", se.code); return json({ error: "Não foi possível criar a visita" }, 400); }
      return json({ ok: true, schedule_id: s.id, client_id: clientId });
    }
    case "ponto_novo": {
      const s = await loadVisit(b.schedule_id);
      if (!s || (!s.client_id && !s.lead_id)) return json({ error: "Visita não encontrada" }, 404);
      if (s.status !== "em_atendimento") return json({ error: "Inicie o atendimento antes" }, 409);
      const foto = txt(b.foto_path, 300);
      if (foto && !foto.startsWith(`${s.organization_id}/${s.id}/`)) return json({ error: "Foto inválida" }, 400);
      const qtd = txt(String(b.quantidade ?? "1"), 4) || "1";
      const err = pontoErro({ localizacao_interna: b.localizacao_interna, foto_path: foto, quantidade: qtd });
      if (err) return json({ error: err }, 400);
      const disp = await productOk(uuidOrNull(b.product_id)); const refil = await productOk(uuidOrNull(b.refil_product_id));
      const { data: c } = s.client_id ? await admin.from("clients").select("city, state, address").eq("id", s.client_id).maybeSingle()
        : await admin.from("leads").select("city, address:endereco").eq("id", s.lead_id).maybeSingle();
      // Test installation (or still a lead): the device stays EM_TESTE on the lead; the conversion trigger moves it to the client.
      const { data, error } = await admin.from("comodatos").insert({ organization_id: s.organization_id, client_id: s.client_id ?? null, lead_id: s.client_id ? null : s.lead_id, product_id: disp?.id ?? null,
        refil_product_id: refil?.id ?? null, quantidade: qtd, foto_path: foto, localizacao_interna: txt(b.localizacao_interna, 120), notes: txt(b.observacao, 500) || null,
        cidade: c?.city ?? null, estado: (c as any)?.state ?? null, endereco_instalacao: (c as any)?.address ?? null, status: statusPontoNovo(s),
        // Activation of the existing base: the device was already at the client (no stock, invoice or billing task).
        origem: s.ocorrencia_tipo === OCORRENCIA_ATIVACAO && s.client_id ? "base_existente" : "campo", ocorrencia_schedule_id: s.id,
        periodicidade_manut: "mensal", data_inicio: new Date().toISOString().slice(0, 10), created_by: user.id }).select("id").single();
      if (error) { console.error("[base-instalada] ponto", error.code); return json({ error: "Não foi possível salvar o ponto" }, 400); }
      // The new point leaves already evaluated (estado + checks + the same photo), so closing is never blocked by a hidden step.
      if (b.estado !== undefined && b.estado !== null) {
        const aErr = avaliacaoErro({ estado: b.estado, foto_path: foto });
        if (!aErr) {
          const manut = Array.isArray(b.manutencoes) ? b.manutencoes.filter((m: unknown) => MANUT.includes(m as string)) : [];
          const { error: ae } = await admin.from("schedule_evidencias").insert({ organization_id: s.organization_id, schedule_id: s.id, comodato_id: data.id,
            estado: b.estado, itens: manut, precisa_substituir: false, foto_path: foto, observacoes: txt(b.observacao, 500) || null, autor_id: user.id });
          if (ae) console.error("[base-instalada] ponto aval", ae.code);
          else await admin.from("comodatos").update({ estado_atual: b.estado, ultima_avaliacao_em: new Date().toISOString() }).eq("id", data.id);
        }
      }
      return json({ ok: true, id: data.id });
    }
    case "avaliar": {
      // Point evaluation = a schedule_evidencias row with estado (one per point and visit).
      const s = await loadVisit(b.schedule_id);
      if (!s || (!s.client_id && !s.lead_id)) return json({ error: "Visita não encontrada" }, 404);
      if (s.status !== "em_atendimento") return json({ error: "Inicie o atendimento antes" }, 409);
      const { data: p } = await admin.from("comodatos").select("id, localizacao_interna, periodicidade_manut, linha_produto, fabricante")
        .eq("id", b.comodato_id).eq(s.client_id ? "client_id" : "lead_id", s.client_id ?? s.lead_id).eq("organization_id", s.organization_id).maybeSingle();
      if (!p) return json({ error: "Ponto não encontrado" }, 404);
      const foto = txt(b.foto_path, 300);
      if (foto && !foto.startsWith(`${s.organization_id}/${s.id}/`)) return json({ error: "Foto inválida" }, 400);
      const item = await productOk(uuidOrNull(b.item_product_id));
      const itemTxt = item?.name ?? txt(b.item_descricao, 160);
      const err = avaliacaoErro({ estado: b.estado, foto_path: foto, precisa_substituir: !!b.precisa_substituir, item: itemTxt });
      if (err) return json({ error: err }, 400);
      const manut = Array.isArray(b.manutencoes) ? b.manutencoes.filter((m: unknown) => MANUT.includes(m as string)) : [];
      const acaoErr = acaoRevisitaErro(b.estado, manut.includes("consertado"), !!b.precisa_substituir);
      if (acaoErr) return json({ error: acaoErr }, 400);
      const row = { estado: b.estado, itens: manut, precisa_substituir: !!b.precisa_substituir, foto_path: foto || null, observacoes: txt(b.observacao, 500) || null, autor_id: user.id };
      const { data: prev } = await admin.from("schedule_evidencias").select("id").eq("schedule_id", s.id).eq("comodato_id", p.id).not("estado", "is", null).maybeSingle();
      const { data: av, error } = prev
        ? await admin.from("schedule_evidencias").update(row).eq("id", prev.id).select("id").single()
        : await admin.from("schedule_evidencias").insert({ ...row, organization_id: s.organization_id, schedule_id: s.id, comodato_id: p.id }).select("id").single();
      if (error) { console.error("[base-instalada] avaliar", error.code); return json({ error: "Não foi possível salvar" }, 400); }
      const today = new Date().toISOString().slice(0, 10);
      await admin.from("comodatos").update({ estado_atual: b.estado, ultima_avaliacao_em: new Date().toISOString(),
        ...(manut.length ? { ultima_manutencao: today, proxima_manutencao: nextMaintenance(today, p.periodicidade_manut) } : {}) }).eq("id", p.id);
      // Replacement tasks resolved during this visit.
      const resolver = Array.isArray(b.resolver_ocorrencias) ? b.resolver_ocorrencias.filter((x: unknown) => UUID.test(String(x))) : [];
      if (resolver.length) await admin.from("maintenance_schedule").update({ status: "concluida", completed_date: today, resolvida_schedule_id: s.id })
        .in("id", resolver).eq("comodato_id", p.id).eq("tipo_os", "substituicao").in("status", ["agendada", "em_andamento"]);
      let pedidoId: string | null = null;
      if (b.precisa_substituir) {
        const { data: prior } = await admin.from("maintenance_schedule").select("id").eq("origem_evidencia_id", av.id).maybeSingle();
        if (!prior) {
          // Replacement = work order (tipo_os substituicao) on the existing Manutenções module; urgent ones await manager approval.
          const { data: os } = await admin.from("maintenance_schedule").insert({ organization_id: s.organization_id, client_id: s.client_id, comodato_id: p.id,
            tipo_os: "substituicao", maintenance_type: "corretiva", status: "agendada", scheduled_date: today, title: `Substituir: ${itemTxt}`,
            description: `${p.localizacao_interna ?? "Ponto"} (${ESTADO_LABEL[b.estado]})`, item_product_id: item?.id ?? null, item_descricao: itemTxt,
            quantidade: txt(String(b.quantidade ?? "1"), 4) || "1", urgente: !!b.urgente, aprovacao_status: b.urgente ? "pendente" : null,
            origem_evidencia_id: av.id, assigned_to: s.assigned_to ?? user.id, created_by: user.id, linha_produto: p.linha_produto ?? null, fabricante: p.fabricante ?? null })
            .select("id").single();
          if (os && b.urgente) {
            pedidoId = os.id;
            bg(teamAlert(admin, s.organization_id, "pedido_emergencial", ocorrenciaUrgenteMessage({ cliente: s.clients?.name ?? "", consultor,
              local: p.localizacao_interna ?? "Ponto", item: itemTxt, pedidoId: os.id }), { pedido_id: os.id }, { immediate: true, dedupeKey: "pedido_id",
              extraUserIds: s.assigned_to ? [s.assigned_to] : [] }));
          }
        }
      }
      return json({ ok: true, id: av.id, pedido_id: pedidoId });
    }
    case "localizacao_cliente": {
      const s = await loadVisit(b.schedule_id);
      if (!s || (!s.client_id && !s.lead_id)) return json({ error: "Visita não encontrada" }, 404);
      if (!podeGravarLocalizacao(s.clients, b.confirmar === true)) return json({ error: "Confirme para usar esta localização" }, 400);
      const { data: ck } = await admin.from("schedule_checkins").select("id, latitude, longitude").eq("schedule_id", s.id).maybeSingle();
      if (ck?.latitude == null) return json({ error: "O check-in não tem localização" }, 409);
      // Only fills a missing location; origin "checkin" records it came from the consultant's confirmed position.
      if (s.client_id) await admin.from("clients").update({ latitude: ck.latitude, longitude: ck.longitude, localizacao_origem: "checkin",
        localizacao_confirmada_em: new Date().toISOString() }).eq("id", s.client_id).is("latitude", null);
      else await admin.from("leads").update({ latitude: ck.latitude, longitude: ck.longitude, localizacao_origem: "checkin" }).eq("id", s.lead_id).is("latitude", null);
      await admin.from("schedules").update({ latitude: ck.latitude, longitude: ck.longitude }).eq("id", s.id);
      return json({ ok: true });
    }
    case "ocorrencia_status": {
      const map: Record<string, string> = { aberta: "agendada", separada: "em_andamento", cancelada: "cancelada" };
      if (!map[b.status]) return json({ error: "Status inválido" }, 400);
      const { data: oc } = await caller.from("maintenance_schedule").select("id").eq("id", b.id).eq("tipo_os", "substituicao").maybeSingle();
      if (!oc) return json({ error: "Pendência não encontrada" }, 404);
      if (b.status === "cancelada" && !privileged) return json({ error: "Só o gestor pode cancelar" }, 403);
      await admin.from("maintenance_schedule").update({ status: map[b.status] }).eq("id", oc.id).in("status", ["agendada", "em_andamento"]);
      return json({ ok: true });
    }
    case "pedido_decidir": {
      if (!privileged) return json({ error: "Só o gestor pode decidir" }, 403);
      const { data: ped } = await caller.from("maintenance_schedule").select("id, organization_id, client_id, comodato_id, aprovacao_status, created_by, assigned_to, title, description, clients(name)")
        .eq("id", b.id).eq("urgente", true).maybeSingle();
      if (!ped) return json({ error: "Pedido não encontrado" }, 404);
      if (ped.aprovacao_status !== "pendente") return json({ error: "Pedido já decidido" }, 409);
      const nowIso = new Date().toISOString();
      const nome = (ped as any).clients?.name ?? "";
      if (b.aprovar) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data ?? "") || !/^\d{2}:\d{2}$/.test(b.hora ?? "")) return json({ error: "Escolha data e horário" }, 400);
        const consultorId = uuidOrNull(b.consultor_id) ?? ped.assigned_to ?? ped.created_by;
        const { data: s, error } = await admin.from("schedules").insert({ organization_id: ped.organization_id, client_id: ped.client_id,
          title: `Manutenção emergencial — ${nome}`, scheduled_date: b.data, start_time: b.hora, status: "agendado",
          schedule_type: "manutencao", schedule_subtype: "MANUTENCAO", source: "emergencial", assigned_to: consultorId, created_by: user.id,
          confirmacao_status: "nao_aplicavel", notes: `${ped.title} — ${ped.description ?? ""}` }).select("id").single();
        if (error) { console.error("[base-instalada] pedido", error.code); return json({ error: "Não foi possível criar a visita" }, 400); }
        await admin.from("maintenance_schedule").update({ aprovacao_status: "aprovado", decidido_por: user.id, decidido_em: nowIso, schedule_id: s.id, scheduled_date: b.data, start_time: b.hora }).eq("id", ped.id);
        bg(teamAlert(admin, ped.organization_id, "pedido_emergencial_decidido", `✅ Visita emergencial aprovada: ${nome} em ${b.data.split("-").reverse().join("/")} às ${b.hora}.\nhttps://fera.exudustech.com.br/agenda?schedule=${s.id}`,
          { pedido_id: ped.id }, { immediate: true, extraUserIds: consultorId ? [consultorId] : [] }));
        return json({ ok: true, schedule_id: s.id });
      }
      const motivo = txt(b.motivo, 200);
      if (motivo.length < 3) return json({ error: "Informe o motivo da recusa" }, 400);
      await admin.from("maintenance_schedule").update({ aprovacao_status: "recusado", decidido_por: user.id, decidido_em: nowIso, motivo_recusa: motivo }).eq("id", ped.id);
      const quem = ped.assigned_to ?? ped.created_by;
      bg(teamAlert(admin, ped.organization_id, "pedido_emergencial_decidido", `Visita emergencial recusada: ${nome}. Motivo: ${motivo}`,
        { pedido_id: ped.id }, { immediate: true, extraUserIds: quem ? [quem] : [] }));
      return json({ ok: true });
    }
    case "importar_previa":
    case "importar": {
      // Preview and save share the same parsing, so what the manager approved is what gets written.
      if (!privileged) return json({ error: "Só o gestor pode importar" }, 403);
      const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500).filter((r: unknown) => r && typeof r === "object" && !Array.isArray(r)) : [];
      if (!rows.length) return json({ error: "A planilha não tem linhas" }, 400);
      const { data: existentes } = await admin.from("clients").select("id, name, city, document").eq("organization_id", org).limit(5000);
      const parsed = parseImportRows(rows, existentes ?? []);
      // Cities without a registered route never get an automatic visit: the client waits in "Aguardando data" for the manager.
      const { data: areasImp } = await admin.from("ekkoa_coverage_areas").select("name, city, dia_semana, zip_code_start, zip_code_end").eq("organization_id", org).eq("is_active", true);
      const semRota = (r: ImportRow) => !areaDoCliente(areasImp ?? [], r.cep, r.cidade);
      for (const r of parsed) if (!r.erro && semRota(r)) r.avisos = [...(r.avisos ?? []), AVISO_SEM_ROTA];
      if (b.action === "importar_previa") return json({ ok: true, linhas: parsed, novos: parsed.filter((r) => !r.erro).length });
      const { data: users } = await admin.from("profiles").select("user_id, name").eq("organization_id", org).eq("is_active", true);
      let criados = 0; let aguardando = 0; const ids: string[] = [];
      for (const r of parsed) {
        if (r.erro) continue;
        const cons = r.consultor ? (users ?? []).find((u: any) => (u.name ?? "").toLowerCase().includes(r.consultor!.toLowerCase())) : null;
        const { data: c, error } = await admin.from("clients").insert({ organization_id: org, name: r.cliente, company: r.cliente, razao_social: r.razao_social ?? null,
          document: r.cnpj ?? null, address: enderecoImportado(r), city: r.cidade, zip_code: r.cep ?? null, phone: r.telefone ?? null, email: r.email ?? null,
          ramo_atuacao: r.segmento ?? null, status: "active", origem: "base_existente", created_by: user.id, assigned_user_id: cons?.user_id ?? null }).select("id").single();
        if (error || !c) { console.error("[base-instalada] importar", error?.code); r.erro = "Não foi possível gravar"; continue; }
        criados++; ids.push(c.id);
        if (r.contato || r.telefone || r.email) await contatoImportado(admin, org, c.id, r, user.id);
        const foraRota = semRota(r);
        if (r.frequencia || foraRota) await admin.from("planos_manutencao").insert({ organization_id: org, client_id: c.id, frequencia: r.frequencia || "mensal", dia_semana: r.dia_semana,
          consultor_id: cons?.user_id ?? null, created_by: user.id, ...(foraRota ? { modo_agenda: "data", regra_data: "manual" } : {}) });
        if (foraRota) aguardando++;
      }
      // Coordinates from the address in the background (bounded); the 15-min scheduler retries whatever is left.
      bg((async () => { for (const id of ids.slice(0, 200)) await geocodeClient(admin, id).catch(() => null); })());
      return json({ ok: true, criados, aguardando_data: aguardando, client_ids: ids, linhas: parsed });
    }
    case "ativacao_previa":
    case "ativacao_criar": {
      if (!privileged) return json({ error: "Só o gestor pode gerar visitas de ativação" }, 403);
      const ids = Array.isArray(b.client_ids) ? [...new Set(b.client_ids.filter((x: unknown) => UUID.test(String(x))))].slice(0, 300) as string[] : [];
      if (!ids.length) return json({ error: "Escolha os clientes" }, 400);
      const consultorId = uuidOrNull(b.consultor_id);
      if (!consultorId) return json({ error: "Escolha o consultor" }, 400);
      const { data: cons } = await admin.from("profiles").select("user_id, name").eq("organization_id", org).eq("user_id", consultorId).eq("is_active", true).maybeSingle();
      if (!cons) return json({ error: "Consultor não encontrado nesta organização" }, 404);
      const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(b.desde ?? "") && b.desde >= hoje ? b.desde : addDias(hoje, 1);
      const max = maxPorDiaValido(b.max_por_dia);
      // Clients read with the caller's own access first.
      const { data: cls } = await caller.from("clients").select("id, name, city, zip_code, address, latitude, longitude, organization_id").in("id", ids);
      const clientes = (cls ?? []).filter((c: any) => c.organization_id === org);
      const [{ data: pts }, { data: abertas }, { data: areas }] = await Promise.all([
        admin.from("comodatos").select("client_id").eq("organization_id", org).in("client_id", clientes.map((c: any) => c.id)).in("status", ["ATIVO", "EM_TESTE", "RETIRADO"]),
        admin.from("schedules").select("client_id, scheduled_date").eq("organization_id", org).eq("ocorrencia_tipo", OCORRENCIA_ATIVACAO).in("client_id", clientes.map((c: any) => c.id))
          .in("status", ["agendado", "confirmado", "em_atendimento"]),
        admin.from("ekkoa_coverage_areas").select("name, city, dia_semana, zip_code_start, zip_code_end, horario_inicio, horario_fim").eq("organization_id", org).eq("is_active", true),
      ]);
      const comAparelho = new Set((pts ?? []).map((p: any) => p.client_id));
      const aberta = new Map((abertas ?? []).map((a: any) => [a.client_id, a.scheduled_date]));
      const fora: LinhaAtivacao[] = [];
      const elegiveis = clientes.filter((c: any) => {
        const base = { client_id: c.id, nome: c.name, cidade: c.city ?? null, regiao: null };
        if (comAparelho.has(c.id)) { fora.push({ ...base, erro: "Já tem aparelhos cadastrados" }); return false; }
        if (aberta.has(c.id)) { fora.push({ ...base, erro: `Já tem ativação marcada (${String(aberta.get(c.id)).split("-").reverse().join("/")})` }); return false; }
        return true;
      });
      const ate = addDias(desde, 95);
      const [{ data: ag }, { data: feriados }, google] = await Promise.all([
        admin.from("schedules").select("scheduled_date, start_time, end_time, ocorrencia_tipo").eq("organization_id", org).eq("assigned_to", consultorId)
          .gte("scheduled_date", desde).lte("scheduled_date", ate).in("status", ["agendado", "confirmado", "em_atendimento"]),
        admin.from("holidays").select("date, city").or(`organization_id.is.null,organization_id.eq.${org}`).gte("date", desde).lte("date", ate),
        googleOcupado(admin, org, desde, ate),
      ]);
      const existentesDia: Record<string, number> = {};
      for (const x of ag ?? []) if (x.ocorrencia_tipo === OCORRENCIA_ATIVACAO) existentesDia[x.scheduled_date] = (existentesDia[x.scheduled_date] ?? 0) + 1;
      const plano = planejarAtivacoes({ clientes: elegiveis.map((c: any) => ({ id: c.id, nome: c.name, cidade: c.city, cep: c.zip_code })), areas: areas ?? [], desde, maxPorDia: max,
        ocupados: (ag ?? []).filter((x: any) => x.start_time).map((x: any) => ({ data: x.scheduled_date, inicio: String(x.start_time).slice(0, 5), fim: x.end_time ? String(x.end_time).slice(0, 5) : null })),
        ativacoesExistentes: existentesDia, google, feriados: feriados ?? [] });
      const linhas = [...plano, ...fora];
      if (b.action === "ativacao_previa") return json({ ok: true, linhas, consultor: cons.name, desde, max_por_dia: max });
      let criadas = 0;
      // No route for the city: keep the client in "Aguardando data" (outside-the-route plan without a date) for the manager.
      for (const l of plano.filter((x) => x.erro === ERRO_SEM_ROTA)) {
        const { data: tem } = await admin.from("planos_manutencao").select("id").eq("client_id", l.client_id).eq("organization_id", org).eq("ativo", true).maybeSingle();
        if (!tem) await admin.from("planos_manutencao").insert({ organization_id: org, client_id: l.client_id, frequencia: "mensal", consultor_id: consultorId, created_by: user.id, modo_agenda: "data", regra_data: "manual" });
      }
      for (const l of plano) {
        if (l.erro || !l.data) continue;
        const c: any = clientes.find((x: any) => x.id === l.client_id);
        const { data: novo, error } = await admin.from("schedules").insert({ organization_id: org, client_id: l.client_id, title: `Ativação da base — ${l.nome}`,
          scheduled_date: l.data, start_time: l.hora, end_time: l.fim, duracao_min: 60, status: "agendado", schedule_type: "manutencao", schedule_subtype: "MANUTENCAO",
          ocorrencia_tipo: OCORRENCIA_ATIVACAO, source: "ativacao", assigned_to: consultorId, created_by: user.id, confirmacao_status: "nao_aplicavel",
          location: [c?.address, c?.city].filter(Boolean).join(", ") || null, zip_code: c?.zip_code ?? null, latitude: c?.latitude ?? null, longitude: c?.longitude ?? null,
          description: "Cadastrar os pontos e aparelhos já instalados: escanear a etiqueta, escolher o aparelho e tirar a foto. Não sai do estoque e não tem nota." })
          .select("id, ocorrencia_codigo").single();
        if (error) { console.error("[base-instalada] ativacao", error.code); l.erro = "Não foi possível criar"; continue; }
        Object.assign(l, { schedule_id: novo.id, codigo: novo.ocorrencia_codigo }); criadas++;
      }
      return json({ ok: true, criadas, linhas, consultor: cons.name });
    }
    case "agenda_cliente": {
      // "Atendimento por data (fora da rota)" or back to the route (manager). The client is read with the caller's own access first.
      if (!privileged) return json({ error: "Só o gestor pode definir o atendimento do cliente" }, 403);
      const clientId = uuidOrNull(b.client_id);
      const { data: cl } = clientId ? await caller.from("clients").select("id, name, organization_id, assigned_user_id, address, city, zip_code, latitude, longitude").eq("id", clientId).maybeSingle() : { data: null };
      if (!cl || cl.organization_id !== org) return json({ error: "Cliente não encontrado" }, 404);
      const hoje = hojeSP();
      const modo = b.modo === "data" ? "data" : "rota";
      if (modo === "data") { const e = agendaDataErro(b, hoje); if (e) return json({ error: e }, 400); }
      const regra = modo === "data" ? String(b.regra) : null;
      const campos: Record<string, unknown> = { modo_agenda: modo, regra_data: regra,
        proxima_data: regra === "manual" ? b.proxima_data : null, dia_mes: regra === "dia_mes" ? Number(b.dia_mes) : null,
        ...(regra === "intervalo" ? { frequencia: "personalizada", intervalo_dias: Number(b.intervalo_dias), data_inicio: hoje } : {}) };
      const consultorId = uuidOrNull(b.consultor_id);
      if (consultorId) {
        const { data: cons } = await admin.from("profiles").select("user_id").eq("organization_id", org).eq("user_id", consultorId).eq("is_active", true).maybeSingle();
        if (!cons) return json({ error: "Consultor não encontrado nesta organização" }, 404);
        campos.consultor_id = consultorId;
      }
      const { data: atual } = await admin.from("planos_manutencao").select("id").eq("client_id", cl.id).eq("organization_id", org).eq("ativo", true).maybeSingle();
      let planoId = atual?.id as string | undefined;
      if (atual) {
        // A new rule replaces the plan's future visits not started yet; the revisit below books the right one.
        await admin.from("schedules").update({ status: "cancelado", notes: "Atendimento do cliente alterado" }).eq("plano_manutencao_id", atual.id)
          .gte("scheduled_date", hoje).in("status", ["agendado", "confirmado"]).is("checkin_em", null);
        const { error } = await admin.from("planos_manutencao").update(campos).eq("id", atual.id);
        if (error) { console.error("[base-instalada] agenda", error.code); return json({ error: "Não foi possível salvar" }, 400); }
      } else {
        const { data: novo, error } = await admin.from("planos_manutencao").insert({ organization_id: org, client_id: cl.id, frequencia: "mensal", created_by: user.id, ...campos }).select("id").single();
        if (error) { console.error("[base-instalada] agenda", error.code); return json({ error: "Não foi possível salvar" }, 400); }
        planoId = novo.id;
      }
      const desde = regra === "manual" ? hoje : addDias(hoje, 1);
      const r = await agendarRevisitaCliente(admin, { org, clientId: cl.id, userId: user.id, desde });
      if (r.status !== "sem_aparelhos") return json({ ok: true, plano_id: planoId, revisita: r });
      // No devices yet (base still to activate): outside the route, the first visit is the activation on the informed date.
      if (modo !== "data") return json({ ok: true, plano_id: planoId, revisita: r });
      const ctx = await contextoRevisita(admin, org, cl.id, desde);
      const data = proximaPassagem(agendaDoPlano(ctx.plano, []), desde, ctx.bloqueado);
      if (!data) return json({ ok: true, plano_id: planoId, revisita: { status: "aguardando_data" } });
      const { data: ja } = await admin.from("schedules").select("id, scheduled_date").eq("client_id", cl.id).eq("organization_id", org).eq("ocorrencia_tipo", OCORRENCIA_ATIVACAO)
        .in("status", ["agendado", "confirmado"]).is("checkin_em", null).limit(1).maybeSingle();
      const consultorAtiv = (ctx.plano?.consultor_id as string | null) ?? cl.assigned_user_id ?? user.id;
      const hora = String(ctx.plano?.hora_inicio ?? "09:00").slice(0, 5);
      const row = { scheduled_date: data, start_time: hora, assigned_to: consultorAtiv };
      const res = ja ? await admin.from("schedules").update(row).eq("id", ja.id).select("id, ocorrencia_codigo").single()
        : await admin.from("schedules").insert({ ...row, organization_id: org, client_id: cl.id, title: `Ativação da base — ${cl.name}`, duracao_min: 60, status: "agendado",
          schedule_type: "manutencao", schedule_subtype: "MANUTENCAO", ocorrencia_tipo: OCORRENCIA_ATIVACAO, source: "ativacao", created_by: user.id, confirmacao_status: "nao_aplicavel",
          location: [cl.address, cl.city].filter(Boolean).join(", ") || null, zip_code: cl.zip_code ?? null, latitude: cl.latitude ?? null, longitude: cl.longitude ?? null,
          description: "Cadastrar os pontos e aparelhos já instalados: escanear a etiqueta, escolher o aparelho e tirar a foto. Não sai do estoque e não tem nota." }).select("id, ocorrencia_codigo").single();
      if (res.error) { console.error("[base-instalada] agenda ativacao", res.error.code); return json({ error: "Não foi possível agendar a ativação" }, 400); }
      return json({ ok: true, plano_id: planoId, revisita: { status: ja ? "reagendada" : "agendada", data, schedule_id: res.data.id, codigo: res.data.ocorrencia_codigo, ativacao: true } });
    }
  }
  return json({ error: "Requisição inválida" }, 400);
});

/** Spreadsheet contact → tenant person (reused by phone) linked as the client's primary contact (empresa_contatos). */
// deno-lint-ignore no-explicit-any
async function contatoImportado(admin: any, org: string, clientId: string, r: ImportRow, userId: string) {
  try {
    const fone = r.telefone ? `55${r.telefone}` : null;
    let pessoaId: string | null = null;
    if (fone) {
      const { data: p } = await admin.from("pessoas").select("id").eq("organization_id", org).or(`whatsapp.eq.${fone},telefone.eq.${fone},telefone.eq.${r.telefone}`).limit(1).maybeSingle();
      pessoaId = p?.id ?? null;
    }
    if (!pessoaId) {
      const { data: p, error } = await admin.from("pessoas").insert({ organization_id: org, nome: r.contato || r.cliente, telefone: fone, whatsapp: fone, email: r.email ?? null }).select("id").single();
      if (error) { console.error("[base-instalada] pessoa", error.code); return; }
      pessoaId = p.id;
    }
    const { error } = await admin.from("empresa_contatos").insert({ organization_id: org, pessoa_id: pessoaId, client_id: clientId, is_primary: true, created_by: userId });
    if (error) console.error("[base-instalada] contato", error.code);
  } catch { console.error("[base-instalada] contato falhou"); }
}

// ─── Numbered QR labels (10/11) ─────────────────────────────────────────────────────────────────────────────────────────
// The number belongs to the device (comodatos row) forever; linking happens by scanning at separation or inside the open occurrence.
const ETQ = "id, organization_id, client_id, lead_id, product_id, refil_product_id, status, quantidade, localizacao_interna, etiqueta_numero, ocorrencia_schedule_id, reserva_os_id, periodicidade_manut, proxima_manutencao, ultima_manutencao, linha_produto, fabricante, dispenser_family_id, cidade, estado, endereco_instalacao, aparelho_descricao, notes";
// deno-lint-ignore no-explicit-any
type Ctx = { admin: any; caller: any; user: { id: string }; org: string; privileged: boolean; roleSet: Set<string>; loadVisit: (id: unknown) => Promise<any>; productOk: (id: string | null) => Promise<any> };

// deno-lint-ignore no-explicit-any
async function etiqueta(b: Record<string, any>, x: Ctx): Promise<Response> {
  const { admin, user, org } = x;
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const usado = (n: number) => json({ error: `Etiqueta nº ${formatEtiqueta(n)} já pertence a outro aparelho` }, 409);
  // Fera controls the numbering: a new number must come from a released lot (or the demo range).
  const foraDoLote = async (n: number) => {
    const { data } = await admin.from("etiqueta_faixas").select("inicio, fim").eq("organization_id", org).lte("inicio", n).gte("fim", n).limit(1);
    return numeroEmLote(n, data ?? []) ? null : json({ error: `Etiqueta nº ${formatEtiqueta(n)} não pertence a nenhum lote liberado. Confira o número.` }, 409);
  };
  const porNumero = async (n: number) => (await admin.from("comodatos").select(ETQ).eq("organization_id", org).eq("etiqueta_numero", n).maybeSingle()).data as any;
  const doLocal = (s: any, c: any) => !!c && (s.client_id ? c.client_id === s.client_id : !c.client_id && c.lead_id === s.lead_id);
  const evento = (s: any, comodatoId: string, texto: string, foto?: string | null) => admin.from("schedule_evidencias").insert({ organization_id: s.organization_id,
    schedule_id: s.id, comodato_id: comodatoId, tipo: "evento", observacoes: texto.slice(0, 500), foto_path: foto || null, itens: [], autor_id: user.id });
  const visitaAberta = async () => {
    const s = await x.loadVisit(b.schedule_id);
    if (!s || (!s.client_id && !s.lead_id)) return { erro: json({ error: "Ocorrência não encontrada" }, 404) };
    if (s.status !== "em_atendimento") return { erro: json({ error: "Faça o check-in da ocorrência antes" }, 409) };
    return { s };
  };
  const pontoDaVisita = async (s: any, id: unknown) => {
    if (!UUID.test(String(id ?? ""))) return null;
    const { data } = await admin.from("comodatos").select(ETQ).eq("id", id).eq("organization_id", s.organization_id).maybeSingle();
    return doLocal(s, data) ? data : null;
  };
  const dividir = async (id: string) => (await admin.rpc("comodato_separar_unidade", { _id: id, _org: org })).data as string | null;
  const salvar = async (q: Promise<{ error: any }>, n?: number) => {
    const { error } = await q;
    if (!error) return null;
    if (error.code === "23505" && n) return usado(n);
    console.error("[base-instalada] etiqueta", error.code);
    return json({ error: error.message?.includes("pertence ao aparelho") ? "O número da etiqueta pertence ao aparelho e não pode ser trocado" : "Não foi possível salvar" }, 400);
  };
  const fotoOk = (s: any, foto: string) => !foto || foto.startsWith(`${s.organization_id}/${s.id}/`);
  const nome = (id?: string | null) => id ? admin.from("products").select("name").eq("id", id).maybeSingle().then((r: any) => r.data?.name ?? "Aparelho") : Promise.resolve("Aparelho");

  switch (b.action) {
    case "etiqueta_info": {
      const n = parseEtiqueta(b.numero);
      if (!n) return json({ error: "Número de etiqueta inválido" }, 400);
      const c = await porNumero(n);
      let s: any = null;
      if (b.schedule_id) s = await x.loadVisit(b.schedule_id);
      const deste = s ? doLocal(s, c) : false;
      let cliente: string | null = null;
      if (c?.client_id) cliente = (await admin.from("clients").select("name").eq("id", c.client_id).maybeSingle()).data?.name ?? null;
      else if (c?.lead_id) { const { data: l } = await admin.from("leads").select("empresa_nome, company, title").eq("id", c.lead_id).maybeSingle(); cliente = l?.empresa_nome ?? l?.company ?? l?.title ?? null; }
      const ap = c ? { id: c.id, status: c.status, status_label: STATUS_APARELHO_LABEL[c.status] ?? c.status, local: c.localizacao_interna, product_id: c.product_id,
        aparelho: c.product_id ? await nome(c.product_id) : c.aparelho_descricao, cliente, deste_local: deste } : null;
      let { acoes, aviso } = s ? acoesEtiqueta(s.operacao_material, c ? { status: c.status, deste_local: deste } : null) : { acoes: [] as ReturnType<typeof acoesEtiqueta>["acoes"], aviso: undefined as string | undefined };
      // Activation of the existing base: a free label goes on a device already at the client; stock devices are not installed here.
      if (s?.ocorrencia_tipo === OCORRENCIA_ATIVACAO && s.client_id) {
        if (!c) { acoes = ["instalar", "vincular"]; aviso = "Ativação da base: o aparelho já está no cliente — não sai do estoque, sem nota."; }
        else if (c.status === "ENCERRADO") { acoes = []; aviso = "Esta etiqueta é de um aparelho do estoque. Na ativação, cole uma etiqueta nova no aparelho que já está no cliente."; }
      }
      return json({ ok: true, numero: n, aparelho: ap, acoes, aviso: aviso ?? null, ativacao: s?.ocorrencia_tipo === OCORRENCIA_ATIVACAO });
    }
    case "etiqueta_vincular": {
      const { s, erro } = await visitaAberta(); if (erro) return erro;
      const n = parseEtiqueta(b.numero); if (!n) return json({ error: "Número de etiqueta inválido" }, 400);
      if (await porNumero(n)) return usado(n);
      { const e = await foraDoLote(n); if (e) return e; }
      const p = await pontoDaVisita(s, b.comodato_id);
      if (!p || !["ATIVO", "EM_TESTE"].includes(p.status) || p.etiqueta_numero) return json({ error: "Escolha um aparelho instalado sem número" }, 404);
      const alvo = await dividir(p.id) ?? p.id;
      const e = await salvar(admin.from("comodatos").update({ etiqueta_numero: n }).eq("id", alvo).is("etiqueta_numero", null), n); if (e) return e;
      await evento(s, alvo, `🏷️ Etiqueta nº ${formatEtiqueta(n)} colada no aparelho (${p.localizacao_interna ?? "ponto"})`);
      return json({ ok: true, id: alvo, numero: n });
    }
    case "etiqueta_separar": {
      // Who separates: privileged, operacional (stock) or the visit's consultant. Visit/work order read with the caller's own access first.
      const n = parseEtiqueta(b.numero); if (!n) return json({ error: "Número de etiqueta inválido" }, 400);
      const pid = UUID.test(String(b.product_id ?? "")) ? String(b.product_id) : null;
      if (!pid) return json({ error: "Escolha qual item reservado é este aparelho" }, 400);
      let alvo: { client_id: string | null; lead_id: string | null; ocorrencia_schedule_id: string | null; reserva_os_id: string | null; qtd: number; dono: string | null; titulo: string };
      if (b.schedule_id) {
        if (!UUID.test(String(b.schedule_id))) return json({ error: "Requisição inválida" }, 400);
        const { data: s } = await x.caller.from("schedules").select("id, organization_id, status, assigned_to, client_id, lead_id, itens, title").eq("id", b.schedule_id).maybeSingle();
        if (!s || s.organization_id !== org || !["agendado", "confirmado", "em_atendimento"].includes(s.status)) return json({ error: "Ocorrência não encontrada" }, 404);
        const qtd = ((s.itens ?? []) as any[]).filter((i) => i?.product_id === pid).reduce((a, i) => a + qtdAparelhos(i.quantidade), 0);
        if (!qtd) return json({ error: "Este aparelho não está reservado nesta ocorrência" }, 409);
        alvo = { client_id: s.client_id, lead_id: s.client_id ? null : s.lead_id, ocorrencia_schedule_id: s.id, reserva_os_id: null, qtd, dono: s.assigned_to, titulo: s.title };
      } else if (UUID.test(String(b.os_id ?? ""))) {
        const { data: o } = await x.caller.from("maintenance_schedule").select("id, organization_id, status, assigned_to, client_id, item_product_id, quantidade, title").eq("id", b.os_id).eq("tipo_os", "substituicao").maybeSingle();
        if (!o || o.organization_id !== org || !["agendada", "em_andamento"].includes(o.status)) return json({ error: "Pendência não encontrada" }, 404);
        if (o.item_product_id !== pid) return json({ error: "Este aparelho não está reservado nesta pendência" }, 409);
        alvo = { client_id: o.client_id, lead_id: null, ocorrencia_schedule_id: null, reserva_os_id: o.id, qtd: qtdAparelhos(o.quantidade), dono: o.assigned_to, titulo: o.title };
      } else return json({ error: "Requisição inválida" }, 400);
      if (!x.privileged && !x.roleSet.has("operacional") && alvo.dono !== user.id) return json({ error: "Sem permissão para separar este material" }, 403);
      let q = admin.from("comodatos").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "SEPARADO").eq("product_id", pid);
      q = alvo.ocorrencia_schedule_id ? q.eq("ocorrencia_schedule_id", alvo.ocorrencia_schedule_id) : q.eq("reserva_os_id", alvo.reserva_os_id);
      const { count } = await q;
      if ((count ?? 0) >= alvo.qtd) return json({ error: `Os ${alvo.qtd} aparelho(s) deste item já foram separados` }, 409);
      const c = await porNumero(n);
      const campos = { status: "SEPARADO", client_id: alvo.client_id, lead_id: alvo.lead_id, ocorrencia_schedule_id: alvo.ocorrencia_schedule_id, reserva_os_id: alvo.reserva_os_id };
      if (c) {
        // A labelled device back in stock can be separated again (same model only).
        if (c.status !== "ENCERRADO") return usado(n);
        if (c.product_id && c.product_id !== pid) return json({ error: `A etiqueta nº ${formatEtiqueta(n)} é de outro modelo (${await nome(c.product_id)})` }, 409);
        const e = await salvar(admin.from("comodatos").update({ ...campos, product_id: pid, data_fim: null, retirada_schedule_id: null, origem: "campo" }).eq("id", c.id)); if (e) return e;
        return json({ ok: true, id: c.id, numero: n });
      }
      { const e = await foraDoLote(n); if (e) return e; }
      const { data: novo, error } = await admin.from("comodatos").insert({ organization_id: org, ...campos, product_id: pid, quantidade: "1", etiqueta_numero: n, origem: "campo",
        periodicidade_manut: "mensal", created_by: user.id, notes: `Separado para: ${alvo.titulo}`.slice(0, 300) }).select("id").single();
      if (error) return (await salvar(Promise.resolve({ error }), n))!;
      return json({ ok: true, id: novo.id, numero: n });
    }
    case "etiqueta_desfazer_separacao": {
      if (!UUID.test(String(b.comodato_id ?? ""))) return json({ error: "Requisição inválida" }, 400);
      const { data: c } = await x.caller.from("comodatos").select("id, status, organization_id").eq("id", b.comodato_id).maybeSingle();
      if (!c || c.organization_id !== org || c.status !== "SEPARADO") return json({ error: "Aparelho separado não encontrado" }, 404);
      if (!x.privileged && !x.roleSet.has("operacional")) {
        const { data: s } = await admin.from("comodatos").select("schedules!comodatos_ocorrencia_schedule_id_fkey(assigned_to)").eq("id", c.id).maybeSingle();
        if ((s as any)?.schedules?.assigned_to !== user.id) return json({ error: "Sem permissão" }, 403);
      }
      const { count } = await admin.from("schedule_evidencias").select("id", { count: "exact", head: true }).eq("comodato_id", c.id);
      // A device with history keeps its row (and number) and just goes back to stock.
      const r = count ? await admin.from("comodatos").update({ status: "ENCERRADO", ocorrencia_schedule_id: null, reserva_os_id: null }).eq("id", c.id)
        : await admin.from("comodatos").delete().eq("id", c.id);
      if (r.error) { console.error("[base-instalada] desfazer", r.error.code); return json({ error: "Não foi possível desfazer" }, 400); }
      return json({ ok: true });
    }
    case "etiqueta_instalar": {
      const { s, erro } = await visitaAberta(); if (erro) return erro;
      const n = parseEtiqueta(b.numero); if (!n) return json({ error: "Número de etiqueta inválido" }, 400);
      const foto = txt(b.foto_path, 300);
      if (!fotoOk(s, foto)) return json({ error: "Foto inválida" }, 400);
      // Optional nameplate photo and serial number of the installed device (no OCR); kept when not sent.
      const plaqueta = txt(b.foto_plaqueta_path, 300), serie = txt(b.numero_serie, 60);
      if (!fotoOk(s, plaqueta)) return json({ error: "Foto da plaqueta inválida" }, 400);
      const c = await porNumero(n);
      if (c && !(c.status === "ENCERRADO" || (["SEPARADO", "PREVISTO"].includes(c.status) && doLocal(s, c))))
        return c.status === "SEPARADO" || !doLocal(s, c) ? usado(n) : json({ error: "Este aparelho já está instalado" }, 409);
      const ativacao = s.ocorrencia_tipo === OCORRENCIA_ATIVACAO && !!s.client_id;
      if (ativacao && c?.status === "ENCERRADO") return json({ error: "Esta etiqueta é de um aparelho do estoque. Na ativação, cole uma etiqueta nova no aparelho que já está no cliente." }, 409);
      const previsto = b.comodato_id ? await pontoDaVisita(s, b.comodato_id) : null;
      if (b.comodato_id && (!previsto || previsto.status !== "PREVISTO")) return json({ error: "Ponto previsto não encontrado" }, 404);
      const local = txt(b.localizacao_interna, 120) || previsto?.localizacao_interna || c?.localizacao_interna || "";
      const err = pontoErro({ localizacao_interna: local, foto_path: foto });
      if (err) return json({ error: err }, 400);
      const prod = (await x.productOk(uuidOrNull(b.product_id)))?.id ?? c?.product_id ?? previsto?.product_id ?? null;
      if (!prod) return json({ error: "Escolha o aparelho" }, 400);
      const refil = (await x.productOk(uuidOrNull(b.refil_product_id)))?.id ?? previsto?.refil_product_id ?? c?.refil_product_id ?? null;
      const { data: end } = s.client_id ? await admin.from("clients").select("city, state, address").eq("id", s.client_id).maybeSingle()
        : await admin.from("leads").select("city, address:endereco").eq("id", s.lead_id).maybeSingle();
      const status = statusPontoNovo(s);
      const campos = { client_id: s.client_id ?? null, lead_id: s.client_id ? null : s.lead_id, status, product_id: prod, refil_product_id: refil, localizacao_interna: local,
        foto_path: foto, ocorrencia_schedule_id: s.id, reserva_os_id: null, retirada_schedule_id: null, data_inicio: hoje, data_fim: null, quantidade: "1",
        cidade: end?.city ?? null, estado: (end as any)?.state ?? null, endereco_instalacao: (end as any)?.address ?? null,
        estado_atual: "verde", ultima_avaliacao_em: new Date().toISOString(), periodicidade_manut: previsto?.periodicidade_manut ?? c?.periodicidade_manut ?? "mensal",
        ...(serie ? { numero_serie: serie } : {}), ...(plaqueta ? { foto_plaqueta_path: plaqueta } : {}) };
      let id: string;
      if (c) {
        // A stock device installed again enters normal stock accounting.
        const e = await salvar(admin.from("comodatos").update(c.status === "ENCERRADO" ? { ...campos, origem: "campo" } : campos).eq("id", c.id)); if (e) return e;
        id = c.id;
      } else {
        { const e = await foraDoLote(n); if (e) return e; }
        const { data: novo, error } = await admin.from("comodatos").insert({ organization_id: s.organization_id, ...campos, etiqueta_numero: n,
          origem: ativacao ? "base_existente" : "campo", created_by: user.id })
          .select("id").single();
        if (error) return (await salvar(Promise.resolve({ error }), n))!;
        id = novo.id;
      }
      // The planned point is absorbed by the device: one less unit to install.
      if (previsto) {
        const q = qtdAparelhos(previsto.quantidade);
        await admin.from("comodatos").update(q > 1 ? { quantidade: String(q - 1) }
          : { status: "ENCERRADO", notes: [previsto.notes, `Ponto previsto instalado com o aparelho nº ${formatEtiqueta(n)}`].filter(Boolean).join("\n") }).eq("id", previsto.id);
      }
      // Leaves already evaluated (OK) with the installation photo, so closing never waits on a hidden step.
      await admin.from("schedule_evidencias").insert({ organization_id: s.organization_id, schedule_id: s.id, comodato_id: id, estado: "verde", itens: [], precisa_substituir: false,
        foto_path: foto, observacoes: `Instalação do aparelho nº ${formatEtiqueta(n)}`, autor_id: user.id });
      await evento(s, id, ativacao && !c ? `🏷️ Aparelho nº ${formatEtiqueta(n)} já instalado ativado (base existente, sem estoque/nota) em ${local}`
        : `🏷️ Aparelho nº ${formatEtiqueta(n)} instalado (${status === "EM_TESTE" ? "em teste" : "ativo"}) em ${local}`);
      return json({ ok: true, id, numero: n, status });
    }
    case "etiqueta_trocar_ponto": {
      const { s, erro } = await visitaAberta(); if (erro) return erro;
      const p = await pontoDaVisita(s, b.comodato_id);
      if (!p || !["ATIVO", "EM_TESTE"].includes(p.status)) return json({ error: "Aparelho não encontrado neste cliente" }, 404);
      const local = txt(b.localizacao_interna, 120);
      if (local.length < 2) return json({ error: "Informe o novo local do aparelho" }, 400);
      const foto = txt(b.foto_path, 300); if (!fotoOk(s, foto)) return json({ error: "Foto inválida" }, 400);
      const e = await salvar(admin.from("comodatos").update({ localizacao_interna: local, ...(foto ? { foto_path: foto } : {}) }).eq("id", p.id)); if (e) return e;
      await evento(s, p.id, `↔️ Trocado de ponto: ${p.localizacao_interna ?? "—"} → ${local}`, foto);
      return json({ ok: true });
    }
    case "etiqueta_retirar": {
      const { s, erro } = await visitaAberta(); if (erro) return erro;
      const p = await pontoDaVisita(s, b.comodato_id);
      if (!p) return json({ error: "Aparelho não encontrado neste cliente" }, 404);
      if (p.status === "EM_TESTE") return json({ error: "Aparelho em teste: feche o teste como não aprovado (a nota de devolução devolve ao estoque)" }, 409);
      if (p.status !== "ATIVO") return json({ error: "Só um aparelho ativo pode ser retirado" }, 409);
      const motivo = txt(b.motivo, 200);
      if (motivo.length < 3) return json({ error: "Informe o motivo da retirada" }, 400);
      const e = await salvar(admin.from("comodatos").update({ status: "ENCERRADO", data_fim: hoje, retirada_schedule_id: s.id,
        notes: [p.notes, `Retirado: ${motivo}`].filter(Boolean).join("\n").slice(0, 2000) }).eq("id", p.id)); if (e) return e;
      await evento(s, p.id, `📦 Retirado do ponto ${p.localizacao_interna ?? ""} — volta ao estoque. Motivo: ${motivo}`);
      return json({ ok: true });
    }
    case "etiqueta_substituir": {
      const { s, erro } = await visitaAberta(); if (erro) return erro;
      const velho = await pontoDaVisita(s, b.comodato_id);
      if (!velho || !["ATIVO", "EM_TESTE"].includes(velho.status)) return json({ error: "Aparelho a substituir não encontrado" }, 404);
      const n = parseEtiqueta(b.numero); if (!n) return json({ error: "Escaneie a etiqueta do aparelho novo" }, 400);
      if (n === velho.etiqueta_numero) return json({ error: "Escaneie a etiqueta do aparelho NOVO" }, 400);
      const foto = txt(b.foto_path, 300);
      if (!foto) return json({ error: "Tire a foto do aparelho novo instalado" }, 400);
      if (!fotoOk(s, foto)) return json({ error: "Foto inválida" }, 400);
      const c = await porNumero(n);
      if (c && !(c.status === "ENCERRADO" || (c.status === "SEPARADO" && (doLocal(s, c) || (!c.client_id && !c.lead_id))))) return usado(n);
      if (!c) { const e = await foraDoLote(n); if (e) return e; }
      const prod = (await x.productOk(uuidOrNull(b.product_id)))?.id ?? c?.product_id ?? velho.product_id;
      // The removed device waits for the return invoice (RETIRADO keeps it out of stock until the signed return arrives).
      const e1 = await salvar(admin.from("comodatos").update({ status: "RETIRADO", data_fim: hoje, retirada_schedule_id: s.id }).eq("id", velho.id)); if (e1) return e1;
      const campos = { client_id: velho.client_id, lead_id: velho.lead_id, status: velho.status, product_id: prod, refil_product_id: velho.refil_product_id,
        localizacao_interna: velho.localizacao_interna, foto_path: foto, ocorrencia_schedule_id: s.id, reserva_os_id: null, retirada_schedule_id: null, data_inicio: hoje, data_fim: null,
        quantidade: "1", periodicidade_manut: velho.periodicidade_manut ?? "mensal", proxima_manutencao: velho.proxima_manutencao, ultima_manutencao: hoje,
        cidade: velho.cidade, estado: velho.estado, endereco_instalacao: velho.endereco_instalacao, linha_produto: velho.linha_produto, fabricante: velho.fabricante,
        estado_atual: "verde", ultima_avaliacao_em: new Date().toISOString() };
      let id: string;
      if (c) { const e = await salvar(admin.from("comodatos").update(campos).eq("id", c.id)); if (e) return e; id = c.id; }
      else {
        const { data: novo, error } = await admin.from("comodatos").insert({ organization_id: s.organization_id, ...campos, etiqueta_numero: n, origem: "campo", created_by: user.id }).select("id").single();
        if (error) { await admin.from("comodatos").update({ status: velho.status, data_fim: null, retirada_schedule_id: null }).eq("id", velho.id); return (await salvar(Promise.resolve({ error }), n))!; }
        id = novo.id;
      }
      await admin.from("schedule_evidencias").insert({ organization_id: s.organization_id, schedule_id: s.id, comodato_id: id, estado: "verde", itens: ["aparelho_trocado"],
        precisa_substituir: false, foto_path: foto, observacoes: `Entrou no lugar do aparelho ${velho.etiqueta_numero ? `nº ${formatEtiqueta(velho.etiqueta_numero)}` : "sem número"}`, autor_id: user.id });
      await evento(s, velho.id, `🔁 Substituído pelo aparelho nº ${formatEtiqueta(n)} — aguardando nota de devolução`);
      await evento(s, id, `🔁 Instalado no lugar do aparelho ${velho.etiqueta_numero ? `nº ${formatEtiqueta(velho.etiqueta_numero)}` : "sem número"} (${velho.localizacao_interna ?? "ponto"})`, foto);
      return json({ ok: true, id, numero: n });
    }
  }
  return json({ error: "Requisição inválida" }, 400);
}
