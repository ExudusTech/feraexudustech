// Sends (or queues outside human hours) a team WhatsApp alert to the organization's subscribers of an event.
import { normalizeHumanHours, estaEmHorario, proximoHorarioUtil, type ClosedDay } from "./business-hours.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function sendWhatsapp(phone: string | null, message: string): Promise<{ status: string; error: string | null }> {
  const token = Deno.env.get("GPTMAKER_API_TOKEN"); const channel = Deno.env.get("GPTMAKER_WHATSAPP_CHANNEL_ID");
  try {
    if (!token || !channel) return { status: "FAILED", error: "CONFIG_MISSING" };
    if (!/^\d{8,15}$/.test(phone ?? "")) return { status: "FAILED", error: "INVALID_PHONE" };
    const res = await fetch(`https://api.gptmaker.ai/v2/channel/${channel}/start-conversation`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone, message }), signal: AbortSignal.timeout(10000) });
    await res.body?.cancel();
    return res.ok ? { status: "SENT", error: null } : { status: "FAILED", error: `HTTP ${res.status}` };
  } catch { return { status: "FAILED", error: "DELIVERY_FAILED" }; }
}

export async function humanOpen(admin: Admin, orgId: string): Promise<{ open: boolean; nextAt: Date }> {
  const { data: org } = await admin.from("organizations").select("human_hours, human_timezone, city").eq("id", orgId).maybeSingle();
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  const { data: holidays } = await admin.from("holidays").select("date, city").or(`organization_id.is.null,organization_id.eq.${orgId}`).gte("date", from).lte("date", to);
  const cfg = normalizeHumanHours(org?.human_hours, org?.human_timezone);
  const closed = (holidays ?? []) as ClosedDay[];
  return { open: estaEmHorario(now, cfg, closed, org?.city ?? null), nextAt: proximoHorarioUtil(now, cfg, closed, org?.city ?? null).at };
}

/** Delivers to subscribers of `event`; dedupes by payload key. `immediate` ignores human hours. Never throws. */
export async function teamAlert(admin: Admin, orgId: string, event: string, message: string, payload: Record<string, unknown>,
  opts: { immediate?: boolean; dedupeKey?: string; extraUserIds?: string[] } = {}): Promise<void> {
  try {
    if (opts.dedupeKey) {
      const { data: prior } = await admin.from("notification_logs").select("id").eq("organization_id", orgId).eq("event_type", event)
        .contains("payload", { [opts.dedupeKey]: payload[opts.dedupeKey] }).limit(1);
      if (prior?.length) return;
    }
    const { data: recipients } = await admin.from("notification_recipients").select("id, nome, whatsapp, user_id")
      .eq("organization_id", orgId).eq("ativo", true).contains("eventos", [event]);
    const list: Array<{ id: string | null; nome: string; whatsapp: string | null; user_id: string | null }> = (recipients ?? []).map((r: any) => ({ ...r }));
    for (const u of opts.extraUserIds ?? []) if (!list.some((r) => r.user_id === u)) list.push({ id: null, nome: "", whatsapp: null, user_id: u });
    if (!list.length) return;
    const ids = list.map((r) => r.user_id).filter(Boolean);
    if (ids.length) {
      const { data: profiles } = await admin.from("profiles").select("user_id, name, phone, is_active").eq("organization_id", orgId).in("user_id", ids);
      const byUser = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      for (const r of list) if (r.user_id) { const p: any = byUser.get(r.user_id); r.whatsapp = p && p.is_active !== false ? p.phone ?? null : null; if (p?.name) r.nome = p.name; }
    }
    const hours = opts.immediate ? { open: true, nextAt: new Date() } : await humanOpen(admin, orgId);
    const seen = new Set<string>();
    for (const r of list) {
      if (r.whatsapp && seen.has(r.whatsapp)) continue;
      if (r.whatsapp) seen.add(r.whatsapp);
      const base = { organization_id: orgId, event_type: event, recipient_id: r.id, recipient_name: r.nome, channel: "WHATSAPP",
        destination: r.whatsapp, payload: { ...payload, message } };
      if (!hours.open) {
        await admin.from("notification_logs").insert({ ...base, status: "QUEUED", release_at: hours.nextAt.toISOString() });
        continue;
      }
      const res = await sendWhatsapp(r.whatsapp, message);
      const { error } = await admin.from("notification_logs").insert({ ...base, status: res.status, error_message: res.error });
      if (error) console.error("[team-alert] log failed", error.code);
    }
  } catch { console.error("[team-alert] failed"); }
}
