// Installed base (Lote 11): field client/point registration, point evaluations, occurrences, emergency requests, import.
// Every write first reads the target with the caller's own access (RLS), then writes with the service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { avaliacaoErro, ESTADO_LABEL, ocorrenciaUrgenteMessage, parseImportRows, pontoErro, podeGravarLocalizacao } from "../_shared/base-instalada.ts";
import { nextMaintenance } from "../_shared/visit-exec.ts";
import { teamAlert } from "../_shared/team-alert.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const uuidOrNull = (v: unknown) => typeof v === "string" && UUID.test(v) ? v : null;
const ACTIONS = ["buscar_local", "nova_manutencao", "ponto_novo", "avaliar", "localizacao_cliente", "ocorrencia_status", "pedido_decidir", "importar"];
const MANUT = ["refil_reposto", "limpeza", "ajuste"];

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

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
    const { data: s } = await caller.from("schedules").select("id, organization_id, status, assigned_to, created_by, client_id, clients(name, latitude)").eq("id", id).maybeSingle();
    if (!s) return null;
    if (!privileged && s.assigned_to !== user.id && !(s.assigned_to === null && s.created_by === user.id)) return null;
    return s as any;
  };
  const productOk = async (id: string | null) => {
    if (!id) return null;
    const { data } = await admin.from("products").select("id, name").eq("id", id).eq("organization_id", org).maybeSingle();
    return data;
  };

  switch (b.action) {
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
      if (!s || !s.client_id) return json({ error: "Visita não encontrada" }, 404);
      if (s.status !== "em_atendimento") return json({ error: "Inicie o atendimento antes" }, 409);
      const foto = txt(b.foto_path, 300);
      if (foto && !foto.startsWith(`${s.organization_id}/${s.id}/`)) return json({ error: "Foto inválida" }, 400);
      const qtd = txt(String(b.quantidade ?? "1"), 4) || "1";
      const err = pontoErro({ localizacao_interna: b.localizacao_interna, foto_path: foto, quantidade: qtd });
      if (err) return json({ error: err }, 400);
      const disp = await productOk(uuidOrNull(b.product_id)); const refil = await productOk(uuidOrNull(b.refil_product_id));
      const { data: c } = await admin.from("clients").select("city, state, address").eq("id", s.client_id).maybeSingle();
      const { data, error } = await admin.from("comodatos").insert({ organization_id: s.organization_id, client_id: s.client_id, product_id: disp?.id ?? null,
        refil_product_id: refil?.id ?? null, quantidade: qtd, foto_path: foto, localizacao_interna: txt(b.localizacao_interna, 120), notes: txt(b.observacao, 500) || null,
        cidade: c?.city ?? null, estado: c?.state ?? null, endereco_instalacao: c?.address ?? null, status: "ATIVO", origem: "campo",
        periodicidade_manut: "mensal", data_inicio: new Date().toISOString().slice(0, 10), created_by: user.id }).select("id").single();
      if (error) { console.error("[base-instalada] ponto", error.code); return json({ error: "Não foi possível salvar o ponto" }, 400); }
      return json({ ok: true, id: data.id });
    }
    case "avaliar": {
      const s = await loadVisit(b.schedule_id);
      if (!s || !s.client_id) return json({ error: "Visita não encontrada" }, 404);
      if (s.status !== "em_atendimento") return json({ error: "Inicie o atendimento antes" }, 409);
      const { data: p } = await admin.from("comodatos").select("id, localizacao_interna, periodicidade_manut, products:product_id(name)")
        .eq("id", b.comodato_id).eq("client_id", s.client_id).eq("organization_id", s.organization_id).maybeSingle();
      if (!p) return json({ error: "Ponto não encontrado" }, 404);
      const foto = txt(b.foto_path, 300);
      if (foto && !foto.startsWith(`${s.organization_id}/${s.id}/`)) return json({ error: "Foto inválida" }, 400);
      const item = await productOk(uuidOrNull(b.item_product_id));
      const itemTxt = item?.name ?? txt(b.item_descricao, 160);
      const err = avaliacaoErro({ estado: b.estado, foto_path: foto, precisa_substituir: !!b.precisa_substituir, item: itemTxt });
      if (err) return json({ error: err }, 400);
      const manut = Array.isArray(b.manutencoes) ? b.manutencoes.filter((m: unknown) => MANUT.includes(m as string)) : [];
      const { data: av, error } = await admin.from("ponto_avaliacoes").upsert({ organization_id: s.organization_id, comodato_id: p.id, schedule_id: s.id, estado: b.estado,
        manutencoes: manut, precisa_substituir: !!b.precisa_substituir, foto_path: foto || null, observacao: txt(b.observacao, 500) || null, autor_id: user.id },
        { onConflict: "comodato_id,schedule_id" }).select("id").single();
      if (error) { console.error("[base-instalada] avaliar", error.code); return json({ error: "Não foi possível salvar" }, 400); }
      const today = new Date().toISOString().slice(0, 10);
      await admin.from("comodatos").update({ estado_atual: b.estado, ultima_avaliacao_em: new Date().toISOString(),
        ...(manut.length ? { ultima_manutencao: today, proxima_manutencao: nextMaintenance(today, p.periodicidade_manut) } : {}) }).eq("id", p.id);
      const resolver = Array.isArray(b.resolver_ocorrencias) ? b.resolver_ocorrencias.filter((x: unknown) => UUID.test(String(x))) : [];
      if (resolver.length) await admin.from("ocorrencias_ponto").update({ status: "resolvida", resolvida_em: new Date().toISOString(), resolvida_schedule_id: s.id })
        .in("id", resolver).eq("comodato_id", p.id).in("status", ["aberta", "separada"]);
      let pedidoId: string | null = null;
      if (b.precisa_substituir) {
        const { data: prior } = await admin.from("ocorrencias_ponto").select("id").eq("avaliacao_id", av.id).maybeSingle();
        if (!prior) {
          const { data: oc } = await admin.from("ocorrencias_ponto").insert({ organization_id: s.organization_id, client_id: s.client_id, comodato_id: p.id, avaliacao_id: av.id,
            item_product_id: item?.id ?? null, item_descricao: itemTxt, quantidade: txt(String(b.quantidade ?? "1"), 4) || "1", urgente: !!b.urgente,
            responsavel_id: s.assigned_to ?? user.id, created_by: user.id }).select("id").single();
          if (oc && b.urgente) {
            const { data: ped } = await admin.from("pedidos_visita_emergencial").insert({ organization_id: s.organization_id, client_id: s.client_id, ocorrencia_id: oc.id,
              motivo: `${p.localizacao_interna ?? "Ponto"}: ${itemTxt} (${ESTADO_LABEL[b.estado]})`, solicitado_por: user.id }).select("id").single();
            pedidoId = ped?.id ?? null;
            if (pedidoId) bg(teamAlert(admin, s.organization_id, "pedido_emergencial", ocorrenciaUrgenteMessage({ cliente: s.clients?.name ?? "", consultor,
              local: p.localizacao_interna ?? "Ponto", item: itemTxt, pedidoId }), { pedido_id: pedidoId }, { immediate: true, dedupeKey: "pedido_id",
              extraUserIds: s.assigned_to ? [s.assigned_to] : [] }));
          }
        }
      }
      return json({ ok: true, id: av.id, pedido_id: pedidoId });
    }
    case "localizacao_cliente": {
      const s = await loadVisit(b.schedule_id);
      if (!s || !s.client_id) return json({ error: "Visita não encontrada" }, 404);
      if (!podeGravarLocalizacao(s.clients, b.confirmar === true)) return json({ error: "Confirme para usar esta localização" }, 400);
      const { data: ck } = await admin.from("schedule_checkins").select("latitude, longitude").eq("schedule_id", s.id).maybeSingle();
      if (ck?.latitude == null) return json({ error: "O check-in não tem localização" }, 409);
      await admin.from("clients").update({ latitude: ck.latitude, longitude: ck.longitude, localizacao_origem: "checkin",
        localizacao_confirmada_em: new Date().toISOString() }).eq("id", s.client_id);
      await admin.from("schedules").update({ latitude: ck.latitude, longitude: ck.longitude }).eq("id", s.id);
      return json({ ok: true });
    }
    case "ocorrencia_status": {
      if (!["separada", "cancelada", "aberta"].includes(b.status)) return json({ error: "Status inválido" }, 400);
      const { data: oc } = await caller.from("ocorrencias_ponto").select("id").eq("id", b.id).maybeSingle();
      if (!oc) return json({ error: "Ocorrência não encontrada" }, 404);
      if (b.status === "cancelada" && !privileged) return json({ error: "Só o gestor pode cancelar" }, 403);
      await admin.from("ocorrencias_ponto").update({ status: b.status }).eq("id", oc.id).in("status", ["aberta", "separada"]);
      return json({ ok: true });
    }
    case "pedido_decidir": {
      if (!privileged) return json({ error: "Só o gestor pode decidir" }, 403);
      const { data: ped } = await caller.from("pedidos_visita_emergencial").select("id, organization_id, client_id, status, solicitado_por, motivo, clients(name)").eq("id", b.id).maybeSingle();
      if (!ped) return json({ error: "Pedido não encontrado" }, 404);
      if (ped.status !== "pendente") return json({ error: "Pedido já decidido" }, 409);
      const nowIso = new Date().toISOString();
      if (b.aprovar) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data ?? "") || !/^\d{2}:\d{2}$/.test(b.hora ?? "")) return json({ error: "Escolha data e horário" }, 400);
        const consultorId = uuidOrNull(b.consultor_id) ?? ped.solicitado_por;
        const { data: s, error } = await admin.from("schedules").insert({ organization_id: ped.organization_id, client_id: ped.client_id,
          title: `Manutenção emergencial — ${(ped as any).clients?.name ?? ""}`, scheduled_date: b.data, start_time: b.hora, status: "agendado",
          schedule_type: "manutencao", schedule_subtype: "MANUTENCAO", source: "emergencial", assigned_to: consultorId, created_by: user.id,
          confirmacao_status: "nao_aplicavel", notes: ped.motivo }).select("id").single();
        if (error) { console.error("[base-instalada] pedido", error.code); return json({ error: "Não foi possível criar a visita" }, 400); }
        await admin.from("pedidos_visita_emergencial").update({ status: "aprovado", decidido_por: user.id, decidido_em: nowIso, schedule_id: s.id }).eq("id", ped.id);
        bg(teamAlert(admin, ped.organization_id, "pedido_emergencial_decidido", `✅ Visita emergencial aprovada: ${(ped as any).clients?.name ?? ""} em ${b.data.split("-").reverse().join("/")} às ${b.hora}.\nhttps://fera.exudustech.com.br/agenda?schedule=${s.id}`,
          { pedido_id: ped.id }, { immediate: true, extraUserIds: consultorId ? [consultorId] : [] }));
        return json({ ok: true, schedule_id: s.id });
      }
      const motivo = txt(b.motivo, 200);
      if (motivo.length < 3) return json({ error: "Informe o motivo da recusa" }, 400);
      await admin.from("pedidos_visita_emergencial").update({ status: "recusado", decidido_por: user.id, decidido_em: nowIso, motivo_recusa: motivo }).eq("id", ped.id);
      bg(teamAlert(admin, ped.organization_id, "pedido_emergencial_decidido", `Visita emergencial recusada: ${(ped as any).clients?.name ?? ""}. Motivo: ${motivo}`,
        { pedido_id: ped.id }, { immediate: true, extraUserIds: ped.solicitado_por ? [ped.solicitado_por] : [] }));
      return json({ ok: true });
    }
    case "importar": {
      if (!privileged) return json({ error: "Só o gestor pode importar" }, 403);
      const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
      const { data: existentes } = await admin.from("clients").select("name, city").eq("organization_id", org);
      const parsed = parseImportRows(rows, existentes ?? []);
      const { data: users } = await admin.from("profiles").select("user_id, name").eq("organization_id", org).eq("is_active", true);
      let criados = 0;
      for (const r of parsed) {
        if (r.erro) continue;
        const cons = r.consultor ? (users ?? []).find((u: any) => (u.name ?? "").toLowerCase().includes(r.consultor!.toLowerCase())) : null;
        const { data: c } = await admin.from("clients").insert({ organization_id: org, name: r.cliente, company: r.cliente, city: r.cidade, status: "active",
          created_by: user.id, assigned_user_id: cons?.user_id ?? null }).select("id").single();
        if (!c) continue;
        await admin.from("planos_manutencao").insert({ organization_id: org, client_id: c.id, frequencia: r.frequencia, dia_semana: r.dia_semana,
          consultor_id: cons?.user_id ?? null, created_by: user.id });
        criados++;
      }
      return json({ ok: true, criados, linhas: parsed });
    }
  }
  return json({ error: "Requisição inválida" }, 400);
});
