// Field execution of an agenda visit: checkin, evidencia, checkout, nao_realizado, foto_url.
// The schedule is read with the caller's own access first; only the assigned consultant (or a manager) can act.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkinAlertMessage, checkoutMessage, durationMinutes, evaluateCheckin, isTechnical, NAO_REALIZADO, NAO_REALIZADO_LABEL,
  NEXT_LABEL, nextMaintenance, duracaoComTermino, requiresPhoto, RESULT_LABEL, stageForCheckout, validateCheckout, GEOLOCATION_ERRORS,
} from "../_shared/visit-exec.ts";
import { areaDoCliente, FREQ_RAPIDAS, parseDiaSemana, pontosPendentes, primeiroDiaRota, proximaVisitaPlano } from "../_shared/base-instalada.ts";
import { teamAlert } from "../_shared/team-alert.ts";
import { serviceLabel } from "../_shared/schedule-notify.ts";
import { geocodeClient, geocodeLead, geocodeSchedule } from "../_shared/geocode.ts";
import { checkinBloqueadoPorNota, FERA_URL, prontidaoLabel } from "../_shared/prontidao.ts";
import { exigeColeta, pendenciasColeta } from "../_shared/coleta.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITENS = ["refil_reposto", "problema_encontrado", "aparelho_trocado", "limpeza_realizada", "treinamento"];
const txt = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;

