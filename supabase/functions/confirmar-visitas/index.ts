// Runs every 15 minutes: D-1 and same-day visit confirmations to the client's chat, "no answer" alert to the consultant,
// late-visit alerts to managers, and daily retention cleanup of raw locations/photos. Every step is claimed per row, so reruns are harmless.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { attemptsFor, CONFIRMACAO_MAX_TENTATIVAS, confirmationDue, confirmationEligible, confirmationMessage, lateAlertMessage, lateMinutes, noConfirmationMessage, horasAberta, openVisitMessage } from "../_shared/visit-exec.ts";
import { humanOpen, teamAlert } from "../_shared/team-alert.ts";
import { manutencaoDoDiaMessage, proximasDatas } from "../_shared/base-instalada.ts";
import { geocodePending } from "../_shared/geocode.ts";
import { FERA_URL, prontidaoLabel, tarefaMessage } from "../_shared/prontidao.ts";

/** Phones (digits, with and without 55) of active team users: confirmations never go to a team chat. */
async function teamPhones(admin: any): Promise<Set<string>> {
  const { data } = await admin.from("profiles").select("phone, is_active").not("phone", "is", null);
  const set = new Set<string>();
  for (const p of data ?? []) if (p.is_active !== false) { const d = String(p.phone).replace(/\D/g, ""); if (d) { set.add(d); set.add(d.startsWith("55") ? d.slice(2) : `55${d}`); } }
  return set;
}
function chatPhone(chatId: string | null | undefined): string | null {
  const i = (chatId ?? "").indexOf("-");
  return i > 0 ? chatId!.slice(i + 1).replace(/\D/g, "") || null : null;
}

const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });

