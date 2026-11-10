// Runs every 5 minutes: releases team alerts held outside human-service hours and sends
// waiting-time reminders for open atendimentos. Only acts on rows already due, so repeated calls are harmless.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { estaEmHorario, gravidade, minutosUteis, normalizeHumanHours, type ClosedDay } from "../_shared/business-hours.ts";
import { idsDemo, idsDoPayload } from "../_shared/demo-guard.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const FERA_URL = "https://fera.exudustech.com.br";

type Admin = ReturnType<typeof createClient>;

async function send(phone: string | null, message: string): Promise<{ status: string; error: string | null }> {
  const token = Deno.env.get("GPTMAKER_API_TOKEN"); const channel = Deno.env.get("GPTMAKER_WHATSAPP_CHANNEL_ID");
  try {
    if (!token || !channel) return { status: "FAILED", error: "CONFIG_MISSING" };
    if (!/^\d{8,15}$/.test(phone ?? "")) return { status: "FAILED", error: "INVALID_PHONE" };
    const res = await fetch(`https://api.gptmaker.ai/v2/channel/${channel}/start-conversation`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone, message }), signal: AbortSignal.timeout(10000),
    });
    await res.body?.cancel();
    return res.ok ? { status: "SENT", error: null } : { status: "FAILED", error: `HTTP ${res.status}` };
  } catch { return { status: "FAILED", error: "DELIVERY_FAILED" }; }
}

async function orgService(admin: Admin, orgId: string) {
  const { data: org } = await admin.from("organizations")
    .select("human_hours, human_timezone, city, atendimento_alerta_amarelo_min, atendimento_alerta_vermelho_min").eq("id", orgId).maybeSingle();
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 400 * 86_400_000).toISOString().slice(0, 10);
  const { data: holidays } = await admin.from("holidays").select("date, city")
    .or(`organization_id.is.null,organization_id.eq.${orgId}`).gte("date", from).lte("date", to);
  return {
    config: normalizeHumanHours(org?.human_hours, org?.human_timezone),
    closed: (holidays ?? []) as ClosedDay[], city: (org?.city as string | null) ?? null,
    amarelo: Number(org?.atendimento_alerta_amarelo_min ?? 15) || 15, vermelho: Number(org?.atendimento_alerta_vermelho_min ?? 60) || 60,
  };
}

function stamp(date: Date, tz: string) {
  return date.toLocaleString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

async function releaseQueue(admin: Admin): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: due } = await admin.from("notification_logs").select("id, organization_id, destination, payload")
    .eq("status", "QUEUED").lte("release_at", nowIso).order("release_at").limit(50);
  let released = 0;
  const timelineDone = new Set<string>();
  const demo = due?.length ? await idsDemo(admin) : new Set<string>();
  for (const row of due ?? []) {
    // Claim the row first so overlapping runs never send twice.
    const { data: claimed } = await admin.from("notification_logs").update({ status: "SENDING" })
      .eq("id", row.id).eq("status", "QUEUED").select("id").maybeSingle();
    if (!claimed) continue;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (idsDoPayload(payload).some((id) => demo.has(id))) {
      await admin.from("notification_logs").update({ status: "SKIPPED", error_message: "DEMO" }).eq("id", row.id);
      continue;
    }
    const result = await send(row.destination as string | null, String(payload.message ?? ""));
    await admin.from("notification_logs").update({ status: result.status, error_message: result.error, sent_at: new Date().toISOString() }).eq("id", row.id);
    released++;
    const leadId = typeof payload.lead_id === "string" ? payload.lead_id : null;
    if (leadId && !timelineDone.has(leadId)) {
      timelineDone.add(leadId);
      const svc = await orgService(admin, row.organization_id as string);
      await admin.from("lead_timeline").insert({ organization_id: row.organization_id, lead_id: leadId, tipo: "transferencia", origem: "fera",
        resumo: `Transferência recebida fora do horário; encaminhada em ${stamp(new Date(), svc.config.timezone)}`,
        referencia_id: typeof payload.atendimento_id === "string" ? payload.atendimento_id : null });
    }
  }
  return released;
}

async function phonesFor(admin: Admin, orgId: string, userIds: string[]) {
  if (!userIds.length) return [];
  const { data } = await admin.from("profiles").select("user_id, name, phone, is_active").eq("organization_id", orgId).in("user_id", userIds);
  return (data ?? []).filter((p) => p.is_active !== false && p.phone);
}

async function severityReminders(admin: Admin): Promise<number> {
  const { data: open } = await admin.from("atendimentos")
    .select("id, organization_id, lead_id, empresa, contato_nome, responsavel_id, relogio_inicia_em, alerta_nivel, status")
    .eq("status", "aberto").limit(200);
  let sent = 0;
  const cache = new Map<string, Awaited<ReturnType<typeof orgService>>>();
  const now = new Date();
  const demo = open?.length ? await idsDemo(admin) : new Set<string>();
  for (const at of open ?? []) {
    if (demo.has(at.id as string) || (at.lead_id && demo.has(at.lead_id as string))) continue; // demo atendimento: no reminders
    const org = at.organization_id as string;
    if (!cache.has(org)) cache.set(org, await orgService(admin, org));
    const svc = cache.get(org)!;
    if (!estaEmHorario(now, svc.config, svc.closed, svc.city)) continue;
    const minutes = minutosUteis(new Date(at.relogio_inicia_em as string), now, svc.config, svc.closed, svc.city);
    const level = gravidade(minutes, svc.amarelo, svc.vermelho);
    const rank = { verde: 0, amarelo: 1, vermelho: 2 } as const;
    if (rank[level] <= rank[(at.alerta_nivel as keyof typeof rank) ?? "verde"]) continue;
    const { data: claimed } = await admin.from("atendimentos").update({ alerta_nivel: level })
      .eq("id", at.id).eq("alerta_nivel", at.alerta_nivel).select("id").maybeSingle();
    if (!claimed) continue;
    const targets = new Set<string>();
    if (at.responsavel_id) targets.add(at.responsavel_id as string);
    if (level === "vermelho") {
      const { data: roles } = await admin.from("user_roles").select("user_id, role").in("role", ["admin", "gestor"]);
      const { data: members } = await admin.from("profiles").select("user_id").eq("organization_id", org);
      const inOrg = new Set((members ?? []).map((m) => m.user_id));
      for (const r of roles ?? []) if (inOrg.has(r.user_id)) targets.add(r.user_id);
    }
    const who = [at.empresa, at.contato_nome].filter(Boolean).join(" — ") || "Cliente";
    const message = [level === "vermelho" ? "🔴 Atendimento esperando há mais de " + svc.vermelho + " min" : "🟡 Atendimento esperando há " + minutes + " min",
      `Cliente: ${who}`, `Ver no Fera: ${FERA_URL}/atendimentos?id=${at.id}`, "", "(Mensagem automática — não responda aqui; abra o link.)"].join("\n");
    for (const p of await phonesFor(admin, org, [...targets])) {
      const result = await send(p.phone as string, message);
      await admin.from("notification_logs").insert({ organization_id: org, event_type: `atendimento_${level}`, recipient_name: p.name,
        channel: "WHATSAPP", destination: p.phone, payload: { atendimento_id: at.id, lead_id: at.lead_id, message }, status: result.status, error_message: result.error });
      sent++;
    }
  }
  return sent;
}

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let released = 0, reminders = 0;
  try { released = await releaseQueue(admin); } catch { console.error("[queue] release failed"); }
  try { reminders = await severityReminders(admin); } catch { console.error("[queue] reminders failed"); }
  return json({ released, reminders });
});