/** Replacement closing (05/11). Creates billing tasks and links the signature collection to the client's next route visit. */
async function fecharSubstituicao(admin: any, s: any, resultado: "nao_trocou" | "trocou", userId: string, timeline: (t: string, r: string, p?: string | null) => Promise<void>) {
  const now = new Date();
  await admin.from("schedules").update({ substituicao_resultado: resultado }).eq("id", s.id);
  const { data: emit } = await admin.from("tarefas_faturamento").select("*").eq("schedule_id", s.id).eq("acao", "emitir").maybeSingle();
  const { data: oss } = await admin.from("maintenance_schedule").select("id, inventory_item_id").eq("organization_id", s.organization_id).eq("tipo_os", "substituicao")
    .in("status", ["agendada", "em_andamento"]).or(`schedule_id.eq.${s.id}${s.client_id ? `,client_id.eq.${s.client_id}` : ""}`).limit(5);
  const os = (oss ?? [])[0] ?? null;
  const base = emit ? { organization_id: s.organization_id, schedule_id: s.id, client_id: emit.client_id, lead_id: emit.lead_id, tipo_operacao: "substituicao",
    itens: emit.itens, empresa_nome: emit.empresa_nome, razao_social: emit.razao_social, cnpj: emit.cnpj, cnpj_verificado: emit.cnpj_verificado, endereco: emit.endereco,
    contato: emit.contato, data_visita: emit.data_visita, referencia_tarefa_id: emit.id, ordem_servico_id: os?.id ?? null } : null;
  if (resultado === "nao_trocou") {
    if (base) {
      const desde = emit.concluida_em ? new Date(emit.concluida_em) : now;
      await admin.from("tarefas_faturamento").upsert({ ...base, acao: "cancelar", tipo_nota: emit.tipo_nota, prazo: new Date(desde.getTime() + 24 * 3_600_000).toISOString(),
        observacao: `Cancelar a nota ${emit.numero_nota ?? ""} — aparelho não foi trocado e volta ao estoque`.trim() }, { onConflict: "schedule_id,acao" });
    }
    if (os) {
      await admin.from("maintenance_schedule").update({ status: "concluida", completed_date: now.toISOString().slice(0, 10), resolvida_schedule_id: s.id, notes: "Não precisou trocar" }).eq("id", os.id);
      if (os.inventory_item_id) await admin.from("inventory_items").update({ status: "disponivel", em_comodato: false, client_id: null }).eq("id", os.inventory_item_id);
    }
    await timeline("visita", "Substituição: não precisou trocar — nota será cancelada e o aparelho volta ao estoque");
    return { resultado, cancelar_nota: !!base };
  }
  // Used: the removed device needs a return invoice signed by the client on the next route visit.
  let tarefaId: string | null = null;
  if (base) {
    const { data: t } = await admin.from("tarefas_faturamento").upsert({ ...base, acao: "devolucao", tipo_nota: "retorno",
      prazo: new Date(now.getTime() + 48 * 3_600_000).toISOString(), observacao: "Nota de devolução de comodato do aparelho retirado" }, { onConflict: "schedule_id,acao" }).select("id").single();
    tarefaId = t?.id ?? null;
  }
  if (os) await admin.from("maintenance_schedule").update({ status: "em_andamento", resolvida_schedule_id: s.id, notes: "Pendente de nota de devolução de comodato assinada" }).eq("id", os.id);
  let coleta: string | null = null;
  if (tarefaId && s.client_id) {
    const hoje = new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    const { data: prox } = await admin.from("schedules").select("id, ocorrencia_codigo").eq("client_id", s.client_id).eq("organization_id", s.organization_id)
      .gt("scheduled_date", hoje).in("status", ["agendado", "confirmado"]).is("coleta_devolucao_tarefa_id", null).order("scheduled_date").limit(1).maybeSingle();
    if (prox) {
      await admin.from("schedules").update({ coleta_devolucao_tarefa_id: tarefaId }).eq("id", prox.id);
      coleta = prox.ocorrencia_codigo;
    } else {
      const { data: c } = await admin.from("clients").select("name, city, zip_code, address").eq("id", s.client_id).maybeSingle();
      const { data: areas } = await admin.from("ekkoa_coverage_areas").select("name, city, dia_semana, zip_code_start, zip_code_end").eq("organization_id", s.organization_id).eq("is_active", true);
      const end = new Date(Date.parse(`${hoje}T12:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
      const { data: hol } = await admin.from("holidays").select("date, city").or(`organization_id.is.null,organization_id.eq.${s.organization_id}`).gte("date", hoje).lte("date", end);
      const city = (c?.city ?? "").toLowerCase();
      const blocked = new Set((hol ?? []).filter((h: any) => !h.city || h.city.toLowerCase() === city).map((h: any) => h.date));
      const rota = parseDiaSemana(areaDoCliente(areas ?? [], c?.zip_code, c?.city)?.dia_semana);
      const data = primeiroDiaRota(new Date(Date.parse(`${hoje}T12:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10), rota, (d) => blocked.has(d));
      const { data: novo } = await admin.from("schedules").insert({ organization_id: s.organization_id, client_id: s.client_id, title: `Coleta de assinatura (devolução) — ${c?.name ?? ""}`,
        scheduled_date: data, start_time: "09:00", status: "agendado", schedule_type: "manutencao", schedule_subtype: "OUTRO", ocorrencia_tipo: "coleta_devolucao",
        source: "substituicao", assigned_to: s.assigned_to ?? userId, created_by: userId, location: c?.address ?? null, confirmacao_status: "nao_aplicavel", coleta_devolucao_tarefa_id: tarefaId })
        .select("ocorrencia_codigo").single();
      coleta = novo?.ocorrencia_codigo ?? null;
    }
  }
  await timeline("visita", `Substituição: aparelho trocado — nota de devolução pendente; assinatura na próxima visita${coleta ? ` (#${coleta})` : ""}`);
  return { resultado, devolucao_tarefa: tarefaId, coleta_assinatura: coleta };
}

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
  if (!UUID.test(b.id ?? "") || !["checkin", "evidencia", "checkout", "nao_realizado", "foto_url", "proposta_enviada", "liberar_checkin", "audio", "devolucao_assinada"].includes(b.action)) return json({ error: "Requisição inválida" }, 400);

  const { data: s } = await caller.from("schedules").select("id, organization_id, title, status, assigned_to, created_by, lead_id, client_id, scheduled_date, start_time, schedule_type, schedule_subtype, latitude, longitude, checkin_em, location, exige_nota, nota_status, checkin_liberado_em, operacao_material, ocorrencia_tipo, ocorrencia_codigo, coleta_status, coleta_rascunho, coleta_devolucao_tarefa_id, clients(name, latitude, longitude), leads(empresa_nome, company, latitude, longitude, pessoa_id, gptmaker_chat_id, canal_origem)")
    .eq("id", b.id).maybeSingle();
  if (!s) return json({ error: "Agendamento não encontrado" }, 404);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const privileged = (roles ?? []).some((r: any) => ["admin", "super_admin", "gestor"].includes(r.role));
  if (!privileged && s.assigned_to !== user.id && !(s.assigned_to === null && s.created_by === user.id)) {
    return json({ error: "Só o responsável pela visita pode executá-la" }, 403);
  }
  const lead: any = s.leads;
  const { data: me } = await admin.from("profiles").select("name").eq("user_id", user.id).maybeSingle();
  const consultor = (me?.name as string | undefined) ?? "Equipe";
  const cliente = (s as any).clients?.name || lead?.empresa_nome || lead?.company || s.title || "";
  const tecnico = isTechnical(s.schedule_type, s.schedule_subtype);
  const tipo = tecnico ? serviceLabel(s.schedule_type, s.schedule_subtype) : "Visita comercial";
  const info = { id: s.id, cliente, consultor, tipo };
  const timeline = async (tipoEv: string, resumo: string, proximo?: string | null) => {
    if (!s.lead_id) return;
    const { error } = await admin.from("lead_timeline").insert({ organization_id: s.organization_id, lead_id: s.lead_id, pessoa_id: lead?.pessoa_id ?? null,
      tipo: tipoEv, origem: "fera", resumo: resumo.slice(0, 500), proximo_passo: proximo ?? null, referencia_id: s.id });
    if (error) console.error("[visita-acoes] timeline", error.code);
  };
  const bg = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p.catch(() => undefined)) ?? p;

  switch (b.action) {
    case "checkin": {
      if (!["agendado", "confirmado"].includes(s.status)) return json({ error: "Esta visita não pode ser iniciada" }, 409);
      const { data: org } = await admin.from("organizations").select("raio_checkin_m, bloquear_checkin_sem_nota").eq("id", s.organization_id).maybeSingle();
      // 05/11: material leaving the company needs the invoice attached; only a manager can release a registered exception.
      if (checkinBloqueadoPorNota(s as any, org?.bloquear_checkin_sem_nota)) {
        return json({ error: "Check-in bloqueado: a nota fiscal desta operação ainda não foi anexada. Fale com o faturamento ou peça liberação ao gestor.", bloqueado_nota: true }, 423);
      }
      const cli: any = (s as any).clients;
      // Destination priority: schedule → client → lead; geocode the address on demand when none has coordinates.
      let target: { lat?: number | null; lng?: number | null } = s.latitude != null ? { lat: s.latitude, lng: s.longitude }
        : cli?.latitude != null ? { lat: cli.latitude, lng: cli.longitude } : { lat: lead?.latitude, lng: lead?.longitude };
      if (target.lat == null) {
        const g = (s.client_id ? await geocodeClient(admin, s.client_id) : null) ?? (s.lead_id ? await geocodeLead(admin, s.lead_id) : null) ?? await geocodeSchedule(admin, s.id);
        if (g) { target = g; await admin.from("schedules").update({ latitude: g.lat, longitude: g.lng }).eq("id", s.id).is("latitude", null); }
      }
      if (b.geolocation_error != null && !GEOLOCATION_ERRORS.includes(b.geolocation_error)) return json({ error: "Diagnóstico de localização inválido" }, 400);
      const lat = num(b.lat); const lng = num(b.lng);
      const pos = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
      // Older clients send sem_permissao for every failure; never infer denial from that flag.
      const geolocation_error = b.geolocation_error ?? (pos ? null : "UNKNOWN");
      const ev = evaluateCheckin(pos, target, Number(org?.raio_checkin_m ?? 300) || 300, geolocation_error);
      const justificativa = txt(b.justificativa, 300);
      if (ev.precisa_justificativa && justificativa.length < 3) {
        return json({ error: !pos ? "Sem localização: escreva uma justificativa" : `Você está a ${ev.distancia_m} m do endereço: escreva uma justificativa`,
          precisa_justificativa: true, distancia_m: ev.distancia_m }, 422);
      }
      const now = new Date().toISOString();
      const { error: e1 } = await admin.from("schedule_checkins").insert({ organization_id: s.organization_id, schedule_id: s.id, user_id: user.id, checkin_em: now,
        latitude: pos?.lat ?? null, longitude: pos?.lng ?? null, precisao_m: num(b.precisao), distancia_m: ev.distancia_m,
        fora_do_raio: ev.fora_do_raio, sem_permissao: ev.sem_permissao, destino_sem_coordenadas: ev.destino_sem_coordenadas, geolocation_error, justificativa: justificativa || null });
      if (e1) { console.error("[visita-acoes] checkin", e1.code); return json({ error: e1.code === "23505" ? "Check-in já registrado" : "Não foi possível iniciar" }, 400); }
      await admin.from("schedules").update({ status: "em_atendimento", checkin_em: now }).eq("id", s.id);
      await timeline("visita", `Check-in de ${consultor}${ev.distancia_m !== null ? ` a ${ev.distancia_m} m do endereço` : !pos ? ` sem localização (${geolocation_error})` : ev.destino_sem_coordenadas ? " (local do cliente sem coordenadas — distância não verificada)" : ""}${justificativa ? ` — ${justificativa}` : ""}`);
      if (ev.precisa_justificativa) {
        bg(teamAlert(admin, s.organization_id, "checkin_fora_do_local", checkinAlertMessage({ ...info, distancia: ev.distancia_m, justificativa, geolocation_error }),
          { schedule_id: s.id }, { immediate: true, dedupeKey: "schedule_id" }));
      }
      // Pending material (or a manager-released invoice) still allows check-in, with a warning to managers.
      const { data: pr } = await admin.from("schedules").select("prontidao").eq("id", s.id).maybeSingle();
      const pendente = prontidaoLabel(pr?.prontidao);
      if (pendente) {
        bg(teamAlert(admin, s.organization_id, "prontidao_pendente", [`📦 Check-in com pendência`, `Cliente: ${cliente}`, `Consultor: ${consultor}`, pendente,
          `Ver no Fera: ${FERA_URL}/agenda?agendamento=${s.id}`].join("\n"), { schedule_id: s.id, checkin: true }, { immediate: true }));
      }
      return json({ ok: true, ...ev, prontidao_pendente: pendente });
    }
    case "liberar_checkin": {
      if (!privileged) return json({ error: "Só o gestor pode liberar o check-in sem nota" }, 403);
      const motivo = txt(b.motivo, 300);
      if (motivo.length < 5) return json({ error: "Escreva o motivo da liberação" }, 400);
      if (!["agendado", "confirmado"].includes(s.status)) return json({ error: "Esta visita não pode mais ser liberada" }, 409);
      const now = new Date().toISOString();
      const { error } = await admin.from("schedules").update({ checkin_liberado_por: user.id, checkin_liberado_em: now, checkin_liberacao_motivo: motivo }).eq("id", s.id);
      if (error) { console.error("[visita-acoes] liberar", error.code); return json({ error: "Não foi possível liberar" }, 400); }
      await admin.from("audit_logs").insert({ organization_id: s.organization_id, user_id: user.id, action: "CHECKIN_LIBERADO_SEM_NOTA", entity_type: "schedules", entity_id: s.id,
        new_data: { motivo } }).then(() => undefined, () => undefined);
      await timeline("visita", `Check-in liberado sem nota por ${consultor}: ${motivo}`);
      bg(teamAlert(admin, s.organization_id, "prontidao_pendente", [`🔓 Check-in liberado sem nota`, `Cliente: ${cliente}`, `Liberado por: ${consultor}`, `Motivo: ${motivo}`,
        `Ver no Fera: ${FERA_URL}/agenda?agendamento=${s.id}`].join("\n"), { schedule_id: s.id, liberacao: true }, { immediate: true }));
      return json({ ok: true });
    }
    case "audio": {
      // Audio/text notes of the collection: allowed during the visit and after checkout while information is pending.
      if (!(s.status === "em_atendimento" || (s.status === "concluido" && s.coleta_status !== "confirmada"))) return json({ error: "Inicie o atendimento antes" }, 409);
      const path = txt(b.audio_path, 300);
      const texto = txt(b.texto, 4000);
      if (!path && !texto) return json({ error: "Envie um áudio ou texto" }, 400);
      if (path && !path.startsWith(`${s.organization_id}/${s.id}/`)) return json({ error: "Áudio inválido" }, 400);
      const cu = UUID.test(b.client_uuid ?? "") ? b.client_uuid : null;
      if (cu) {
        const { data: ex } = await admin.from("schedule_evidencias").select("id").eq("client_uuid", cu).maybeSingle();
        if (ex) return json({ ok: true, id: ex.id, repetido: true });
      }
      const { data, error } = await admin.from("schedule_evidencias").insert({ organization_id: s.organization_id, schedule_id: s.id, tipo: path ? "audio" : "texto",
        audio_path: path || null, observacoes: texto || null, transcricao: path ? null : texto || null, duracao_s: num(b.duracao_s), client_uuid: cu, autor_id: user.id, itens: [] }).select("id").single();
      if (error) { console.error("[visita-acoes] audio", error.code); return json({ error: error.code === "23505" ? "Já enviado" : "Não foi possível salvar" }, 400); }
      if (!s.coleta_status) await admin.from("schedules").update({ coleta_status: "coletando" }).eq("id", s.id).is("coleta_status", null);
      return json({ ok: true, id: data.id });
    }
    case "devolucao_assinada": {
      // Signature collection visit: the photo of the signed return invoice closes the replacement work order and returns the removed device to stock.
      if (s.status !== "em_atendimento") return json({ error: "Inicie o atendimento antes" }, 409);
      const path = txt(b.foto_path, 300);
      if (!path || !path.startsWith(`${s.organization_id}/${s.id}/`)) return json({ error: "Tire a foto da nota assinada" }, 400);
      if (!s.coleta_devolucao_tarefa_id) return json({ error: "Esta visita não tem nota de devolução para assinar" }, 409);
      const { data: t } = await admin.from("tarefas_faturamento").select("id, ordem_servico_id, schedule_id, numero_nota").eq("id", s.coleta_devolucao_tarefa_id).maybeSingle();
      const now = new Date().toISOString();
      await admin.from("schedules").update({ devolucao_assinada_em: now, devolucao_assinatura_path: path }).eq("id", s.id);
      await admin.from("schedule_evidencias").insert({ organization_id: s.organization_id, schedule_id: s.id, foto_path: path, observacoes: "Nota de devolução assinada", itens: [], autor_id: user.id });
      if (t?.schedule_id) await admin.from("schedules").update({ devolucao_assinada_em: now, devolucao_assinatura_path: path }).eq("id", t.schedule_id);
      if (t?.ordem_servico_id) {
        const { data: os } = await admin.from("maintenance_schedule").select("id, inventory_item_id").eq("id", t.ordem_servico_id).maybeSingle();
        await admin.from("maintenance_schedule").update({ status: "concluida", completed_date: now.slice(0, 10), notes: `Devolução assinada (nota ${t.numero_nota ?? "-"})` }).eq("id", t.ordem_servico_id);
        if (os?.inventory_item_id) await admin.from("inventory_items").update({ status: "disponivel", em_comodato: false, client_id: null }).eq("id", os.inventory_item_id).eq("organization_id", s.organization_id);
      }
      await timeline("visita", `Nota de devolução assinada coletada por ${consultor}; OS de substituição encerrada`);
      return json({ ok: true });
    }
    case "evidencia": {
      if (s.status !== "em_atendimento") return json({ error: "Inicie o atendimento antes" }, 409);
      const path = txt(b.foto_path, 300);
      if (path && !path.startsWith(`${s.organization_id}/${s.id}/`)) return json({ error: "Foto inválida" }, 400);
      const itens = Array.isArray(b.itens) ? b.itens.filter((i: unknown) => typeof i === "string" && ITENS.includes(i)) : [];
      let comodato: string | null = null;
      if (UUID.test(b.comodato_id ?? "")) {
        const { data: c } = await caller.from("comodatos").select("id").eq("id", b.comodato_id).eq("organization_id", s.organization_id).maybeSingle();
        comodato = c?.id ?? null;
      }
      const { data, error } = await admin.from("schedule_evidencias").insert({ organization_id: s.organization_id, schedule_id: s.id, comodato_id: comodato,
        foto_path: path || null, observacoes: txt(b.observacoes, 1000) || null, itens, autor_id: user.id }).select("id").single();
      if (error) { console.error("[visita-acoes] evidencia", error.code); return json({ error: "Não foi possível salvar" }, 400); }
      return json({ ok: true, id: data.id });
    }
    case "foto_url": {
      const { data: ev } = await caller.from("schedule_evidencias").select("foto_path").eq("schedule_id", s.id).not("foto_path", "is", null);
      const urls: Record<string, string> = {};
      for (const e of ev ?? []) {
        const { data } = await admin.storage.from("visit-photos").createSignedUrl(e.foto_path, 3600);
        if (data?.signedUrl) urls[e.foto_path] = data.signedUrl;
      }
      return json({ urls });
    }
    case "proposta_enviada": {
      const { data: pp } = await admin.from("schedule_proximo_passo").select("id, tipo, proposta_enviada_em").eq("schedule_id", s.id).maybeSingle();
      if (!pp || pp.tipo !== "proposta") return json({ error: "Esta visita não tem proposta como próximo passo" }, 409);
      if (!pp.proposta_enviada_em) {
        await admin.from("schedule_proximo_passo").update({ proposta_enviada_em: new Date().toISOString() }).eq("id", pp.id);
        if (s.lead_id) {
          const { data: st } = await admin.from("lead_stages").select("id").eq("organization_id", s.organization_id).eq("chave", "proposta_enviada").maybeSingle();
          if (st) await admin.from("leads").update({ stage_id: st.id, stage: "proposta" }).eq("id", s.lead_id).eq("organization_id", s.organization_id);
        }
        await timeline("visita", `Proposta enviada (marcada por ${consultor})`);
      }
      return json({ ok: true });
    }
    case "nao_realizado": {
      if (!["agendado", "confirmado", "em_atendimento"].includes(s.status)) return json({ error: "Esta visita já foi finalizada" }, 409);
      if (!NAO_REALIZADO.includes(b.motivo)) return json({ error: "Escolha o motivo" }, 400);
      const obs = txt(b.observacao, 300);
      const { error } = await admin.from("schedules").update({ status: "nao_realizado", nao_realizado_motivo: b.motivo, resumo_execucao: obs || null,
        checkout_em: s.checkin_em ? new Date().toISOString() : null }).eq("id", s.id);
      if (error) { console.error("[visita-acoes] nao_realizado", error.code); return json({ error: "Não foi possível salvar" }, 400); }
      await timeline("visita", `Visita não realizada (${NAO_REALIZADO_LABEL[b.motivo]})${obs ? `: ${obs}` : ""}`, b.motivo === "reagendar" ? "Reagendar visita" : null);
      return json({ ok: true });
    }
    case "checkout": {
      if ((s as any).operacao_material === "substituicao" && !["nao_trocou", "trocou"].includes(b.substituicao_resultado)) {
        return json({ error: "Informe se o aparelho foi trocado ou não", precisa_substituicao: true }, 400);
      }
      const { count } = await admin.from("schedule_evidencias").select("id", { count: "exact", head: true }).eq("schedule_id", s.id).not("foto_path", "is", null);
      // Maintenance with registered points: every active point must be evaluated; the checklist photos replace the generic photo rule.
      let checklist = false;
      if (s.client_id && tecnico) {
        const { data: pts } = await admin.from("comodatos").select("id, status").eq("client_id", s.client_id).eq("organization_id", s.organization_id);
        const { data: avs } = await admin.from("schedule_evidencias").select("comodato_id").eq("schedule_id", s.id).not("estado", "is", null);
        const pend = pontosPendentes(pts ?? [], (avs ?? []).map((a: any) => a.comodato_id));
        if (pend.length) return json({ error: `Avalie todos os pontos antes de encerrar (${pend.length} pendente(s))` }, 400);
        checklist = (pts ?? []).some((p: any) => (p.status ?? "ATIVO").toUpperCase() === "ATIVO");
      }
      // Maintenance: the next step is the maintenance plan's next visit; without a plan, the consultant picks a frequency and the plan is created.
      if (tecnico && s.client_id && (!b.proximo || b.proximo === "plano")) {
        const today0 = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
        let { data: plano } = await admin.from("planos_manutencao").select("id, frequencia, intervalo_dias, dia_semana, data_inicio")
          .eq("client_id", s.client_id).eq("organization_id", s.organization_id).eq("ativo", true).limit(1).maybeSingle();
        if (!plano) {
          if (!FREQ_RAPIDAS.includes(b.frequencia)) return json({ error: "Escolha a frequência da próxima visita" }, 400);
          const { data: novo, error: pe0 } = await admin.from("planos_manutencao").insert({ organization_id: s.organization_id, client_id: s.client_id,
            frequencia: b.frequencia, dia_semana: new Date(`${today0}T12:00:00Z`).getUTCDay(), hora_inicio: String(s.start_time ?? "09:00").slice(0, 5),
            consultor_id: s.assigned_to ?? user.id, data_inicio: today0, created_by: user.id }).select("id, frequencia, intervalo_dias, dia_semana, data_inicio").single();
          if (pe0) { console.error("[visita-acoes] plano", pe0.code); return json({ error: "Não foi possível criar o plano de manutenção" }, 400); }
          plano = novo;
        }
        const { data: prox } = await admin.from("schedules").select("scheduled_date").eq("client_id", s.client_id).eq("plano_manutencao_id", plano!.id)
          .gt("scheduled_date", today0).in("status", ["agendado", "confirmado"]).order("scheduled_date").limit(1).maybeSingle();
        b.proximo = "novo_agendamento";
        if (prox?.scheduled_date) b.data_alvo = prox.scheduled_date;
        else {
          const { data: c } = await admin.from("clients").select("city, zip_code").eq("id", s.client_id).maybeSingle();
          const { data: areas } = await admin.from("ekkoa_coverage_areas").select("name, city, dia_semana, zip_code_start, zip_code_end").eq("organization_id", s.organization_id).eq("is_active", true);
          const { data: hol } = await admin.from("holidays").select("date, city").or(`organization_id.is.null,organization_id.eq.${s.organization_id}`).gte("date", today0);
          const city = (c?.city ?? "").toLowerCase();
          const blocked = new Set((hol ?? []).filter((h: any) => !h.city || h.city.toLowerCase() === city).map((h: any) => h.date));
          b.data_alvo = proximaVisitaPlano(plano as any, today0, parseDiaSemana(areaDoCliente(areas ?? [], c?.zip_code, c?.city)?.dia_semana), (d) => blocked.has(d));
        }
        b.descricao = "Próxima visita do plano de manutenção";
      }
      // Commercial visit with collection: the next step lives only in the draft; closing needs just the result.
      if (!tecnico && exigeColeta((s as any).ocorrencia_tipo) && !["novo_agendamento", "proposta", "follow_up", "perdido"].includes(b.proximo)) {
        b.proximo = "novo_agendamento"; b.data_alvo = null; b.descricao = "Próximo passo definido na coleta";
      }
      const err = validateCheckout({ status: s.status, resultado: b.resultado, resumo: b.resumo, proximo: b.proximo, data_alvo: b.data_alvo,
        motivo_perda: b.motivo_perda, confirmar_perdido: b.confirmar_perdido, commercial: !tecnico, fotos: count ?? 0,
        precisa_foto: !checklist && requiresPhoto(s.schedule_type, s.schedule_subtype) });
      if (err) return json({ error: err }, 400);
      const now = new Date().toISOString();
      const dur = duracaoComTermino(s.checkin_em ?? now, b.termino, new Date(now));
      if ("error" in dur) return json({ error: dur.error, precisa_termino: true }, 400);
      const duracao = dur.min;
      const resumo = txt(b.resumo, 500);
      const detalhe = b.proximo === "follow_up" ? b.data_alvo.split("-").reverse().join("/") : b.proximo === "perdido" ? txt(b.motivo_perda, 200)
        : b.proximo === "novo_agendamento" && /^\d{4}-\d{2}-\d{2}$/.test(b.data_alvo ?? "") ? b.data_alvo.split("-").reverse().join("/") : txt(b.descricao, 200) || null;
      const { error: pe } = await admin.from("schedule_proximo_passo").insert({ organization_id: s.organization_id, schedule_id: s.id, tipo: b.proximo,
        data_alvo: /^\d{4}-\d{2}-\d{2}$/.test(b.data_alvo ?? "") ? b.data_alvo : null, motivo_perda: b.proximo === "perdido" ? txt(b.motivo_perda, 200) : null,
        descricao: txt(b.descricao, 300) || null, autor_id: user.id });
      if (pe && pe.code !== "23505") { console.error("[visita-acoes] proximo", pe.code); return json({ error: "Não foi possível encerrar" }, 400); }
      const { error: ue } = await admin.from("schedules").update({ status: "concluido", checkout_em: now, duracao_min: duracao, resultado: b.resultado, resumo_execucao: resumo }).eq("id", s.id);
      if (ue) { console.error("[visita-acoes] checkout", ue.code); return json({ error: "Não foi possível encerrar" }, 400); }

      // Loans touched during the visit get their maintenance dates moved forward.
      const today = now.slice(0, 10);
      const { data: evs } = await admin.from("schedule_evidencias").select("comodato_id").eq("schedule_id", s.id).not("comodato_id", "is", null);
      for (const id of new Set((evs ?? []).map((e: any) => e.comodato_id))) {
        const { data: c } = await admin.from("comodatos").select("periodicidade_manut").eq("id", id).eq("organization_id", s.organization_id).maybeSingle();
        if (c) await admin.from("comodatos").update({ ultima_manutencao: today, proxima_manutencao: nextMaintenance(today, c.periodicidade_manut) }).eq("id", id);
      }
      // Lote 15: commercial occurrences may leave the client with "information pending" until the collection is confirmed.
      let coletaPendente: string[] = [];
      if (exigeColeta((s as any).ocorrencia_tipo) && (s as any).coleta_status !== "confirmada") {
        coletaPendente = pendenciasColeta((s as any).ocorrencia_tipo, (s as any).coleta_rascunho);
        if (!coletaPendente.length) coletaPendente = ["Confirmar o rascunho da coleta"];
        await admin.from("schedules").update({ coleta_status: "pendente", coleta_pendencias: coletaPendente }).eq("id", s.id);
      }
      // 05/11 replacement: not used → cancel the invoice within 24h; used → return invoice + signature on the next route visit.
      let substituicao: Record<string, unknown> | null = null;
      if ((s as any).operacao_material === "substituicao") substituicao = await fecharSubstituicao(admin, s, b.substituicao_resultado, user.id, timeline);
      const stageKey = stageForCheckout(!tecnico, b.proximo);
      if (s.lead_id && stageKey) {
        const { data: st } = await admin.from("lead_stages").select("id").eq("organization_id", s.organization_id).eq("chave", stageKey).maybeSingle();
        if (st) await admin.from("leads").update({ stage_id: st.id, ...(stageKey === "perdido" ? { stage: "fechado_perdido" } : {}) })
          .eq("id", s.lead_id).eq("organization_id", s.organization_id);
      }
      await timeline("visita", `Visita encerrada por ${consultor} (${RESULT_LABEL[b.resultado]}, ${duracao} min): ${resumo}`,
        `${NEXT_LABEL[b.proximo]}${detalhe ? ` (${detalhe})` : ""}`);
      const { data: ck } = await admin.from("schedule_checkins").select("distancia_m").eq("schedule_id", s.id).maybeSingle();
      bg(teamAlert(admin, s.organization_id, "visita_concluida", checkoutMessage({ ...info, resultado: b.resultado, duracao,
        distancia: ck?.distancia_m ?? null, proximo: b.proximo, detalhe }), { schedule_id: s.id }, { dedupeKey: "schedule_id" }));
      return json({ ok: true, duracao_min: duracao, coleta_pendente: coletaPendente, substituicao });
    }
  }
  return json({ error: "Requisição inválida" }, 400);
});
