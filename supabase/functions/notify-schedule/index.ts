import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scheduleEvent, scheduleMessage, type ScheduleEvent } from "../_shared/schedule-notify.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Não autorizado" }, 401);

  let body: { kind?: string; id?: string };
  try { body = await req.json(); } catch { return json({ error: "Requisição inválida" }, 400); }
  if (!["schedule", "maintenance"].includes(body.kind ?? "") || !UUID.test(body.id ?? "")) return json({ error: "Requisição inválida" }, 400);

  // Read the record under the caller's own access rules, so nobody can trigger alerts for other tenants.
  let record: Record<string, any> | null = null; let event: ScheduleEvent | null = null; let linkPath = "";
  if (body.kind === "schedule") {
    const { data } = await caller.from("schedules").select("id, organization_id, title, scheduled_date, start_time, location, schedule_type, schedule_subtype, source, clients(name), leads(empresa_nome, company, maps_url)")
      .eq("id", body.id!).maybeSingle();
    record = data; if (data) { event = scheduleEvent(data.schedule_type, data.schedule_subtype, data.source); linkPath = `/agenda?agendamento=${data.id}`; }
  } else {
    const { data } = await caller.from("maintenance_schedule").select("id, organization_id, title, scheduled_date, start_time, tipo_os, maintenance_type, clients(name)")
      .eq("id", body.id!).maybeSingle();
    record = data; if (data) { event = "agendamento_tecnico"; linkPath = "/manutencoes"; }
  }
  if (!record) return json({ error: "Agendamento não encontrado" }, 404);
  if (!event) return json({ queued: false, reason: "sem_evento" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const org = record.organization_id as string; const ev = event;
  const task = (async () => {
    const key = body.kind === "schedule" ? "schedule_id" : "maintenance_id";
    const { data: prior } = await admin.from("notification_logs").select("id").eq("organization_id", org).eq("event_type", ev)
      .contains("payload", { [key]: record!.id }).limit(1);
    if (prior?.length) return;
    const { data: recipients } = await admin.from("notification_recipients").select("id, nome, whatsapp, user_id")
      .eq("organization_id", org).eq("ativo", true).contains("eventos", [ev]);
    if (!recipients?.length) return;
    const ids = recipients.map((r) => r.user_id).filter(Boolean);
    if (ids.length) {
      const { data: profiles } = await admin.from("profiles").select("user_id, name, phone, is_active").eq("organization_id", org).in("user_id", ids);
      const byUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      for (const r of recipients) if (r.user_id) { const p = byUser.get(r.user_id); r.whatsapp = p && p.is_active !== false ? p.phone ?? null : null; if (p?.name) r.nome = p.name; }
    }
    const lead = record!.leads; const message = scheduleMessage(ev, {
      id: record!.id, title: record!.title, scheduled_date: record!.scheduled_date, start_time: record!.start_time, location: record!.location,
      schedule_type: record!.schedule_type ?? record!.tipo_os, schedule_subtype: record!.schedule_subtype,
      client_name: record!.clients?.name || lead?.empresa_nome || lead?.company, maps_url: lead?.maps_url, link_path: linkPath });
    const token = Deno.env.get("GPTMAKER_API_TOKEN"); const channel = Deno.env.get("GPTMAKER_WHATSAPP_CHANNEL_ID");
    for (const r of recipients) {
      let status = "FAILED"; let err: string | null = null;
      try {
        if (!token || !channel) throw new Error("CONFIG_MISSING");
        if (!/^\d{8,15}$/.test(r.whatsapp ?? "")) throw new Error("INVALID_PHONE");
        const res = await fetch(`https://api.gptmaker.ai/v2/channel/${channel}/start-conversation`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ phone: r.whatsapp, message }), signal: AbortSignal.timeout(10000) });
        if (res.ok) status = "SENT"; else err = `HTTP ${res.status}`;
        await res.body?.cancel();
      } catch (e) { err = e instanceof Error && ["CONFIG_MISSING", "INVALID_PHONE"].includes(e.message) ? e.message : "DELIVERY_FAILED"; }
      const { error } = await admin.from("notification_logs").insert({ organization_id: org, event_type: ev, recipient_id: r.id, recipient_name: r.nome,
        channel: "WHATSAPP", destination: r.whatsapp, payload: { [key]: record!.id, message }, status, error_message: err });
      if (error) console.error("[notify-schedule] log failed", error.code);
    }
  })().catch(() => console.error("[notify-schedule] background delivery failed"));
  (globalThis as any).EdgeRuntime?.waitUntil(task);
  return json({ queued: true, event });
});
