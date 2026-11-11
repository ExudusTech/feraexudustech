// Google Calendar is READ-ONLY for the Fera: only GET requests are ever sent, even though the
// connection was authorized with an edit scope. Never add POST/PUT/PATCH/DELETE here.
export const GCAL_GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
export const FLORA_CALENDAR_ID = "primary";
export const HOLIDAY_CALENDAR_ID = "pt-pt.brazilian#holiday@group.v.calendar.google.com";
export const READ_ONLY_METHOD = "GET" as const;

export interface GEvent {
  id?: string; summary?: string; description?: string; status?: string; transparency?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
}
export interface DayBlock { date: string; name: string; city: string | null; kind: "feriado" | "bloqueio"; google_event_id: string }
export interface BusySlot { google_event_id: string; start_at: string; end_at: string }

type Fetch = (url: string, init: { method: "GET"; headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

function timeoutSignal(ms: number): AbortSignal | undefined {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
}

/** Lists events (single instances) of a calendar between two instants. Only GET is used. */
export async function listEvents(calendarId: string, timeMin: string, timeMax: string,
  creds: { lovableKey: string; connKey: string }, fetchFn: Fetch = fetch as unknown as Fetch): Promise<GEvent[]> {
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetchFn(`${GCAL_GATEWAY}/calendars/${encodeURIComponent(calendarId)}/events?${q}`, {
      method: READ_ONLY_METHOD, signal: timeoutSignal(10000),
      headers: { Authorization: `Bearer ${creds.lovableKey}`, "X-Connection-Api-Key": creds.connKey } });
    if (!res.ok) { const body = await res.text(); throw new Error(`Google Calendar HTTP ${res.status}: ${body.slice(0, 200)}`); }
    const json = await res.json() as { items?: GEvent[]; nextPageToken?: string };
    items.push(...(json.items ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

/** Public holiday only ("Feriado"); "Data comemorativa"/observances and "Ponto facultativo" are business days. */
export function isPublicHoliday(ev: GEvent): boolean {
  const first = (ev.description ?? "").split("\n")[0].trim().toLowerCase();
  return first.startsWith("feriado") && !first.includes("facultativo");
}

/** Expands an all-day event into its dates. Start inclusive, end exclusive (Google rule). */
export function allDayDates(ev: GEvent): string[] {
  const s = ev.start?.date, e = ev.end?.date;
  if (!s) return [];
  const out: string[] = [];
  let t = Date.parse(`${s}T12:00:00Z`);
  const end = e ? Date.parse(`${e}T12:00:00Z`) : t + 86_400_000;
  while (t < end && out.length < 366) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86_400_000; }
  return out;
}

/** "[Cidade: Búzios]" in the title or description restricts the block to that city. */
export function blockCity(ev: GEvent): string | null {
  const m = `${ev.summary ?? ""} ${ev.description ?? ""}`.match(/\[\s*cidade\s*:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

export function holidayBlocks(events: GEvent[]): DayBlock[] {
  return events.filter(ev => ev.status !== "cancelled" && ev.start?.date && isPublicHoliday(ev))
    .flatMap(ev => allDayDates(ev).map(date => ({ date, name: ev.summary?.trim() || "Feriado", city: null,
      kind: "feriado" as const, google_event_id: ev.id ?? "" })));
}

export function floraSplit(events: GEvent[]): { blocks: DayBlock[]; busy: BusySlot[] } {
  const live = events.filter(ev => ev.status !== "cancelled");
  const blocks = live.filter(ev => ev.start?.date).flatMap(ev => {
    const name = (ev.summary ?? "Dia bloqueado").replace(/\[\s*cidade\s*:[^\]]*\]/i, "").trim() || "Dia bloqueado";
    return allDayDates(ev).map(date => ({ date, name, city: blockCity(ev), kind: "bloqueio" as const, google_event_id: ev.id ?? "" }));
  });
  const busy = live.filter(ev => ev.start?.dateTime && ev.end?.dateTime && ev.transparency !== "transparent")
    .map(ev => ({ google_event_id: ev.id ?? "", start_at: new Date(ev.start!.dateTime!).toISOString(),
      end_at: new Date(ev.end!.dateTime!).toISOString() }));
  return { blocks, busy };
}

/** Flora calendar timed busy between two São Paulo dates (READ-ONLY GET), falling back to the synced google_calendar_busy cache. */
// deno-lint-ignore no-explicit-any
export async function googleOcupado(admin: any, orgId: string, from: string, to: string): Promise<{ start: number; end: number }[]> {
  const timeMin = new Date(`${from}T00:00:00-03:00`).toISOString(), timeMax = new Date(Date.parse(`${to}T00:00:00-03:00`) + 86_400_000).toISOString();
  try {
    // deno-lint-ignore no-explicit-any
    const env = (globalThis as any).Deno?.env;
    const lovableKey = env?.get("LOVABLE_API_KEY"), connKey = env?.get("GOOGLE_CALENDAR_API_KEY");
    if (!lovableKey || !connKey) throw new Error("cfg");
    const evs = await listEvents(FLORA_CALENDAR_ID, timeMin, timeMax, { lovableKey, connKey });
    return evs.filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && e.start?.dateTime && e.end?.dateTime)
      .map((e) => ({ start: Date.parse(e.start!.dateTime!), end: Date.parse(e.end!.dateTime!) }));
  } catch {
    const { data } = await admin.from("google_calendar_busy").select("start_at, end_at").eq("organization_id", orgId).lt("start_at", timeMax).gt("end_at", timeMin);
    // deno-lint-ignore no-explicit-any
    return (data ?? []).map((r: any) => ({ start: Date.parse(r.start_at), end: Date.parse(r.end_at) }));
  }
}
