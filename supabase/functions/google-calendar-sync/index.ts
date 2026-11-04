// Daily (cron) + on-demand sync of the Flora Google Calendar into the Fera cache. READ-ONLY on Google:
// only GET requests. Public holidays and all-day Flora events become holidays rows (source='google');
// timed Flora events become google_calendar_busy rows. If Google fails, the previous cache is kept.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { FLORA_CALENDAR_ID, floraSplit, GCAL_GATEWAY, HOLIDAY_CALENDAR_ID, holidayBlocks, listEvents, READ_ONLY_METHOD } from "../_shared/google-calendar.ts";

const ORG = Deno.env.get("NITSCLEAN_ORG_ID") ?? "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization") ?? "";
  // A signed-in user may trigger the sync only as admin/gestor/super_admin of the NitsClean organization.
  let role = "";
  try { role = JSON.parse(atob(auth.replace(/^Bearer\s+/i, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role ?? ""; } catch { /* not a JWT */ }
  // The daily cron calls with the project anon key (role anon); the 1-minute guard below limits repeat calls.
  if (role !== "anon") {
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const { data: prof } = await admin.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
    const set = new Set((roles ?? []).map(r => r.role));
    const allowed = set.has("super_admin") || ((set.has("admin") || set.has("gestor")) && prof?.organization_id === ORG);
    if (!allowed) return json({ error: "Sem permissão" }, 403);
  }
  const { data: st } = await admin.from("google_calendar_sync_status").select("last_attempt_at").eq("organization_id", ORG).maybeSingle();
  if (st?.last_attempt_at && Date.now() - Date.parse(st.last_attempt_at) < 60_000) return json({ ok: true, skipped: "recent" });
  const now = new Date().toISOString();
  await admin.from("google_calendar_sync_status").upsert({ organization_id: ORG, last_attempt_at: now });
  const lovableKey = Deno.env.get("LOVABLE_API_KEY"), connKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  try {
    if (!lovableKey || !connKey) throw new Error("CONFIG_MISSING");
    const creds = { lovableKey, connKey };
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 400 * 86_400_000).toISOString();
    const [hol, flora] = await Promise.all([listEvents(HOLIDAY_CALENDAR_ID, from, to, creds), listEvents(FLORA_CALENDAR_ID, from, to, creds)]);
    const info = await fetch(`${GCAL_GATEWAY}/calendars/primary`, { method: READ_ONLY_METHOD,
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey } });
    const email = info.ok ? ((await info.json()) as { id?: string }).id ?? null : (await info.body?.cancel(), null);
    const holidays = holidayBlocks(hol);
    const { blocks, busy } = floraSplit(flora);
    const rows = [...holidays, ...blocks].map(b => ({ organization_id: ORG, source: "google", ...b }));
    const { error: delErr } = await admin.from("holidays").delete().eq("organization_id", ORG).eq("source", "google");
    if (delErr) throw new Error(`cache holidays: ${delErr.code}`);
    if (rows.length) { const { error } = await admin.from("holidays").insert(rows); if (error) throw new Error(`cache holidays: ${error.code}`); }
    await admin.from("google_calendar_busy").delete().eq("organization_id", ORG);
    if (busy.length) await admin.from("google_calendar_busy").insert(busy.map(b => ({ organization_id: ORG, ...b })));
    await admin.from("google_calendar_sync_status").upsert({ organization_id: ORG, account_email: email, last_attempt_at: now,
      last_success_at: new Date().toISOString(), last_error: null, holidays_count: holidays.length, blocks_count: blocks.length, busy_count: busy.length });
    return json({ ok: true, account_email: email, feriados: holidays.length, bloqueios: blocks.length, ocupados: busy.length });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "erro").slice(0, 300);
    console.error("[google-calendar-sync] failed:", msg);
    await admin.from("google_calendar_sync_status").upsert({ organization_id: ORG, last_attempt_at: now, last_error: msg });
    return json({ ok: false, error: "Falha ao ler o Google Agenda; mantido o último cache.", details: msg }, 502);
  }
});
