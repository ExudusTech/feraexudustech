// Field execution of an agenda visit: checkin, evidencia, checkout, nao_realizado, foto_url.
// The schedule is read with the caller's own access first; only the assigned consultant (or a manager) can act.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkinAlertMessage, checkoutMessage, durationMinutes, evaluateCheckin, isTechnical, NAO_REALIZADO, NAO_REALIZADO_LABEL,
  NEXT_LABEL, nextMaintenance, duracaoComTermino, requiresPhoto, RESULT_LABEL, stageForCheckout, validateCheckout, GEOLOCATION_ERRORS,
} from "../_shared/visit-exec.ts";
import { FREQ_RAPIDAS, pontosPendentes, proximaVisitaPlano } from "../_shared/base-instalada.ts";
import { teamAlert } from "../_shared/team-alert.ts";
import { serviceLabel } from "../_shared/schedule-notify.ts";
import { geocodeClient, geocodeLead, geocodeSchedule } from "../_shared/geocode.ts";
import { FERA_URL, prontidaoLabel } from "../_shared/prontidao.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITENS = ["refil_reposto", "problema_encontrado", "aparelho_trocado", "limpeza_realizada", "treinamento"];
const txt = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;

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
  if (!UUID.test(b.id ?? "") || !["checkin", "evidencia", "checkout", "nao_realizado", "foto_url", "proposta_enviada"].includes(b.action)) return json({ error: "Requisição inválida" }, 400);

  const { data: s } = await caller.from("schedules").select("id, organization_id, title, status, assigned_to, created_by, lead_id, client_id, scheduled_date, start_time, schedule_type, schedule_subtype, latitude, longitude, checkin_em, location, clients(name, latitude, longitude), leads(empresa_nome, company, latitude, longitude, pessoa_id, gptmaker_chat_id, canal_origem)")
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
      const { data: org } = await admin.from("organizations").select("raio_checkin_m").eq("id", s.organization_id).maybeSingle();
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
      // Lote 13: check-in is allowed with pending readiness, but the consultant and managers are warned.
      const { data: pr } = await admin.from("schedules").select("prontidao").eq("id", s.id).maybeSingle();
      const pendente = prontidaoLabel(pr?.prontidao);
      if (pendente) {
        bg(teamAlert(admin, s.organization_id, "prontidao_pendente", [`📦 Check-in com pendência`, `Cliente: ${cliente}`, `Consultor: ${consultor}`, pendente,
          `Ver no Fera: ${FERA_URL}/agenda?agendamento=${s.id}`].join("\n"), { schedule_id: s.id, checkin: true }, { immediate: true }));
      }
      return json({ ok: true, ...ev, prontidao_pendente: pendente });
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
        b.data_alvo = prox?.scheduled_date ?? proximaVisitaPlano(plano as any, today0);
        b.descricao = "Próxima visita do plano de manutenção";
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
      return json({ ok: true, duracao_min: duracao });
    }
  }
  return json({ error: "Requisição inválida" }, 400);
});