async function sendToChat(chatId: string, message: string): Promise<string | null> {
  const token = Deno.env.get("GPTMAKER_API_TOKEN");
  if (!token) return "CONFIG_MISSING";
  try {
    const res = await fetch(`https://api.gptmaker.ai/v2/chat/${encodeURIComponent(chatId)}/send-message`, { method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message }), signal: AbortSignal.timeout(10000) });
    await res.body?.cancel();
    return res.ok ? null : `HTTP ${res.status}`;
  } catch { return "DELIVERY_FAILED"; }
}

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  const today = new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const out = { confirmacoes: 0, falhas: 0, sem_resposta: 0, atrasos: 0, limpeza: 0, manutencoes_geradas: 0, avisos_manutencao: 0 };
  const { data: rows } = await admin.from("schedules")
    .select("id, organization_id, lead_id, title, scheduled_date, start_time, status, assigned_to, created_at, confirmacao_tentativas, confirmacao_ultimo_erro, confirmacao_status, plano_manutencao_id, confirmacao_d1_enviada_em, confirmacao_dia_enviada_em, sem_confirmacao_alertado_em, atraso_alertado_em, clients(name), leads(empresa_nome, company, gptmaker_chat_id, pessoa_id)")
    .in("status", ["agendado", "confirmado"]).in("scheduled_date", [today, tomorrow]).limit(500);
  const team = await teamPhones(admin);
  const orgCache = new Map<string, { open: boolean; d1: string; horas: number; atraso: number }>();
  for (const s of rows ?? []) {
    try {
      const org = s.organization_id as string;
      if (!orgCache.has(org)) {
        const { data: o } = await admin.from("organizations").select("confirmacao_d1_hora, confirmacao_dia_horas_antes, alerta_atraso_min").eq("id", org).maybeSingle();
        orgCache.set(org, { open: (await humanOpen(admin, org)).open, d1: o?.confirmacao_d1_hora ?? "17:00",
          horas: Number(o?.confirmacao_dia_horas_antes ?? 2) || 2, atraso: Number(o?.alerta_atraso_min ?? 15) || 15 });
      }
      const cfg = orgCache.get(org)!;
      const lead: any = s.leads;
      const cliente = (s as any).clients?.name || lead?.empresa_nome || lead?.company || s.title || "";
      const { data: who } = s.assigned_to ? await admin.from("profiles").select("name").eq("user_id", s.assigned_to).maybeSingle() : { data: null };
      const info = { id: s.id, cliente, consultor: who?.name ?? "Sem responsável", tipo: "" };

      const rawChat = (s as any).plano_manutencao_id ? null : lead?.gptmaker_chat_id as string | null;
      const cp = chatPhone(rawChat);
      const chat = cp && team.has(cp) ? null : rawChat;
      const due = confirmationEligible(s.created_at, chat) ? confirmationDue(now, { scheduled_date: s.scheduled_date, start_time: s.start_time, confirmacao_status: s.confirmacao_status,
        d1_sent: !!s.confirmacao_d1_enviada_em, dia_sent: !!s.confirmacao_dia_enviada_em, sem_resposta_alertado: !!s.sem_confirmacao_alertado_em },
        { d1_hora: cfg.d1, horas_antes: cfg.horas }, cfg.open) : null;
      if (due === "d1" || due === "dia") {
        const col = due === "d1" ? "confirmacao_d1_enviada_em" : "confirmacao_dia_enviada_em";
        const spent = attemptsFor(due, s.confirmacao_tentativas, s.confirmacao_ultimo_erro);
        if (spent < CONFIRMACAO_MAX_TENTATIVAS) {
          // Claim by bumping the attempt counter; the step is marked sent only after GPT Maker accepts the message.
          const { data: claimed } = await admin.from("schedules").update({ confirmacao_tentativas: spent + 1 })
            .eq("id", s.id).eq("confirmacao_tentativas", s.confirmacao_tentativas ?? 0).is(col, null).select("id").maybeSingle();
          if (claimed) {
            const err = await sendToChat(chat!, confirmationMessage(due, s.scheduled_date, s.start_time!, lead?.empresa_nome || lead?.company));
            if (!err) {
              out.confirmacoes++;
              await admin.from("schedules").update({ [col]: new Date().toISOString(), confirmacao_tentativas: 0, confirmacao_ultimo_erro: null }).eq("id", s.id);
              await admin.from("lead_timeline").insert({ organization_id: org, lead_id: s.lead_id, tipo: "visita", origem: "fera",
                resumo: due === "d1" ? "Confirmação D-1 enviada ao cliente" : "Confirmação do dia enviada ao cliente", referencia_id: s.id }).then(() => undefined, () => undefined);
            } else {
              out.falhas++;
              await admin.from("schedules").update({ confirmacao_ultimo_erro: `${due}: ${err}` }).eq("id", s.id);
              console.error("[confirmar-visitas] send failed", err);
            }
          }
        }
      } else if (due === "sem_resposta") {
        const { data: claimed } = await admin.from("schedules").update({ sem_confirmacao_alertado_em: now.toISOString(), confirmacao_status: "sem_resposta" })
          .eq("id", s.id).is("sem_confirmacao_alertado_em", null).select("id").maybeSingle();
        if (claimed) { out.sem_resposta++; await teamAlert(admin, org, "visita_sem_confirmacao", noConfirmationMessage({ ...info, hora: s.start_time! }),
          { schedule_id: s.id }, { immediate: true, extraUserIds: s.assigned_to ? [s.assigned_to] : [] }); }
      }

      const late = s.scheduled_date === today ? lateMinutes(now, s) : 0;
      if (late >= cfg.atraso && !s.atraso_alertado_em) {
        const { data: claimed } = await admin.from("schedules").update({ atraso_alertado_em: now.toISOString() }).eq("id", s.id).is("atraso_alertado_em", null).select("id").maybeSingle();
        if (claimed) { out.atrasos++; await teamAlert(admin, org, "visita_atrasada", lateAlertMessage({ ...info, hora: s.start_time!, minutos: late }),
          { schedule_id: s.id }, { immediate: true }); }
      }
    } catch { console.error("[confirmar-visitas] row failed"); }
  }

  // Visits left open too long (≥ 8 h or since an earlier day): one alert per visit to managers and the consultant.
  try {
    const { data: abertas } = await admin.from("schedules").select("id, organization_id, title, assigned_to, checkin_em, clients(name), leads(empresa_nome, company)")
      .eq("status", "em_atendimento").not("checkin_em", "is", null).limit(500);
    for (const s of abertas ?? []) {
      const horas = horasAberta(s.checkin_em, now);
      if (horas === null) continue;
      const { data: who } = s.assigned_to ? await admin.from("profiles").select("name").eq("user_id", s.assigned_to).maybeSingle() : { data: null };
      const l: any = s.leads;
      await teamAlert(admin, s.organization_id, "visita_aberta", openVisitMessage({ id: s.id, cliente: (s as any).clients?.name || l?.empresa_nome || l?.company || s.title || "",
        consultor: who?.name ?? "Sem responsável", tipo: "", horas }), { schedule_id: s.id }, { immediate: true, dedupeKey: "schedule_id", extraUserIds: s.assigned_to ? [s.assigned_to] : [] });
    }
  } catch { console.error("[confirmar-visitas] open visits failed"); }

  const spH = (now.getUTCHours() + 21) % 24;
  // Maintenance plans: once a day (06:00–06:15 São Paulo) create the next visits inside each plan's horizon. Unique (plan, date) keeps reruns harmless.
  if (spH === 6 && now.getUTCMinutes() < 15) {
    try {
      const { data: planos } = await admin.from("planos_manutencao").select("id, organization_id, client_id, frequencia, intervalo_dias, dia_semana, hora_inicio, duracao_min, consultor_id, data_inicio, horizonte_dias, clients(name, city, address, latitude, longitude, assigned_user_id)").eq("ativo", true).limit(1000);
      for (const p of planos ?? []) {
        const c: any = p.clients;
        const horizon = Math.min(90, Number(p.horizonte_dias) || 30);
        const end = new Date(Date.parse(`${today}T12:00:00Z`) + horizon * 86_400_000).toISOString().slice(0, 10);
        const { data: hol } = await admin.from("holidays").select("date, city").or(`organization_id.is.null,organization_id.eq.${p.organization_id}`).gte("date", today).lte("date", end);
        const city = (c?.city ?? "").toLowerCase();
        const blocked = new Set((hol ?? []).filter((h: any) => !h.city || h.city.toLowerCase() === city).map((h: any) => h.date));
        const datas = proximasDatas(p, today, horizon, (d) => blocked.has(d));
        const consultor = p.consultor_id ?? c?.assigned_user_id ?? null;
        for (const d of datas) {
          const { data: exists } = await admin.from("schedules").select("id").eq("plano_manutencao_id", p.id).eq("scheduled_date", d).maybeSingle();
          if (exists) continue;
          let hora = String(p.hora_inicio ?? "09:00").slice(0, 5);
          if (consultor) {
            const { data: busy } = await admin.from("schedules").select("start_time").eq("assigned_to", consultor).eq("scheduled_date", d).in("status", ["agendado", "confirmado", "em_atendimento"]);
            const taken = new Set((busy ?? []).map((x: any) => String(x.start_time ?? "").slice(0, 5)));
            const step = Math.max(30, Number(p.duracao_min) || 60);
            let [h, m] = hora.split(":").map(Number);
            while (taken.has(hora) && h < 18) { m += step; h += Math.floor(m / 60); m %= 60; hora = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
          }
          const { error } = await admin.from("schedules").insert({ organization_id: p.organization_id, client_id: p.client_id, plano_manutencao_id: p.id,
            title: `Manutenção — ${c?.name ?? ""}`, scheduled_date: d, start_time: hora, status: "agendado", schedule_type: "manutencao", schedule_subtype: "MANUTENCAO",
            source: "plano", assigned_to: consultor, location: c?.address ?? null, latitude: c?.latitude ?? null, longitude: c?.longitude ?? null, confirmacao_status: "nao_aplicavel" });
          if (!error) out.manutencoes_geradas++;
        }
      }
    } catch { console.error("[confirmar-visitas] plans failed"); }
  }
  // 07:00–07:15 São Paulo: each consultant gets the day's maintenance list and items to bring.
  if (spH === 7 && now.getUTCMinutes() < 15) {
    try {
      const { data: hoje } = await admin.from("schedules").select("organization_id, assigned_to, start_time, client_id, clients(name)").eq("scheduled_date", today)
        .eq("schedule_type", "manutencao").in("status", ["agendado", "confirmado"]).not("assigned_to", "is", null).order("start_time").limit(1000);
      const byUser = new Map<string, any[]>();
      for (const s of hoje ?? []) { const k = `${s.organization_id}|${s.assigned_to}`; byUser.set(k, [...(byUser.get(k) ?? []), s]); }
      for (const [k, list] of byUser) {
        const [orgId, uid] = k.split("|");
        const { data: oc } = await admin.from("maintenance_schedule").select("item_descricao, quantidade, clients(name)").eq("organization_id", orgId).eq("tipo_os", "substituicao")
          .in("client_id", list.map((s) => s.client_id).filter(Boolean)).in("status", ["agendada", "em_andamento"]);
        const { data: pr } = await admin.from("profiles").select("name").eq("user_id", uid).maybeSingle();
        await teamAlert(admin, orgId, "manutencao_do_dia", manutencaoDoDiaMessage(pr?.name ?? "", list.map((s) => ({ hora: s.start_time ?? "", cliente: s.clients?.name ?? "" })),
          (oc ?? []).map((o: any) => `${o.quantidade}x ${o.item_descricao ?? "item"} (${o.clients?.name ?? ""})`)), { dia_usuario: `${today}|${uid}` },
          { immediate: true, dedupeKey: "dia_usuario", extraUserIds: [uid] });
        out.avisos_manutencao++;
      }
    } catch { console.error("[confirmar-visitas] daily maintenance failed"); }
  }

  // Lote 13: invoice tasks (new → billing alert; D-1 reminder) and D-1 readiness alert to managers + consultant.
  try {
    const { data: novas } = await admin.from("tarefas_faturamento").select("id, numero, organization_id, schedule_id, empresa_nome, tipo_nota, data_visita, itens")
      .eq("status", "aberta").is("notificada_em", null).limit(100);
    for (const t of novas ?? []) {
      const { data: claimed } = await admin.from("tarefas_faturamento").update({ notificada_em: now.toISOString() }).eq("id", t.id).is("notificada_em", null).select("id").maybeSingle();
      if (claimed) await teamAlert(admin, t.organization_id, "tarefa_nota_criada", tarefaMessage("nova", t), { tarefa_id: t.id, tarefa_numero: t.numero, schedule_id: t.schedule_id });
    }
    const spMin = ((now.getUTCHours() + 21) % 24) * 60 + now.getUTCMinutes();
    if (spMin >= 8 * 60) {
      const { data: d1 } = await admin.from("tarefas_faturamento").select("id, numero, organization_id, schedule_id, empresa_nome, tipo_nota, data_visita, itens")
        .eq("status", "aberta").eq("data_visita", tomorrow).is("lembrete_d1_em", null).limit(100);
      for (const t of d1 ?? []) {
        const { data: claimed } = await admin.from("tarefas_faturamento").update({ lembrete_d1_em: now.toISOString() }).eq("id", t.id).is("lembrete_d1_em", null).select("id").maybeSingle();
        if (claimed) await teamAlert(admin, t.organization_id, "tarefa_nota_d1", tarefaMessage("d1", t), { tarefa_id: t.id, tarefa_numero: t.numero, schedule_id: t.schedule_id, d1: true });
      }
      const { data: pend } = await admin.from("schedules").select("id, organization_id, title, start_time, assigned_to, prontidao, clients(name), leads(empresa_nome, company)")
        .eq("scheduled_date", tomorrow).in("status", ["agendado", "confirmado"]).neq("prontidao", "pronto").is("prontidao_alertado_em", null).limit(200);
      for (const s of pend ?? []) {
        const { data: claimed } = await admin.from("schedules").update({ prontidao_alertado_em: now.toISOString() }).eq("id", s.id).is("prontidao_alertado_em", null).select("id").maybeSingle();
        if (!claimed) continue;
        const cliente = (s as any).clients?.name || (s as any).leads?.empresa_nome || (s as any).leads?.company || s.title || "";
        await teamAlert(admin, s.organization_id, "prontidao_pendente", [`📦 Visita de amanhã ainda não está pronta`, `Cliente: ${cliente}`,
          `Horário: ${String(s.start_time ?? "").slice(0, 5)}`, prontidaoLabel(s.prontidao) ?? "", `Ver no Fera: ${FERA_URL}/agenda?agendamento=${s.id}`].join("\n"),
          { schedule_id: s.id, prontidao: s.prontidao }, { extraUserIds: s.assigned_to ? [s.assigned_to] : [] });
        (out as any).prontidao = ((out as any).prontidao ?? 0) + 1;
      }
    }
  } catch { console.error("[confirmar-visitas] readiness/billing failed"); }

  // Geocode clients/leads/schedules created or edited without coordinates (bounded per run).
  try { (out as any).geocode = await geocodePending(admin, 15); } catch { console.error("[confirmar-visitas] geocode failed"); }

  // Retention: once a day (03:00–03:15 São Paulo) drop raw coordinates and old photos per organization settings.
  const spHour = (now.getUTCHours() + 21) % 24;
  if (spHour === 3 && now.getUTCMinutes() < 15) {
    try {
      const { data: orgs } = await admin.from("organizations").select("id, retencao_localizacao_dias, retencao_fotos_dias");
      for (const o of orgs ?? []) {
        const locCut = new Date(now.getTime() - (o.retencao_localizacao_dias ?? 180) * 86_400_000).toISOString();
        const { data: ck } = await admin.from("schedule_checkins").update({ latitude: null, longitude: null, precisao_m: null })
          .eq("organization_id", o.id).lt("checkin_em", locCut).not("latitude", "is", null).select("id");
        const photoCut = new Date(now.getTime() - (o.retencao_fotos_dias ?? 730) * 86_400_000).toISOString();
        const { data: old } = await admin.from("schedule_evidencias").select("id, foto_path").eq("organization_id", o.id).lt("created_at", photoCut).not("foto_path", "is", null).limit(200);
        const paths = (old ?? []).map((e: any) => e.foto_path);
        if (paths.length) {
          await admin.storage.from("visit-photos").remove(paths);
          await admin.from("schedule_evidencias").update({ foto_path: null }).in("id", (old ?? []).map((e: any) => e.id));
        }
        const n = (ck?.length ?? 0) + paths.length;
        if (n) { out.limpeza += n; await admin.from("audit_logs").insert({ organization_id: o.id, action: "RETENTION_CLEANUP", entity_type: "schedule_execution",
          new_data: { coordenadas: ck?.length ?? 0, fotos: paths.length } }).then(() => undefined, () => undefined); }
      }
    } catch { console.error("[confirmar-visitas] retention failed"); }
  }
  return json(out);
});
