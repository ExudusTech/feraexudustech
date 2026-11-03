// Runs every 15 minutes: D-1 and same-day visit confirmations to the client's chat, "no answer" alert to the consultant,
// late-visit alerts to managers, and daily retention cleanup of raw locations/photos. Every step is claimed per row, so reruns are harmless.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { confirmationDue, confirmationMessage, lateAlertMessage, lateMinutes, noConfirmationMessage } from "../_shared/visit-exec.ts";
import { humanOpen, teamAlert } from "../_shared/team-alert.ts";

const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });

async function sendToChat(chatId: string, message: string): Promise<boolean> {
  const token = Deno.env.get("GPTMAKER_API_TOKEN");
  if (!token) return false;
  try {
    const res = await fetch(`https://api.gptmaker.ai/v2/chat/${encodeURIComponent(chatId)}/send-message`, { method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message }), signal: AbortSignal.timeout(10000) });
    await res.body?.cancel();
    return res.ok;
  } catch { return false; }
}

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  const today = new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const out = { confirmacoes: 0, sem_resposta: 0, atrasos: 0, limpeza: 0 };
  const { data: rows } = await admin.from("schedules")
    .select("id, organization_id, lead_id, title, scheduled_date, start_time, status, assigned_to, confirmacao_status, confirmacao_d1_enviada_em, confirmacao_dia_enviada_em, sem_confirmacao_alertado_em, atraso_alertado_em, clients(name), leads(empresa_nome, company, gptmaker_chat_id, pessoa_id)")
    .in("status", ["agendado", "confirmado"]).in("scheduled_date", [today, tomorrow]).limit(500);
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

      const chat = lead?.gptmaker_chat_id as string | null;
      const due = chat ? confirmationDue(now, { scheduled_date: s.scheduled_date, start_time: s.start_time, confirmacao_status: s.confirmacao_status,
        d1_sent: !!s.confirmacao_d1_enviada_em, dia_sent: !!s.confirmacao_dia_enviada_em, sem_resposta_alertado: !!s.sem_confirmacao_alertado_em },
        { d1_hora: cfg.d1, horas_antes: cfg.horas }, cfg.open) : null;
      if (due === "d1" || due === "dia") {
        const col = due === "d1" ? "confirmacao_d1_enviada_em" : "confirmacao_dia_enviada_em";
        const { data: claimed } = await admin.from("schedules").update({ [col]: now.toISOString() }).eq("id", s.id).is(col, null).select("id").maybeSingle();
        if (claimed && await sendToChat(chat!, confirmationMessage(due, s.scheduled_date, s.start_time!, lead?.empresa_nome || lead?.company))) {
          out.confirmacoes++;
          await admin.from("lead_timeline").insert({ organization_id: org, lead_id: s.lead_id, tipo: "visita", origem: "fera",
            resumo: due === "d1" ? "Confirmação D-1 enviada ao cliente" : "Confirmação do dia enviada ao cliente", referencia_id: s.id }).then(() => undefined, () => undefined);
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
