/**
 * Fera MCP Server — Supabase Edge Function
 * Flora (GPT Maker) ↔ Fera integration via Model Context Protocol (JSON-RPC 2.0)
 *
 * Deploy: supabase/functions/mcp/index.ts
 * Auth: Bearer Token (MCP_BEARER_TOKEN secret)
 * verify_jwt: false (custom auth below)
 *
 * 21 Tools in 6 Blocks:
 *   Block 1 — Identification (READ):   buscar_contato, verificar_cobertura_regiao,
 *                                       consultar_rota_consultor, obter_promocao_vigente,
 *                                       consultar_produto
 *   Block 2 — Lead Capture (WRITE):    criar_lead, atualizar_lead, registrar_interacao
 *   Block 3 — Scheduling (R+W):        listar_horarios_disponiveis, agendar_visita,
 *                                       agendar_visita_tecnica, agendar_reuniao_sede,
 *                                       cancelar_reagendar_visita
 *   Block 4 — CRM Pipeline (WRITE):    mover_lead_estagio, atribuir_responsavel, adicionar_tag
 *   Block 5 — Routing/Exceptions:      solicitar_atendimento_humano, registrar_fora_cobertura
 *   Block 6 — WebChat OTP:             enviar_codigo_otp, validar_codigo_otp
 *
 * Changelog:
 *   v3.0.0 (2026-08-12) — Onda 3 / Fase A: Sistema de notificações. notificar_equipe (interno),
 *                          integrado a agendar_visita_tecnica. Variáveis GPTMAKER_API_TOKEN e
 *                          GPTMAKER_FLORAZAP_CHANNEL_ID adicionadas.
 *   v2.0.0 (2026-07-21) — Onda 1: buscar_contato reescrito (LGPD/B2B), consultar_rota_consultor,
 *                          agendar_visita_tecnica, agendar_reuniao_sede, enviar_codigo_otp,
 *                          validar_codigo_otp. criar_lead com campos B2B + post tracking.
 *   v1.0.0 — Release inicial (15 tools)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_BEARER_TOKEN          = Deno.env.get("MCP_BEARER_TOKEN")!;

// NitsClean organization ID (fallback hardcoded caso env var não esteja definida)
const NITSCLEAN_ORG_ID = Deno.env.get("NITSCLEAN_ORG_ID") ?? "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";

/** Generic DB failure: logs only stage + error code server-side, returns a generic message. */
function dbFail(acao: string, err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "unknown";
  console.error(`[MCP] db error at ${acao}`, code);
  return `Erro interno ao ${acao}`;
}

/** Organization-level default owner for Flora leads/visits (null when unset or unreadable). */
async function floraDefaultOwner(client: any): Promise<string | null> {
  try {
    const { data, error } = await client.from("organizations")
      .select("flora_default_lead_owner").eq("id", NITSCLEAN_ORG_ID).maybeSingle();
    if (error) return null;
    return (data?.flora_default_lead_owner as string | null) ?? null;
  } catch { return null; }
}

// GPT Maker — notificações via Florazap (WhatsApp)
const GPTMAKER_API_TOKEN          = Deno.env.get("GPTMAKER_API_TOKEN") ?? "";
const GPTMAKER_WHATSAPP_CHANNEL_ID = Deno.env.get("GPTMAKER_WHATSAPP_CHANNEL_ID") ?? "";

// CORS headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  success: boolean;
  data?: unknown;
  message?: string;
  next_action_hint?: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authenticate(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${MCP_BEARER_TOKEN}`;
  const match = auth === expected;
  return match;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_PARAM_VALUES = new Set([
  "nao informado", "nao informada", "n/a", "na", "-", "nenhum", "nenhuma",
  "null", "undefined", "desconhecido", "sem", "",
]);

function normalizeParamValue(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const comparable = trimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return EMPTY_PARAM_VALUES.has(comparable) || /^\{\{[^{}]*\}\}$/.test(trimmed) ? null : value;
  }
  if (Array.isArray(value)) return value.map(normalizeParamValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeParamValue(item)]));
  }
  return value;
}

type ChatChannel = "WHATSAPP" | "INSTAGRAM" | "MESSENGER" | "WIDGET";

function resolveChannelFromChatId(chat_id: unknown): { canal: ChatChannel; identificador: string } | null {
  if (typeof chat_id !== "string" || !chat_id.trim()) return null;
  const chatId = chat_id.trim();
  if (chatId.startsWith("public-api-")) {
    const identificador = chatId.slice("public-api-".length);
    return identificador ? { canal: "WIDGET", identificador } : null;
  }
  const separator = chatId.indexOf("-");
  if (separator < 1 || separator === chatId.length - 1) return null;
  const channels: Record<string, ChatChannel> = {
    "3DF9D839DDCF463A3A350ADF91C40B89": "WHATSAPP",
    "3E081F8C517E26FF46107A02E12740D2": "INSTAGRAM",
    "3E082145442EE648F743C673F12AF2BE": "MESSENGER",
    "3E08E0CA2B9116C7F54E966EEA33054D": "WIDGET",
    "3E0F16F36DFEF0E420EC0EFA190C3F41": "WIDGET",
  };
  const canal = channels[chatId.slice(0, separator)];
  return canal ? { canal, identificador: chatId.slice(separator + 1) } : null;
}

function applyChatChannel(method: string, params: Record<string, unknown>): Record<string, unknown> {
  const resolved = resolveChannelFromChatId(params.chat_id);
  if (!resolved) return params;
  const enriched = {
    ...params,
    canal: resolved.canal,
    canal_origem: resolved.canal,
    canal_tipo: resolved.canal === "INSTAGRAM" ? "INSTAGRAM_UID" : resolved.canal,
    canal_id: resolved.identificador,
  };
  if (resolved.canal === "WHATSAPP" && !params.telefone &&
      ["buscar_contato", "criar_lead", "registrar_fora_cobertura"].includes(method)) {
    return { ...enriched, telefone: resolved.identificador };
  }
  return enriched;
}

type PessoaRecord = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  instagram_user_id?: string | null;
  instagram_handle?: string | null;
  messenger_id?: string | null;
  chat_ids?: string[] | null;
};

function digits(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\D/g, "");
  return normalized || null;
}

function normalizedEstablishment(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function pessoaChannelFields(params: Record<string, unknown>): Partial<PessoaRecord> {
  const resolved = resolveChannelFromChatId(params.chat_id);
  const fields: Partial<PessoaRecord> = {};
  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  const phone = digits(params.telefone);
  if (email) fields.email = email;
  if (phone) fields.telefone = phone;
  if (typeof params.instagram_handle === "string" && params.instagram_handle.trim()) {
    fields.instagram_handle = params.instagram_handle.trim().replace(/^@/, "");
  }
  if (resolved?.canal === "WHATSAPP") fields.whatsapp = resolved.identificador;
  if (resolved?.canal === "INSTAGRAM") fields.instagram_user_id = resolved.identificador;
  if (resolved?.canal === "MESSENGER") fields.messenger_id = resolved.identificador;
  return fields;
}

async function resolvePessoa(
  supabase: ReturnType<typeof getClient>, params: Record<string, unknown>, createIfMissing: boolean,
): Promise<{ pessoa: PessoaRecord | null; error?: string }> {
  const channelFields = pessoaChannelFields(params);
  const lookups: [keyof PessoaRecord, string][] = [];
  for (const key of ["whatsapp", "telefone", "instagram_user_id", "messenger_id"] as const) {
    const value = channelFields[key];
    if (typeof value === "string" && value) lookups.push([key, value]);
  }
  if (channelFields.email) lookups.push(["email", channelFields.email]);

  let pessoa: PessoaRecord | null = null;
  for (const [field, value] of lookups) {
    const query = supabase.from("pessoas")
      .select("id, nome, email, telefone, whatsapp, instagram_user_id, instagram_handle, messenger_id, chat_ids")
      .eq("organization_id", NITSCLEAN_ORG_ID);
    const { data, error } = field === "email"
      ? await query.ilike("email", value).limit(1).maybeSingle()
      : await query.eq(field, value).limit(1).maybeSingle();
    if (error) return { pessoa: null, error: dbFail("consultar pessoa", error) };
    if (data) { pessoa = data as PessoaRecord; break; }
  }

  const chatId = typeof params.chat_id === "string" && params.chat_id.trim() ? params.chat_id.trim() : null;
  const nome = typeof params.nome === "string" && params.nome.trim() ? params.nome.trim() : "Contato";
  if (!pessoa && createIfMissing) {
    const { data, error } = await supabase.from("pessoas").insert({
      organization_id: NITSCLEAN_ORG_ID,
      nome,
      ...channelFields,
      chat_ids: chatId ? [chatId] : [],
    }).select("id, nome, email, telefone, whatsapp, instagram_user_id, instagram_handle, messenger_id, chat_ids").single();
    if (error) return { pessoa: null, error: dbFail("consultar pessoa", error) };
    pessoa = data as PessoaRecord;
  }

  if (!pessoa) return { pessoa: null };
  const updates: Record<string, unknown> = {};
  if ((!pessoa.nome || pessoa.nome === "Contato") && nome !== "Contato") updates.nome = nome;
  for (const [key, value] of Object.entries(channelFields)) {
    if (value && !pessoa[key as keyof PessoaRecord]) updates[key] = value;
  }
  const chatIds = Array.isArray(pessoa.chat_ids) ? pessoa.chat_ids : [];
  if (chatId && !chatIds.includes(chatId)) updates.chat_ids = [...chatIds, chatId];
  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase.from("pessoas").update(updates).eq("id", pessoa.id)
      .eq("organization_id", NITSCLEAN_ORG_ID)
      .select("id, nome, email, telefone, whatsapp, instagram_user_id, instagram_handle, messenger_id, chat_ids").single();
    if (error) return { pessoa: null, error: dbFail("consultar pessoa", error) };
    pessoa = data as PessoaRecord;
  }
  return { pessoa };
}

async function pessoaWithLeads(supabase: ReturnType<typeof getClient>, pessoa: PessoaRecord): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("leads")
    .select("id, empresa_nome, company, title, city, stage, category")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("pessoa_id", pessoa.id)
    .order("created_at", { ascending: false }).limit(5);
  if (error) throw new Error(dbFail("consultar leads da pessoa", error));
  // Companies (clients) this person represents — one person may represent several companies.
  const { data: links } = await supabase.from("empresa_contatos")
    .select("client_id, cargo, clients(id, name, city)")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("pessoa_id", pessoa.id).limit(10);
  const clientes = ((links as Record<string, any>[] | null) ?? []).filter((l) => l?.client_id && l.clients)
    .map((l) => ({ cliente_id: l.client_id, empresa: l.clients.name ?? null, cidade: l.clients.city ?? null, cargo: l.cargo ?? null }));
  return {
    ...(clientes.length ? { clientes_da_pessoa: clientes } : {}),
    encontrado: true,
    pessoa: { id: pessoa.id, nome: pessoa.nome },
    contato: {
      contato_id: pessoa.id,
      nome: pessoa.nome,
      telefone: pessoa.telefone ?? pessoa.whatsapp ?? null,
      email: pessoa.email ?? null,
      instagram_handle: pessoa.instagram_handle ?? null,
    },
    leads_da_pessoa: (data ?? []).map((lead: Record<string, unknown>) => ({
      id: lead.id,
      empresa: lead.empresa_nome ?? lead.company ?? lead.title ?? null,
      cidade: lead.city ?? null,
      estagio: lead.stage,
      produto: lead.category ?? null,
    })),
  };
}

async function resolveVisitProduct(
  supabase: ReturnType<typeof getClient>, leadId: string | undefined, product: string | undefined
): Promise<string | null> {
  const supplied = normalizeParamValue(product);
  if (typeof supplied === "string") return supplied.trim();
  if (!leadId) return null;
  const { data, error } = await supabase.from("leads").select("category")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", leadId).maybeSingle();
  if (error) throw new Error(dbFail("consultar produto do lead", error));
  const category = normalizeParamValue(data?.category);
  return typeof category === "string" ? category.trim() : null;
}

function timeMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : NaN;
}

function displayTime(time: string): string {
  const [hours, minutes] = time.split(":");
  return `${Number(hours)}h${minutes === "00" ? "" : minutes}`;
}

interface Holiday { date: string; name: string; city: string | null }

async function loadHolidays(supabase: ReturnType<typeof getClient>, from: string, to: string): Promise<Holiday[]> {
  const { data, error } = await supabase.from("holidays").select("date, name, city")
    .or(`organization_id.is.null,organization_id.eq.${NITSCLEAN_ORG_ID}`)
    .gte("date", from).lte("date", to);
  if (error) throw new Error(dbFail("consultar feriados", error));
  return data ?? [];
}

// Google Calendar (Flora main calendar) busy slots — READ-ONLY: only GET is ever sent.
// Live read with a short in-memory cache; on failure falls back to the google_calendar_busy cache table.
const GCAL_BUSY_TTL_MS = 5 * 60_000;
let gcalBusyCache: { at: number; from: string; to: string; slots: { start: number; end: number }[] } | null = null;

async function googleBusy(supabase: ReturnType<typeof getClient>, fromDate: string, toDate: string): Promise<{ start: number; end: number }[]> {
  if (gcalBusyCache && Date.now() - gcalBusyCache.at < GCAL_BUSY_TTL_MS && gcalBusyCache.from <= fromDate && gcalBusyCache.to >= toDate) return gcalBusyCache.slots;
  const timeMin = new Date(`${fromDate}T00:00:00-03:00`).toISOString();
  const timeMax = new Date(Date.parse(`${toDate}T00:00:00-03:00`) + 86_400_000).toISOString();
  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY"), connKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!lovableKey || !connKey) throw new Error("CONFIG_MISSING");
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    const res = await fetch(`https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars/primary/events?${q}`, {
      method: "GET", headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
    const body = await res.json() as { items?: { status?: string; transparency?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[] };
    const slots = (body.items ?? []).filter(ev => ev.status !== "cancelled" && ev.transparency !== "transparent" && ev.start?.dateTime && ev.end?.dateTime)
      .map(ev => ({ start: Date.parse(ev.start!.dateTime!), end: Date.parse(ev.end!.dateTime!) }));
    gcalBusyCache = { at: Date.now(), from: fromDate, to: toDate, slots };
    return slots;
  } catch (error) {
    console.error("[gcal] live busy read failed, using cache:", error instanceof Error ? error.message : "erro");
    try {
      const { data } = await supabase.from("google_calendar_busy").select("start_at, end_at")
        .eq("organization_id", NITSCLEAN_ORG_ID).lt("start_at", timeMax).gt("end_at", timeMin);
      return Array.isArray(data) ? data.map((r: { start_at: string; end_at: string }) => ({ start: Date.parse(r.start_at), end: Date.parse(r.end_at) })) : [];
    } catch { return []; }
  }
}

/** True when [date hh:mm, +duration) overlaps a Google busy slot (São Paulo time). */
function googleClash(slots: { start: number; end: number }[], date: string, startMin: number, durationMin: number): boolean {
  const s = Date.parse(`${date}T${fromMin(startMin)}:00-03:00`);
  const e = s + durationMin * 60_000;
  return slots.some(b => s < b.end && b.start < e);
}

function holidayForDate(holidays: Holiday[], date: string, city?: string | null): Holiday | undefined {
  return holidays.find(holiday => holiday.date === date &&
    (holiday.city === null || (typeof city === "string" && sameCity(holiday.city, city))));
}

async function rejectHolidayVisit(supabase: ReturnType<typeof getClient>, date: string, city?: string): Promise<McpResponse | null> {
  const holiday = holidayForDate(await loadHolidays(supabase, date, date), date, city);
  if (!holiday) return null;
  const message = `Nessa data não teremos atendimento por ser feriado (${holiday.name}). Posso te oferecer outra data?`;
  return { success: false, message,
    data: { data_visita: date, feriado: holiday.name, mensagem_para_lead: message },
    next_action_hint: `Envie ao lead: "${message}"` };
}

function ok(data: unknown, message?: string, hint?: string): McpResponse {
  return { success: true, data, message, next_action_hint: hint };
}

function fail(message: string, hint?: string): McpResponse {
  return { success: false, message, next_action_hint: hint };
}

function jsonRpcResult(id: string | number, result: McpResponse): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, result }),
    { headers: CORS_HEADERS }
  );
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string
): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { headers: CORS_HEADERS }
  );
}

// ─── Supabase client (service role — bypasses RLS for Flora) ──────────────────

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── Log each Flora tool call ──────────────────────────────────────────────────

async function logInteraction(
  supabase: ReturnType<typeof getClient>,
  tool: string,
  payload: unknown,
  response: McpResponse,
  leadId?: string,
  canal?: string,
  interactionId?: string
) {
  await supabase.from("flora_interactions").insert({
    organization_id: NITSCLEAN_ORG_ID,
    lead_id: leadId ?? null,
    interaction_id: interactionId ?? null,
    canal: canal ?? null,
    tool_name: tool,
    payload,
    response,
  });
}

// ─── Human service hours (Lote 8) ───
// BEGIN business-hours (pure; the mcp function embeds an identical copy — keep in sync, a test enforces it)
interface HumanHoursConfig { days: number[]; start: string; end: string; timezone: string }
interface ClosedDay { date: string; city: string | null }
interface NextOpening { at: Date; date: string; label: string; labelComArtigo: string }

const BH_DEFAULT: HumanHoursConfig = { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", timezone: "America/Sao_Paulo" };
const BH_WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function normalizeHumanHours(raw: unknown, timezone?: unknown): HumanHoursConfig {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const time = (v: unknown, fallback: string) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
  const days = Array.isArray(value.days) ? value.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : BH_DEFAULT.days;
  const start = time(value.start, BH_DEFAULT.start);
  let end = time(value.end, BH_DEFAULT.end);
  if (bhMinutes(end) <= bhMinutes(start)) end = BH_DEFAULT.end;
  return { days: days.length ? Array.from(new Set(days)).sort() : BH_DEFAULT.days, start, end,
    timezone: typeof timezone === "string" && timezone ? timezone : BH_DEFAULT.timezone };
}

function bhMinutes(time: string): number { const [h, m] = time.split(":").map(Number); return h * 60 + m; }

function bhParts(date: Date, timezone: string): { ymd: string; dow: number; minutes: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(date).map(p => [p.type, p.value]));
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return { ymd, dow, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** UTC instant for a wall-clock time in the given zone. */
function bhZoned(ymd: string, minutes: number, timezone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const local = bhParts(new Date(guess), timezone);
  const [ly, lm, ld] = local.ymd.split("-").map(Number);
  const offset = Date.UTC(ly, lm - 1, ld, Math.floor(local.minutes / 60), local.minutes % 60) - guess;
  return new Date(guess - offset);
}

function bhAddDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function bhCityKey(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isClosedDate(ymd: string, config: HumanHoursConfig, closed: ClosedDay[], city?: string | null): boolean {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  if (!config.days.includes(dow)) return true;
  return closed.some(day => day.date === ymd && (day.city === null || (typeof city === "string" && bhCityKey(day.city) === bhCityKey(city))));
}

function estaEmHorario(now: Date, config: HumanHoursConfig, closed: ClosedDay[], city?: string | null): boolean {
  const local = bhParts(now, config.timezone);
  if (isClosedDate(local.ymd, config, closed, city)) return false;
  return local.minutes >= bhMinutes(config.start) && local.minutes < bhMinutes(config.end);
}

function bhLabel(ymd: string, start: string): { label: string; labelComArtigo: string } {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  const [, mm, dd] = ymd.split("-");
  const [h, m] = start.split(":");
  const hour = `${Number(h)}h${m === "00" ? "" : m}`;
  const label = `${BH_WEEKDAYS[dow]}, ${dd}/${mm}, a partir das ${hour}`;
  return { label, labelComArtigo: `${dow === 0 || dow === 6 ? "no" : "na"} ${label}` };
}

/** Start of the next human-service period (now itself when currently open). */
function proximoHorarioUtil(now: Date, config: HumanHoursConfig, closed: ClosedDay[], city?: string | null): NextOpening {
  const local = bhParts(now, config.timezone);
  const start = bhMinutes(config.start);
  if (estaEmHorario(now, config, closed, city)) {
    return { at: now, date: local.ymd, ...bhLabel(local.ymd, config.start) };
  }
  for (let i = 0; i < 400; i++) {
    const ymd = bhAddDays(local.ymd, i);
    if (isClosedDate(ymd, config, closed, city)) continue;
    if (i === 0 && local.minutes >= start) continue;
    return { at: bhZoned(ymd, start, config.timezone), date: ymd, ...bhLabel(ymd, config.start) };
  }
  const fallback = bhAddDays(local.ymd, 1);
  return { at: bhZoned(fallback, start, config.timezone), date: fallback, ...bhLabel(fallback, config.start) };
}

/** Minutes between two instants that fall inside human-service windows. */
function minutosUteis(from: Date, to: Date, config: HumanHoursConfig, closed: ClosedDay[], city?: string | null): number {
  if (!(to.getTime() > from.getTime())) return 0;
  let total = 0;
  let ymd = bhParts(from, config.timezone).ymd;
  const lastYmd = bhParts(to, config.timezone).ymd;
  for (let guard = 0; guard < 800 && ymd <= lastYmd; guard++, ymd = bhAddDays(ymd, 1)) {
    if (isClosedDate(ymd, config, closed, city)) continue;
    const open = bhZoned(ymd, bhMinutes(config.start), config.timezone).getTime();
    const close = bhZoned(ymd, bhMinutes(config.end), config.timezone).getTime();
    const a = Math.max(open, from.getTime());
    const b = Math.min(close, to.getTime());
    if (b > a) total += (b - a) / 60_000;
  }
  return Math.floor(total);
}

function gravidade(minutos: number, amarelo = 15, vermelho = 60): "verde" | "amarelo" | "vermelho" {
  return minutos > vermelho ? "vermelho" : minutos > amarelo ? "amarelo" : "verde";
}
// END business-hours

interface HumanService { config: HumanHoursConfig; closed: ClosedDay[]; city: string | null; urgentBypass: boolean;
  defaultOwner: string | null; }

async function loadHumanService(supabase: ReturnType<typeof getClient>, now: Date): Promise<HumanService> {
  let org: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase.from("organizations").select("human_hours, human_timezone, human_urgent_bypass, city, flora_default_lead_owner")
      .eq("id", NITSCLEAN_ORG_ID).maybeSingle();
    org = data ?? null;
  } catch { console.error("[human_hours] organization lookup failed"); }
  let closed: ClosedDay[] = [];
  try {
    const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    const to = new Date(now.getTime() + 400 * 86_400_000).toISOString().slice(0, 10);
    closed = (await loadHolidays(supabase, from, to)).map(h => ({ date: h.date, city: h.city }));
  } catch { console.error("[human_hours] holiday lookup failed"); }
  return { config: normalizeHumanHours(org?.human_hours, org?.human_timezone), closed,
    city: typeof org?.city === "string" ? org.city : null, urgentBypass: org?.human_urgent_bypass === true,
    defaultOwner: typeof org?.flora_default_lead_owner === "string" ? org.flora_default_lead_owner : null };
}

function stampSaoPaulo(date: Date, timezone = "America/Sao_Paulo"): string {
  return date.toLocaleString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

const HUMAN_IN_HOURS_MESSAGE = "Já passei sua solicitação para nossa equipe, que vai te responder por aqui em breve.";
function humanOutOfHoursMessage(next: NextOpening): string {
  return `Nossa equipe de atendimento retoma ${next.labelComArtigo}. Já deixei sua solicitação registrada e ela será a primeira a ser encaminhada nesse horário. 😊`;
}

// ─── Team notifications: isolated background work, tenant/event subscriptions ───

type TeamEvent = "agendamento_comercial" | "transferencia" | "lead_matriz";
const FERA_NOTIFICATION_URL = "https://fera.exudustech.com.br";

function notificationText(event: TeamEvent, params: Record<string, unknown>, lead: Record<string, unknown> | null,
  leadId?: string, scheduleId?: string): string {
  const text = (value: unknown) => typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim().slice(0, 240) : "";
  const company = text(params.empresa) || text(lead?.empresa_nome) || text(lead?.company);
  const contact = text(params.nome_contato) || text(params.nome) || text(lead?.contact_name);
  const client = [company, contact].filter(Boolean).join(" — ") || "Não informado";
  const city = text(params.cidade) || text(lead?.regiao);
  const atendimentoId = text(params.atendimento_id);
  const link = scheduleId ? `${FERA_NOTIFICATION_URL}/agenda?agendamento=${encodeURIComponent(scheduleId)}`
    : atendimentoId ? `${FERA_NOTIFICATION_URL}/atendimentos?id=${encodeURIComponent(atendimentoId)}`
    : leadId ? `${FERA_NOTIFICATION_URL}/leads?lead=${encodeURIComponent(leadId)}` : `${FERA_NOTIFICATION_URL}/leads`;
  const lines: string[] = [];
  if (event === "agendamento_comercial") {
    lines.push("📅 Nova visita comercial agendada pela Flora", `Cliente: ${client}`);
    const street = text(params.endereco) || text(lead?.endereco);
    const neighborhood = text(params.bairro) || text(lead?.bairro);
    const leadCity = text(lead?.city) || city;
    const whereParts = [street];
    if (neighborhood && !street.toLowerCase().includes(neighborhood.toLowerCase())) whereParts.push(neighborhood);
    if (leadCity && !street.toLowerCase().includes(leadCity.toLowerCase())) whereParts.push(leadCity);
    const where = whereParts.filter(Boolean).join(", ");
    if (where) lines.push(`Onde: ${where}`);
    const mapsUrl = text(params.maps_url) || text(lead?.maps_url);
    if (mapsUrl) lines.push(`Mapa: ${mapsUrl}`);
    const dateString = text(params.data_visita);
    const date = new Date(`${dateString}T12:00:00Z`);
    const dateLabel = Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR", {
      timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit",
    }) : dateString;
    lines.push(`Quando: ${dateLabel} às ${text(params.horario).slice(0, 5)}`);
    const product = text(params.produto_interesse) || text(lead?.category);
    if (product) lines.push(`Produto: ${product}`);
  } else {
    const heading = text(params.titulo)
      || (event === "lead_matriz" ? "🏢 Lead recebido da Matriz" : "👤 Atendimento transferido pela Flora");
    lines.push(heading, `Cliente: ${client}`);
    const whatsapp = digits(params.whatsapp_cliente);
    if (whatsapp) lines.push(`WhatsApp: https://wa.me/${whatsapp}`);
    const instagram = text(params.instagram_cliente).replace(/^@/, "");
    if (instagram) lines.push(`Instagram: @${instagram}`);
    if (city) lines.push(`Cidade: ${city}`);
    const product = text(params.produto_interesse) || text(lead?.category);
    if (product) lines.push(`Produto: ${product}`);
    const summary = text(params.resumo);
    if (summary) lines.push(`O que o cliente pediu: ${summary}`);
    lines.push(`Motivo: ${text(params.motivo) || "Atendimento humano solicitado"}`);
    const urgency = text(params.urgencia);
    if (urgency) lines.push(`Urgência: ${urgency}`);
    const outside = text(params.recebido_fora_em);
    if (outside) lines.push(`Recebido fora do horário em ${outside}`);
  }
  return [...lines, `Ver no Fera: ${link}`, "", "(Mensagem automática — não responda aqui; abra o link.)"].join("\n");
}

async function dispatchTeamNotification(supabase: ReturnType<typeof getClient>, event: TeamEvent,
  params: Record<string, unknown>, leadId?: string, scheduleId?: string, releaseAt?: string): Promise<void> {
  // Demo scenario records (Configurações → Dados de demonstração) never trigger real WhatsApp messages.
  const demoIds = [leadId, scheduleId, params.atendimento_id].filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v));
  if (demoIds.length && typeof (supabase as any).rpc === "function") {
    try { const { data: isDemo } = await (supabase as any).rpc("demo_envolvido", { _ids: demoIds }); if (isDemo === true) return; } catch { /* lookup only */ }
  }
  const { data: recipients, error } = await supabase.from("notification_recipients")
    .select("id, nome, whatsapp, user_id").eq("organization_id", NITSCLEAN_ORG_ID).eq("ativo", true)
    .contains("eventos", [event]);
  if (error) throw new Error("Recipient lookup failed");
  if (!recipients?.length) return;
  // Linked users: always read the current WhatsApp from their profile (inactive users are skipped).
  const linkedIds = recipients.map((r: { user_id?: string | null }) => r.user_id).filter(Boolean);
  if (linkedIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, name, phone, is_active")
      .eq("organization_id", NITSCLEAN_ORG_ID).in("user_id", linkedIds);
    const byUser = new Map((Array.isArray(profiles) ? profiles : []).map((p: Record<string, unknown>) => [p.user_id, p]));
    for (const r of recipients as Array<Record<string, unknown>>) {
      if (!r.user_id) continue;
      const p = byUser.get(r.user_id) as Record<string, unknown> | undefined;
      r.whatsapp = p && p.is_active !== false ? (p.phone as string | null) ?? null : null;
      if (p?.name) r.nome = p.name;
    }
  }
  let lead: Record<string, unknown> | null = null;
  if (leadId || params.interaction_id) {
    let query = supabase.from("leads").select("id, empresa_nome, company, contact_name, contact_phone, endereco, bairro, city, regiao, maps_url, category")
      .eq("organization_id", NITSCLEAN_ORG_ID);
    query = leadId ? query.eq("id", leadId) : query.eq("interaction_id", params.interaction_id);
    const result = await query.maybeSingle();
    if (!result.error && result.data) { lead = result.data; leadId = result.data.id; }
  }
  const message = notificationText(event, params, params.__current_establishment ? null : lead, leadId, scheduleId);
  const atendimentoId = typeof params.atendimento_id === "string" ? params.atendimento_id : null;
  if (releaseAt) {
    // Outside human-service hours: hold the alert; release-notification-queue sends it at the next opening.
    for (const recipient of recipients) {
      const { error: queueError } = await supabase.from("notification_logs").insert({
        organization_id: NITSCLEAN_ORG_ID, event_type: event, recipient_id: recipient.id, recipient_name: recipient.nome,
        channel: "WHATSAPP", destination: recipient.whatsapp,
        payload: { lead_id: leadId ?? null, atendimento_id: atendimentoId, message },
        status: "QUEUED", sent_at: null, queued_at: new Date().toISOString(), release_at: releaseAt,
      });
      if (queueError) console.error("[team_notifications] Queue insert failed");
    }
    return;
  }
  for (const recipient of recipients) {
    let status = "FAILED";
    let errorMessage: string | null = null;
    try {
      if (!GPTMAKER_API_TOKEN || !GPTMAKER_WHATSAPP_CHANNEL_ID) throw new Error("CONFIG_MISSING");
      if (!/^\d{8,15}$/.test(recipient.whatsapp ?? "")) throw new Error("INVALID_PHONE");
      const response = await fetch(`https://api.gptmaker.ai/v2/channel/${GPTMAKER_WHATSAPP_CHANNEL_ID}/start-conversation`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${GPTMAKER_API_TOKEN}` },
        body: JSON.stringify({ phone: recipient.whatsapp, message }), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) errorMessage = `HTTP ${response.status}`;
      else status = "SENT";
      // Never store provider response bodies: they can echo credentials or contact data.
      await response.body?.cancel();
    } catch (error) {
      errorMessage = error instanceof Error && ["CONFIG_MISSING", "INVALID_PHONE"].includes(error.message)
        ? error.message : "DELIVERY_FAILED";
    }
    try {
      const { error: logError } = await supabase.from("notification_logs").insert({
        organization_id: NITSCLEAN_ORG_ID, event_type: event, recipient_id: recipient.id, recipient_name: recipient.nome,
        channel: "WHATSAPP", destination: recipient.whatsapp, payload: { lead_id: leadId ?? null, schedule_id: scheduleId ?? null, ...(atendimentoId ? { atendimento_id: atendimentoId } : {}), message },
        status, error_message: errorMessage,
      });
      if (logError) console.error("[team_notifications] Delivery log failed");
    } catch { console.error("[team_notifications] Delivery log failed"); }
  }
}

function queueTeamNotification(supabase: ReturnType<typeof getClient>, event: TeamEvent,
  params: Record<string, unknown>, leadId?: string, scheduleId?: string, releaseAt?: string): void {
  try {
    const task = Promise.resolve().then(() => dispatchTeamNotification(supabase, event, params, leadId, scheduleId, releaseAt))
      .catch(() => { console.error("[team_notifications] Background delivery failed"); });
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<void>) => void } }).EdgeRuntime;
    runtime?.waitUntil(task);
  } catch { console.error("[team_notifications] Could not schedule delivery"); }
}

// ─── Utility: SHA-256 hash ────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Utility: parse dia_semana text → JS DoW numbers ─────────────────────────
// Handles: "4ª feira", "3ª feira e 5ª feira", "2ª feira e 6ª feira"
// Portuguese ordinals: 2ª=Segunda(Mon), 3ª=Terça(Tue), 4ª=Quarta(Wed),
//                      5ª=Quinta(Thu), 6ª=Sexta(Fri)
// JS getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

function parseDiaSemana(diaSemana: string): number[] {
  const matches = diaSemana.match(/(\d)ª/g) ?? [];
  // "2ª" ordinal 2 → Monday → JS DoW 1 (ordinal - 1)
  return matches.map((m) => parseInt(m[0], 10) - 1).filter((d) => d >= 1 && d <= 5);
}

function diaSemanaLabel(jsDow: number): string {
  const labels: Record<number, string> = {
    1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira",
    4: "Quinta-feira",  5: "Sexta-feira",
  };
  return labels[jsDow] ?? "N/A";
}

// Returns the next `count` dates (YYYY-MM-DD) that fall on the given JS DoW values
function nextDatesForDows(dows: number[], count = 3, startFromTomorrow = true): string[] {
  const dates: string[] = [];
  const start = new Date();
  if (startFromTomorrow) start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);

  for (let i = 0; dates.length < count && i < 60; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    if (dows.includes(d.getDay())) {
      dates.push(d.toISOString().split("T")[0]);
    }
  }
  return dates;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 — IDENTIFICATION (READ)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buscar_contato — v2 (LGPD-safe, B2B)
 *
 * Dois modos:
 *   Modo 1 (canal_id + canal_tipo): lookup por identificador de canal
 *     Tipos: WHATSAPP (E.164: 5521912345678), INSTAGRAM (@handle),
 *            INSTAGRAM_UID (ID numérico), MESSENGER, TELEGRAM
 *   Modo 2 (telefone + nome): busca exata de telefone + fuzzy de nome
 *     Algoritmo: telefone bate nos últimos 8 dígitos; nome bate se
 *     primeiro E último token do nome buscado existem no nome armazenado.
 *
 * LGPD: NUNCA retorna match parcial para Flora.
 *       Resposta SEMPRE binária: {encontrado: true|false}
 *       Flora não deve dizer se encontrou ou não encontrou contato.
 *
 * Parâmetro vincular_canal_id_se_encontrado=true: vincula o canal_id
 * ao contato encontrado via Modo 2 (promoção de anônimo → identificado).
 */
async function buscarContato(params: Record<string, unknown>): Promise<McpResponse> {
  const {
    canal_id,
    canal_tipo,
    nome,
    telefone,
    vincular_canal_id_se_encontrado,
  } = params as {
    canal_id?: string;
    canal_tipo?: string;
    nome?: string;
    telefone?: string;
    vincular_canal_id_se_encontrado?: boolean;
  };

  const supabase = getClient();
  const notFound = ok({ encontrado: false });
  const personResult = await resolvePessoa(supabase, params, false);
  if (personResult.error) return fail(personResult.error);
  if (personResult.pessoa) {
    const personData = await pessoaWithLeads(supabase, personResult.pessoa);
    return ok(personData, undefined, "Confirme se é para um estabelecimento anterior ou para uma nova empresa");
  }

  // ── Modo 1: busca por canal_id ──────────────────────────────────────────────
  if (canal_id && canal_tipo) {
    const tipo   = canal_tipo.toUpperCase();
    const handle = canal_id.replace(/^@/, ""); // remove @ se presente

    const fieldMap: Record<string, string> = {
      WHATSAPP:      "whatsapp_id",
      INSTAGRAM:     "instagram_handle",
      INSTAGRAM_UID: "instagram_user_id",
      MESSENGER:     "messenger_user_id",
      TELEGRAM:      "telegram_user_id",
    };

    const field = fieldMap[tipo];

    // WIDGET/WebChat: sem canal_id vinculável — retorna não encontrado sem erro
    if (!field) {
      if (tipo === "WIDGET") return notFound;
      return fail(
        `canal_tipo inválido: ${canal_tipo}`,
        "Use: WHATSAPP, INSTAGRAM, INSTAGRAM_UID, MESSENGER, TELEGRAM, WIDGET"
      );
    }

    let { data: contacts } = await supabase
      .from("client_contacts")
      .select(`
        id, name, role, phone, whatsapp_id, instagram_handle, client_id,
        clients!inner(id, name, city, ramo_atuacao, vinculo, status)
      `)
      .eq("organization_id", NITSCLEAN_ORG_ID)
      .eq(field, handle)
      .limit(1);

    // The trusted WhatsApp identifier may be stored only as a phone, not whatsapp_id.
    if ((!contacts || contacts.length === 0) && tipo === "WHATSAPP" &&
        resolveChannelFromChatId(params.chat_id)?.canal === "WHATSAPP") {
      const { data: phoneContacts } = await supabase.from("client_contacts")
        .select(`id, name, role, phone, whatsapp_id, instagram_handle, client_id,
          clients!inner(id, name, city, ramo_atuacao, vinculo, status)`)
        .eq("organization_id", NITSCLEAN_ORG_ID)
        .in("phone", [handle, `+${handle}`])
        .limit(1);
      contacts = phoneContacts;
    }

    if (!contacts || contacts.length === 0) return notFound;

    const contact = contacts[0];
    const client  = (contact as Record<string, unknown>).clients as Record<string, unknown>;

    return ok({
      encontrado: true,
      contato: {
        contato_id:      contact.id,
        nome:            contact.name,
        cargo:           contact.role ?? null,
        cliente_id:      contact.client_id,
        empresa:         client?.name ?? null,
        cidade:          client?.city ?? null,
        ramo:            client?.ramo_atuacao ?? null,
        vinculo:         client?.vinculo ?? null,
        status_cliente:  client?.status ?? null,
      },
    }, undefined, "Use consultar_rota_consultor para propor visita, ou criar_lead para registrar interação");
  }

  // ── Modo 2: busca por telefone + nome ──────────────────────────────────────
  if (telefone && nome) {
    const phoneNorm = String(telefone).replace(/\D/g, "").slice(-8);
    if (phoneNorm.length < 8) return notFound;

    const { data: candidates } = await supabase
      .from("client_contacts")
      .select(`
        id, name, role, phone, whatsapp_id, instagram_handle, client_id,
        clients!inner(id, name, city, ramo_atuacao, vinculo, status)
      `)
      .eq("organization_id", NITSCLEAN_ORG_ID)
      .ilike("phone", `%${phoneNorm}`);

    if (!candidates || candidates.length === 0) return notFound;

    // Nome fuzzy: primeiro + último token devem estar no nome armazenado
    const searchName = String(nome).trim().toLowerCase();
    const tokens     = searchName.split(/\s+/).filter(Boolean);
    const firstToken = tokens[0];
    const lastToken  = tokens[tokens.length - 1];

    const matched = candidates.find((c) => {
      const stored = (c.name as string).toLowerCase();
      if (tokens.length === 1) return stored.includes(firstToken);
      return stored.includes(firstToken) && stored.includes(lastToken);
    });

    if (!matched) return notFound;

    // Opcionalmente vincular canal_id ao contato encontrado
    if (vincular_canal_id_se_encontrado && canal_id && canal_tipo) {
      const tipo = (canal_tipo as string).toUpperCase();
      const fieldMap: Record<string, string> = {
        WHATSAPP:      "whatsapp_id",
        INSTAGRAM:     "instagram_handle",
        INSTAGRAM_UID: "instagram_user_id",
        MESSENGER:     "messenger_user_id",
        TELEGRAM:      "telegram_user_id",
      };
      const field = fieldMap[tipo];
      if (field) {
        await supabase.from("client_contacts")
          .update({ [field]: canal_id.replace(/^@/, ""), updated_at: new Date().toISOString() })
          .eq("id", matched.id);
      }
    }

    const client = (matched as Record<string, unknown>).clients as Record<string, unknown>;

    return ok({
      encontrado: true,
      contato: {
        contato_id:      matched.id,
        nome:            matched.name,
        cargo:           matched.role ?? null,
        cliente_id:      matched.client_id,
        empresa:         client?.name ?? null,
        cidade:          client?.city ?? null,
        ramo:            client?.ramo_atuacao ?? null,
        vinculo:         client?.vinculo ?? null,
        status_cliente:  client?.status ?? null,
      },
    }, undefined, "Use consultar_rota_consultor para propor visita ou criar_lead para registrar interação");
  }

  // Sem dados suficientes para identificar o contato — retorna não encontrado
  // em vez de erro, para Flora prosseguir com criação de lead normalmente.
  // Ocorre tipicamente em WebChat (canal_tipo=WIDGET, canal_id vazio) ou quando
  // Flora não tem acesso ao identificador do canal no contexto da conversa.
  return notFound;
}

/**
 * verificar_cobertura_regiao — verifica se cidade está na área de cobertura
 * Retorna: coberto y/n, dia(s) da semana, horário.
 * Para obter próximas datas disponíveis use consultar_rota_consultor.
 */
async function verificarCoberturaRegiao(params: Record<string, unknown>): Promise<McpResponse> {
  for (const key of ["cidade", "cep", "regiao", "estado"]) {
    if (params[key] != null && (typeof params[key] !== "string" || (params[key] as string).length > 200)) {
      return fail(`Parâmetro ${key} inválido`);
    }
  }
  const { cidade, cep, regiao, estado } = params as { cidade?: string; cep?: string; regiao?: string; estado?: string };
  if (cep && !validCep(cep)) return fail("CEP inválido. Informe 8 dígitos.");
  if (!cidade && !cep && !regiao && !estado) {
    return fail("Forneça cidade, CEP, região ou estado", "Pergunte ao cliente em qual cidade e estado está localizado");
  }
  const normalizeLocation = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const matchesCity = (areaCity: string | null) => cityInArea(cidade, areaCity);
  const { data, error } = await getClient()
    .from("ekkoa_coverage_areas")
    .select("id, name, city, dia_semana, horario_inicio, horario_fim, zip_code_start, zip_code_end")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("is_active", true);
  if (error) return fail(dbFail("consultar cobertura", error));
  const allAreas: CoverageRegion[] = data ?? [];
  const postalMatch = cep ? narrowestCoverage(allAreas, cep) : null;
  const areas = regiao ? allAreas.filter(area => area.name === regiao.trim())
    : cep ? (postalMatch ? [postalMatch] : []) : allAreas.filter(area => matchesCity(area.city));
  if (areas.length === 0) {
    const state = normalizeLocation(estado ?? "") || (cityUf(cidade) ?? "");
    const postal = validCep(cep);
    const knownRjCities = "Rio de Janeiro|Niterói|São Gonçalo|Duque de Caxias|Nova Iguaçu|Belford Roxo|São João de Meriti|Mesquita|Nilópolis|Queimados|Itaboraí|Maricá|Magé|Guapimirim|Petrópolis|Teresópolis|Nova Friburgo|Cachoeiras de Macacu|Rio Bonito|Tanguá|Silva Jardim|Casimiro de Abreu|Rio das Ostras|Macaé|Campos dos Goytacazes|São João da Barra|São Francisco de Itabapoana|Quissamã|Carapebus|Conceição de Macabu|Araruama|Iguaba Grande|São Pedro da Aldeia|Arraial do Cabo|Cabo Frio|Armação dos Búzios|Búzios|Saquarema|Angra dos Reis|Paraty|Mangaratiba|Itaguaí|Seropédica|Volta Redonda|Barra Mansa|Resende|Itatiaia|Porto Real|Quatis|Barra do Piraí|Piraí|Pinheiral|Rio Claro|Valença|Vassouras|Miguel Pereira|Paty do Alferes|Paraíba do Sul|Três Rios|Areal|Comendador Levy Gasparian|Sapucaia|Sumidouro|Carmo|Cantagalo|Cordeiro|Duas Barras|Bom Jardim|Santa Maria Madalena|São Sebastião do Alto|Trajano de Moraes|São Fidélis|Itaocara|Aperibé|Santo Antônio de Pádua|Miracema|Laje do Muriaé|Itaperuna|Bom Jesus do Itabapoana|Natividade|Porciúncula|Varre-Sai|Cambuci|Cardoso Moreira|São José de Ubá|São José do Vale do Rio Preto|Engenheiro Paulo de Frontin|Mendes|Paracambi|Japeri|Rio das Flores|Comendador Levy Gasparian";
    const inferredRj = !!postal && postal >= "20000000" && postal <= "28999999" ||
      knownRjCities.split("|").some(city => sameCity(city, cidade)) ||
      allAreas.some(area => matchesCity(area.city));
    const isRj = state ? ["rj", "rio de janeiro", "estado do rio de janeiro"].includes(state) : inferredRj;
    const knownOutside = !state && !isRj && knownOutsideCity(cidade);
    if (!state && !isRj && !knownOutside) {
      const mensagem = "Você pode me confirmar o estado ou o CEP do estabelecimento?";
      return ok({ coberto: false, vinculo: null, precisa_confirmar: true, cidade: cidade ?? null,
        mensagem_para_lead: mensagem }, mensagem, "Pergunte o estado ou CEP antes de definir o vínculo; não registre fora de cobertura ainda");
    }
    const vinculo = isRj ? "MATRIZ" : "SEM_COBERTURA";
    const mensagem = isRj ? MSG_MATRIZ : MSG_SEM_COBERTURA;
    return ok(
      { coberto: false, vinculo, cidade: cidade ?? null, mensagem_para_lead: mensagem }, mensagem,
      isRj ? HINT_MATRIZ : HINT_SEM_COBERTURA
    );
  }

  const cobertura = coverageByRegion(areas);
  if (!regiao && !cep && new Set(areas.map(a => a.name)).size > 1) {
    return ok(
      { coberto: true, vinculo: "DISTRIBUIDORA", precisa_localizar: true, cobertura },
      `${cidade} está coberta, com dias diferentes por região`,
      MULTI_REGION_HINT
    );
  }

  return ok(
    { coberto: true, vinculo: "DISTRIBUIDORA", cobertura },
    `${cidade ?? cep} está coberta! Visitas: ${cobertura.map((c) => c.dia_visita).join(", ")}`,
    "Cobertura confirmada. Chame consultar_rota_consultor, consulte a agenda e ofereça 3 opções com dia e horário livres."
  );
}

const MSG_SEM_COBERTURA = "No momento não atendemos seu estado, mas podemos registrar seu interesse. Obrigado pelo contato!";
const MSG_MATRIZ = "Sua região é atendida pela Matriz da NitsClean. Vou chamar um especialista para continuar seu atendimento.";
const HINT_MATRIZ = "Use solicitar_atendimento_humano com motivo contendo MATRIZ; não use registrar_fora_cobertura";
const HINT_SEM_COBERTURA = "Use registrar_fora_cobertura para registrar o interesse e encerrar gentilmente";
const MSG_PEDIR_LOCAL = "Me passa a cidade e o bairro (ou o CEP) do estabelecimento?";
// Unambiguous cities outside RJ (capitals and large cities); "Campo Grande"/"Serra" are omitted (also RJ places).
const KNOWN_OUTSIDE_CITIES = "São Paulo|Belo Horizonte|Vitória|Vila Velha|Cariacica|Guarapari|Curitiba|Florianópolis|Porto Alegre|Salvador|Recife|Fortaleza|Brasília|Goiânia|Cuiabá|Manaus|Belém|São Luís|Teresina|Natal|João Pessoa|Maceió|Aracaju|Palmas|Porto Velho|Rio Branco|Macapá|Boa Vista|Campinas|Santos|Guarulhos|Osasco|Santo André|São Bernardo do Campo|Ribeirão Preto|São José dos Campos|Sorocaba|Juiz de Fora|Uberlândia";
const UFS = new Set(["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to"]);
const foldPlace = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const placeParts = (cidade: unknown) => typeof cidade === "string" ? cidade.split(/[,/]|\s-\s|\s–\s/).map(foldPlace).filter(Boolean) : [];
// Single city alias table (folded keys → folded official name). Every coverage, route, booking, holiday
// and lead-city comparison goes through cityKeys/sameCity/cityInArea so "Búzios" = "Armação dos Búzios".
const CITY_ALIASES: Record<string, string> = {
  "buzios": "armacao dos buzios", "armacao de buzios": "armacao dos buzios", "armacao buzios": "armacao dos buzios",
  "cabo": "cabo frio",
  "sao pedro": "sao pedro da aldeia", "s pedro da aldeia": "sao pedro da aldeia",
  "arraial": "arraial do cabo",
  "iguaba": "iguaba grande",
  "ostras": "rio das ostras",
};
/** Canonical folded city names in a free text ("Búzios/RJ" → ["armacao dos buzios"]); UF parts/suffixes are dropped. */
function cityKeys(value: unknown): string[] {
  const keys = placeParts(value).map(part => {
    const words = part.split(" ");
    if (words.length > 1 && UFS.has(words[words.length - 1])) words.pop();
    return words.join(" ");
  }).filter(part => part && !UFS.has(part)).map(part => CITY_ALIASES[part] ?? part);
  return [...new Set(keys)];
}
/** Same city after alias, accent and case folding. */
function sameCity(a: unknown, b: unknown): boolean {
  const other = new Set(cityKeys(b));
  return cityKeys(a).some(key => other.has(key));
}
/** Requested city matches a coverage area city; non-exact also accepts whole-word containment ("Saquarema" ⊂ "Bacaxá (Saquarema)"). */
function cityInArea(requested: unknown, areaCity: unknown, exact = false): boolean {
  const area = cityKeys(areaCity);
  return cityKeys(requested).some(r => area.some(a => r === a ||
    (!exact && (` ${a} `.includes(` ${r} `) || ` ${r} `.includes(` ${a} `)))));
}
/** UF written after the city ("São Paulo/SP", "Cabo Frio - RJ"), or null. */
function cityUf(cidade: unknown): string | null {
  const parts = placeParts(cidade);
  const last = parts[parts.length - 1] ?? "";
  return parts.length > 1 && UFS.has(last) ? last : null;
}
/** True when one part of the city text is a known non-RJ city ("São Paulo", "Pinheiros, São Paulo"). */
function knownOutsideCity(cidade: unknown): boolean {
  const outside = new Set(KNOWN_OUTSIDE_CITIES.split("|").map(foldPlace));
  return placeParts(cidade).some(part => outside.has(part));
}

const MULTI_REGION_HINT = "Antes de oferecer horários, pergunte o nome do estabelecimento e chame localizar_estabelecimento; a região depende do endereço.";

function coverageByRegion(areas: CoverageRegion[]) {
  return areas.map((a) => {
    const dows = parseDiaSemana(a.dia_semana ?? "");
    return {
      regiao:     a.name,
      cidade:     a.city,
      dia_visita: dows.length > 0 ? dows.map(diaSemanaLabel).join(" e ") : (a.dia_semana ?? "A confirmar"),
      horario: `${a.horario_inicio ?? "08:00"} às ${a.horario_fim ?? "18:00"}`,
    };
  });
}

/** Region of the single establishment confirmed by localizar_estabelecimento in this chat (24h). */
async function lastLocatedRegion(supabase: ReturnType<typeof getClient>, chatId: unknown): Promise<string | null> {
  if (typeof chatId !== "string" || !chatId) return null;
  try {
    const { data, error } = await supabase.from("mcp_request_log").select("response")
      .eq("method", "localizar_estabelecimento").eq("success", true)
      .contains("params", { chat_id: chatId })
      .gte("created_at", new Date(Date.now() - 86400000).toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) { dbFail("consultar estabelecimento atual", error); return null; }
    let response = data?.response;
    if (typeof response === "string") response = JSON.parse(response);
    const candidates = response?.result?.data?.candidatos;
    if (!Array.isArray(candidates) || candidates.length !== 1) return null;
    const region = candidates[0]?.regiao;
    return typeof region === "string" && region.trim() ? region.trim() : null;
  } catch { return null; }
}

interface CoverageRegion {
  id?: string; name: string; city: string | null; dia_semana: string | null;
  horario_inicio: string | null; horario_fim: string | null;
  zip_code_start: string | null; zip_code_end: string | null;
  consultant_user_id?: string | null;
}

function validCep(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{5}-?\d{3}$/.test(value.trim())) return null;
  return value.replace(/\D/g, "");
}

function narrowestCoverage(areas: CoverageRegion[], cep: unknown): CoverageRegion | null {
  const postal = validCep(cep);
  if (!postal) return null;
  return areas.map(area => ({ area, start: validCep(area.zip_code_start),
    end: validCep(area.zip_code_end ?? area.zip_code_start) }))
    .filter(item => item.start && item.end && postal >= item.start && postal <= item.end)
    .sort((a, b) => (Number(a.end) - Number(a.start)) - (Number(b.end) - Number(b.start)) ||
      a.area.name.localeCompare(b.area.name))[0]?.area ?? null;
}

async function selectCoverage(supabase: ReturnType<typeof getClient>, params: Record<string, unknown>, exactCity = false): Promise<CoverageRegion[]> {
  const region = typeof params.regiao === "string" ? params.regiao.trim() : null;
  const city = typeof params.cidade === "string" ? params.cidade.trim() : null;
  let query = supabase.from("ekkoa_coverage_areas")
    .select("id, name, city, dia_semana, horario_inicio, horario_fim, zip_code_start, zip_code_end, consultant_user_id")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true);
  if (region) query = query.eq("name", region);
  const { data, error } = await query;
  if (error) throw new Error(dbFail("consultar regiões", error));
  if (!region && params.cep) {
    const match = narrowestCoverage(data ?? [], params.cep);
    return match ? [match] : [];
  }
  if (!region && city) return (data ?? []).filter((area: CoverageRegion) => cityInArea(city, area.city, exactCity));
  return data ?? [];
}

// Use the same selected region and weekday/window as the booking, never another area's consultant.
function bookingArea(areas: CoverageRegion[], date: string, time: string): CoverageRegion | undefined {
  const dow = new Date(date + "T12:00:00").getDay();
  const minutes = timeMinutes(time);
  return areas.find(area => parseDiaSemana(area.dia_semana ?? "").includes(dow) &&
    (!area.horario_inicio || !area.horario_fim ||
      (minutes >= timeMinutes(area.horario_inicio) && minutes <= timeMinutes(area.horario_fim))));
}

type BookingLead = {
  id: string; client_id?: string | null; pessoa_id?: string | null;
  endereco?: string | null; bairro?: string | null; zip_code?: string | null;
  city?: string | null; regiao?: string | null; maps_url?: string | null;
  contact_phone?: string | null; contact_email?: string | null; category?: string | null;
  empresa_nome?: string | null; company?: string | null; title?: string | null;
  contact_name?: string | null;
  pessoa?: { nome?: string | null; email?: string | null; telefone?: string | null; whatsapp?: string | null } | null;
};

const BOOKING_LEAD_SELECT = "id, stage, description, place_id, client_id, pessoa_id, endereco, bairro, zip_code, city, regiao, maps_url, contact_phone, contact_email, category, empresa_nome, company, title, contact_name, pessoa:pessoas(nome, email, telefone, whatsapp)";

async function loadBookingLead(supabase: ReturnType<typeof getClient>, leadId?: string, interactionId?: string): Promise<BookingLead | null> {
  if (!leadId && !interactionId) return null;
  let query = supabase.from("leads").select(BOOKING_LEAD_SELECT).eq("organization_id", NITSCLEAN_ORG_ID);
  query = leadId ? query.eq("id", leadId) : query.eq("interaction_id", interactionId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(dbFail("consultar dados do lead", error));
  return data as BookingLead | null;
}

/** Current chat context only; a selected candidate is confirmed by the current company/place. */
async function currentEstablishment(supabase: ReturnType<typeof getClient>, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const current = { ...params };
  const company = productSearchText(params.empresa ?? params.empresa_nome);
  if (!params.chat_id || !company) return current;
  const { data, error } = await supabase.from("mcp_request_log").select("response")
    .eq("method", "localizar_estabelecimento").eq("success", true)
    .contains("params", { chat_id: params.chat_id })
    .gte("created_at", new Date(Date.now() - 86400000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(dbFail("consultar estabelecimento atual", error));
  let response = data?.response;
  if (typeof response === "string") { try { response = JSON.parse(response); } catch { return current; } }
  const candidates = response?.result?.data?.candidatos;
  if (!Array.isArray(candidates)) return current;
  const matches = candidates.filter((c: Record<string, unknown>) =>
    normalizedEstablishment(c.nome) === normalizedEstablishment(company) &&
    (!params.cidade || sameCity(c.cidade, params.cidade)) &&
    (!params.place_id || c.place_id === params.place_id));
  if (matches.length !== 1) return current;
  for (const key of ["endereco", "bairro", "cidade", "cep", "maps_url", "place_id", "regiao", "latitude", "longitude"]) {
    if (normalizeParamValue(current[key]) == null) current[key] = matches[0][key] ?? null;
  }
  return current;
}

function currentContactName(supplied: unknown, stored: unknown): string {
  const name = productSearchText(supplied);
  const full = productSearchText(stored);
  // A real supplied name (even a single first name) is kept; only missing values,
  // generic placeholders or short nicknames/initials (≤ 3 chars, e.g. "PH")
  // fall back to the stored name.
  const generic = name ? name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : null;
  const realName = generic && !["contato", "cliente"].includes(generic) ? name : null;
  if (full && full !== "Contato" && (!realName || realName.length <= 3)) return full;
  return realName ?? full ?? "Contato";
}

/** Read-only name disclosure, scoped to the trusted WhatsApp phone and tenant. */
async function knownContactName(supabase: ReturnType<typeof getClient>, chatId: unknown): Promise<{ nome: string } | null> {
  const channel = resolveChannelFromChatId(chatId);
  if (channel?.canal !== "WHATSAPP") return null;
  const phone = digits(channel.identificador);
  if (!phone) return null;
  try {
    for (const field of ["whatsapp", "telefone"]) {
      const { data, error } = await supabase.from("pessoas").select("nome")
        .eq("organization_id", NITSCLEAN_ORG_ID).eq(field, phone).limit(1).maybeSingle();
      if (error) { dbFail("consultar nome do contato", error); return null; }
      const nome = productSearchText(data?.nome);
      if (nome) return { nome };
    }
  } catch { console.error("[mcp] known contact lookup failed"); }
  return null;
}

async function withKnownContact(response: McpResponse, chatId: unknown): Promise<McpResponse> {
  const supabase = getClient();
  const contato_conhecido = await knownContactName(supabase, chatId);
  const contexto_anterior = await previousContext(supabase, chatId);
  const equipe = await teamInfo(chatId);
  return { ...response, data: { ...response.data, contato_conhecido, contexto_anterior, equipe } };
}

// ─── Lead timeline: short summaries only (never transcripts), background writes ───

type TimelineType = "resumo" | "criar_lead" | "agendamento" | "transferencia" | "fora_perfil" | "encerramento";
const TIMELINE_DEDUP_MS = 10 * 60 * 1000;

/** Removes contact data and bounds length; placeholders count as absent. */
function timelineText(value: unknown, max: number): string | null {
  const text = productSearchText(value);
  if (!text) return null;
  const masked = text.replace(/[\r\n\t]+/g, " ")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]")
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, "[documento]")
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "[documento]")
    .replace(/\+?\(?\d[\d\s().-]{8,}\d/g, "[telefone]")
    .replace(/\s{2,}/g, " ").trim();
  if (!masked) return null;
  return masked.length > max ? `${masked.slice(0, max - 1).trimEnd()}…` : masked;
}

function timelineSummary(generated: string, params: Record<string, unknown>): string {
  const own = timelineText(params.resumo_conversa, 500);
  const base = timelineText(generated, 500) ?? "Interação registrada";
  return own ? timelineText(`${base}. ${own}`, 500)! : base;
}

async function writeTimeline(supabase: ReturnType<typeof getClient>, entry: {
  leadId: string; pessoaId?: unknown; tipo: TimelineType; resumo: string; params: Record<string, unknown>; referenciaId?: unknown;
}): Promise<void> {
  const resumo = timelineSummary(entry.resumo, entry.params);
  const since = new Date(Date.now() - TIMELINE_DEDUP_MS).toISOString();
  const { data: dup } = await supabase.from("lead_timeline").select("id").eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("lead_id", entry.leadId).eq("tipo", entry.tipo).eq("resumo", resumo).gte("created_at", since).limit(1);
  if (Array.isArray(dup) && dup.length > 0) return;
  const chatId = productSearchText(entry.params.chat_id);
  const { error } = await supabase.from("lead_timeline").insert({
    organization_id: NITSCLEAN_ORG_ID, lead_id: entry.leadId,
    pessoa_id: typeof entry.pessoaId === "string" && entry.pessoaId ? entry.pessoaId : null,
    canal: resolveChannelFromChatId(chatId)?.canal ?? (productSearchText(entry.params.canal)?.toUpperCase() ?? null),
    chat_id: chatId, tipo: entry.tipo, resumo, proximo_passo: timelineText(entry.params.proximo_passo, 200),
    origem: "flora", referencia_id: typeof entry.referenciaId === "string" ? entry.referenciaId : null,
  });
  if (error) dbFail("gravar linha do tempo", error);
}

/** Timeline failures never change the tool response. */
function queueTimeline(supabase: ReturnType<typeof getClient>, entry: Parameters<typeof writeTimeline>[1]): void {
  try {
    if (!entry.leadId) return;
    const task = Promise.resolve().then(() => writeTimeline(supabase, entry))
      .catch(() => { console.error("[lead_timeline] write failed"); });
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<void>) => void } }).EdgeRuntime;
    runtime?.waitUntil(task);
  } catch { console.error("[lead_timeline] could not schedule write"); }
}

/** Person identified only by the trusted chat channel identifier (never name/e-mail). */
async function chatPessoaId(supabase: ReturnType<typeof getClient>, chatId: unknown): Promise<string | null> {
  const channel = resolveChannelFromChatId(chatId);
  if (!channel) return null;
  const fields = channel.canal === "WHATSAPP" ? ["whatsapp", "telefone"]
    : channel.canal === "INSTAGRAM" ? ["instagram_user_id"] : channel.canal === "MESSENGER" ? ["messenger_id"] : [];
  const value = channel.canal === "WHATSAPP" ? digits(channel.identificador) : channel.identificador;
  if (!value) return null;
  for (const field of fields) {
    const { data, error } = await supabase.from("pessoas").select("id")
      .eq("organization_id", NITSCLEAN_ORG_ID).eq(field, value).limit(1).maybeSingle();
    if (error) { dbFail("consultar pessoa do contexto", error); return null; }
    if (data?.id) return String(data.id);
  }
  return null;
}

const CHANNEL_LABEL: Record<string, string> = { WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", MESSENGER: "Messenger", WIDGET: "Site", TELEGRAM: "Telegram" };

function formatPreviousContext(items: Array<Record<string, unknown>>, companies: Map<string, string>, max = 400): string | null {
  const parts: string[] = [];
  for (const item of items) {
    const date = new Date(String(item.created_at));
    const day = Number.isFinite(date.getTime())
      ? date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "";
    const channel = CHANNEL_LABEL[String(item.canal ?? "")] ?? "";
    const company = companies.get(String(item.lead_id)) ?? "";
    const head = [day, channel].filter(Boolean).join(" ");
    const body = [timelineText(item.resumo, 300), timelineText(item.proximo_passo, 120)].filter(Boolean).join(", próximo passo: ");
    parts.push(`${head}${company ? ` — ${company}` : ""}: ${body.replace(/[.\s]+$/, "")}.`);
  }
  let text = "";
  for (const part of parts) {
    const next = text ? `${text} ${part}` : part;
    if (next.length > max) {
      if (!text) text = `${part.slice(0, max - 1).trimEnd()}…`;
      break;
    }
    text = next;
  }
  return text || null;
}

async function previousContext(supabase: ReturnType<typeof getClient>, chatId: unknown): Promise<string | null> {
  try {
    const pessoaId = await chatPessoaId(supabase, chatId);
    if (!pessoaId) return null;
    const { data, error } = await supabase.from("lead_timeline").select("lead_id, canal, tipo, resumo, proximo_passo, created_at")
      .eq("organization_id", NITSCLEAN_ORG_ID).eq("pessoa_id", pessoaId)
      .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString())
      .order("created_at", { ascending: false }).limit(3);
    if (error) { dbFail("consultar contexto anterior", error); return null; }
    const items = Array.isArray(data) ? data : [];
    if (items.length === 0) return null;
    const ids = [...new Set(items.map((i: any) => String(i.lead_id)))];
    const { data: leads } = await supabase.from("leads").select("id, empresa_nome, company")
      .eq("organization_id", NITSCLEAN_ORG_ID).in("id", ids);
    const companies = new Map<string, string>();
    for (const lead of Array.isArray(leads) ? leads : []) {
      const name = timelineText(lead.empresa_nome ?? lead.company, 80);
      if (name) companies.set(String(lead.id), name);
    }
    return formatPreviousContext(items, companies);
  } catch { console.error("[mcp] previous context lookup failed"); return null; }
}

/** Product fallback runs only after the candidate lead has passed company/person validation. */
async function currentConversationProduct(supabase: ReturnType<typeof getClient>, params: Record<string, unknown>, lead: any): Promise<string | null> {
  const supplied = productSearchText(params.produto_interesse);
  if (supplied) return supplied;
  const company = normalizedEstablishment(params.empresa ?? params.empresa_nome);
  const sameCompany = company && company === normalizedEstablishment(lead?.empresa_nome ?? lead?.company);
  const stored = sameCompany ? productSearchText(lead?.category) : null;
  if (stored) return stored;
  const chatId = productSearchText(params.chat_id);
  if (!chatId) return null;
  try {
    const now = new Date();
    const { data, error } = await supabase.from("mcp_request_log").select("response")
      .eq("method", "consultar_produto").eq("success", true).contains("params", { chat_id: chatId })
      .contains("response", { result: { data: { encontrado: true } } })
      .gte("created_at", new Date(now.getTime() - 86400000).toISOString()).lte("created_at", now.toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) { dbFail("consultar produto recente", error); return null; }
    const result = data?.response?.result?.data;
    if (result?.encontrado !== true) return null;
    const products = result.produtos;
    return Array.isArray(products) && products.length === 1
      ? productSearchText(products[0]?.nome) : productSearchText(result.produto_citado);
  } catch { console.error("[mcp] recent product lookup failed"); return null; }
}

/** Candidate IDs never override the current establishment identity. */
async function resolveCurrentLead(supabase: ReturnType<typeof getClient>, params: Record<string, unknown>, candidate: any) {
  const company = productSearchText(params.empresa ?? params.empresa_nome);
  const personResult = await resolvePessoa(supabase, { ...params, nome: params.nome_contato,
    telefone: params.telefone ?? (resolveChannelFromChatId(params.chat_id)?.canal === "WHATSAPP"
      ? resolveChannelFromChatId(params.chat_id)?.identificador : undefined) }, false);
  if (personResult.error) throw new Error(personResult.error);
  let pessoa = personResult.pessoa;
  // An explicit tenant-validated lead may identify the person, never the new company.
  if (!pessoa && candidate?.pessoa_id) {
    const { data, error } = await supabase.from("pessoas").select("id, nome, email, telefone, whatsapp, instagram_handle, chat_ids")
      .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", candidate.pessoa_id).maybeSingle();
    if (error) throw new Error(dbFail("consultar pessoa", error));
    pessoa = data;
  }
  const name = currentContactName(params.nome_contato, pessoa?.nome ?? candidate?.pessoa?.nome);
  const emailText = productSearchText(params.email);
  const currentEmail = emailText && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText) ? emailText : null;
  const matches = (lead: any) => lead && !["fechado_ganho", "fechado_perdido"].includes(lead.stage) &&
    (!pessoa || lead.pessoa_id === pessoa.id) &&
    (!company || normalizedEstablishment(lead.empresa_nome ?? lead.company) === normalizedEstablishment(company)) &&
    (!params.cidade || !lead.city || sameCity(lead.city, params.cidade)) &&
    (!params.place_id || !lead.place_id || params.place_id === lead.place_id);
  let lead = matches(candidate) ? candidate : null;
  if (!lead && pessoa) {
    const { data, error } = await supabase.from("leads").select(`${BOOKING_LEAD_SELECT}, canal_origem, instagram_handle`)
      .eq("organization_id", NITSCLEAN_ORG_ID).eq("pessoa_id", pessoa.id)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(dbFail("consultar leads da pessoa", error));
    lead = (Array.isArray(data) ? data : []).find(matches) ?? null;
  }
  let created = false;
  const product = await currentConversationProduct(supabase, params, lead);
  params = { ...params, produto_interesse: product };
  if (!lead) {
    if (!pessoa) {
      const resolved = await resolvePessoa(supabase, { ...params, nome: name,
        telefone: params.telefone ?? (resolveChannelFromChatId(params.chat_id)?.canal === "WHATSAPP" ? resolveChannelFromChatId(params.chat_id)?.identificador : undefined) }, true);
      if (resolved.error) throw new Error(resolved.error);
      pessoa = resolved.pessoa;
    }
    const channel = resolveChannelFromChatId(params.chat_id)?.canal ?? "WHATSAPP";
    const { data, error } = await supabase.from("leads").insert({
      organization_id: NITSCLEAN_ORG_ID, pessoa_id: pessoa?.id ?? null,
      contact_name: name, contact_phone: params.telefone ?? pessoa?.whatsapp ?? pessoa?.telefone ?? null,
      contact_email: currentEmail, title: company ? `${name} — ${company}` : name,
      company, empresa_nome: company, city: params.cidade ?? null, category: productSearchText(params.produto_interesse),
      endereco: params.endereco ?? null, bairro: params.bairro ?? null, zip_code: validCep(params.cep),
      maps_url: params.maps_url ?? null, place_id: params.place_id ?? null, regiao: params.regiao ?? null,
      latitude: params.latitude ?? null, longitude: params.longitude ?? null,
      stage: "novo", source: channel.toLowerCase(), canal_origem: channel,
      assigned_to: await floraDefaultOwner(supabase), interaction_id: params.interaction_id ?? String(Date.now()),
      gptmaker_chat_id: params.chat_id ?? null, instagram_handle: pessoa?.instagram_handle ?? null,
      position: 0, created_by_flora: true,
    }).select(`${BOOKING_LEAD_SELECT}, canal_origem, instagram_handle`).single();
    if (error || !data) throw new Error(dbFail("registrar lead atual", error));
    lead = data; created = true;
  }
  if (!created) {
    const updates: Record<string, unknown> = { contact_name: name, updated_at: new Date().toISOString() };
    if (company) { updates.company = company; updates.empresa_nome = company; }
    for (const [param, column] of [["cidade", "city"], ["produto_interesse", "category"], ["endereco", "endereco"],
      ["bairro", "bairro"], ["maps_url", "maps_url"], ["place_id", "place_id"], ["regiao", "regiao"]]) {
      if (productSearchText(params[param])) updates[column] = params[param];
    }
    if (validCep(params.cep)) updates.zip_code = validCep(params.cep);
    if (pessoa && !lead.pessoa_id) updates.pessoa_id = pessoa.id;
    const { error } = await supabase.from("leads").update(updates).eq("organization_id", NITSCLEAN_ORG_ID).eq("id", lead.id);
    if (error) throw new Error(dbFail("atualizar lead atual", error));
  }
  // Address remains current-only; product includes the validated same-company/chat fallback.
  // When the conversation gives no company/city, the validated resolved lead (same person,
  // no conflicting company informed) supplies them for the snapshot and notifications.
  const leadCompany = company ?? productSearchText(lead.empresa_nome ?? lead.company) ?? null;
  const leadCity = productSearchText(params.cidade) ?? productSearchText(lead.city) ?? null;
  const snapshot = { id: lead.id, client_id: lead.client_id, pessoa_id: pessoa?.id ?? lead.pessoa_id,
    empresa_nome: leadCompany, company: leadCompany, city: leadCity,
    endereco: params.endereco ?? null, bairro: params.bairro ?? null, zip_code: validCep(params.cep),
    maps_url: params.maps_url ?? null, category: productSearchText(params.produto_interesse),
    contact_name: name, contact_phone: params.telefone ?? pessoa?.whatsapp ?? pessoa?.telefone ?? null,
    contact_email: currentEmail, pessoa: { nome: name } };
  return { lead, pessoa, created, snapshot, params: { ...params, email: currentEmail, nome_contato: name,
    empresa: leadCompany, cidade: leadCity,
    produto_interesse: snapshot.category, __current_establishment: true } };
}

function bookingLocation(lead: BookingLead | null, fallbackCity?: string): string | null {
  const address = lead?.endereco?.trim();
  if (address) return address;
  return [lead?.bairro, lead?.city || fallbackCity].filter(Boolean).join(", ") || fallbackCity || null;
}

function bookingNotes(lead: BookingLead | null, params: Record<string, unknown>, product: string | null): string {
  const value = (candidate: unknown) => typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
  const company = value(lead?.empresa_nome) || value(lead?.company) || value(params.empresa) || value(lead?.title);
  const contact = value(lead?.pessoa?.nome) || value(lead?.contact_name) || value(params.nome_contato);
  const phone = value(lead?.contact_phone) || value(lead?.pessoa?.whatsapp) || value(lead?.pessoa?.telefone) || value(params.telefone);
  const email = value(params.email) || value(lead?.contact_email) || value(lead?.pessoa?.email);
  const mapsUrl = value(lead?.maps_url) || value(params.maps_url);
  return [company ? `Empresa: ${company}` : null, contact ? `Contato: ${contact}` : null,
    phone ? `Telefone: ${phone}` : null, email ? `E-mail: ${email}` : null,
    product ? `Produto: ${product}` : null, mapsUrl ? `Mapa: ${mapsUrl}` : null]
    .filter(Boolean).join(" | ");
}

function bookingProduct(lead: BookingLead | null, supplied: unknown): string | null {
  const explicit = normalizeParamValue(supplied);
  if (typeof explicit === "string") return explicit.trim();
  const category = normalizeParamValue(lead?.category);
  return typeof category === "string" ? category.trim() : null;
}

async function fillBookingEmail(supabase: ReturnType<typeof getClient>, lead: BookingLead | null, email: string | null): Promise<void> {
  if (!lead || !email) return;
  const { error: leadError } = await supabase.from("leads").update({ contact_email: email })
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", lead.id).or("contact_email.is.null,contact_email.eq.");
  if (leadError) throw new Error(dbFail("atualizar e-mail do lead", leadError));
  if (lead.pessoa_id) {
    const { error: pessoaError } = await supabase.from("pessoas").update({ email })
      .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", lead.pessoa_id).or("email.is.null,email.eq.");
    if (pessoaError) throw new Error(dbFail("atualizar e-mail da pessoa", pessoaError));
  }
}

type AddressComponent = { types?: string[]; longText?: string; long_name?: string };
function addressPart(parts: AddressComponent[] | undefined, ...types: string[]): string | null {
  for (const type of types) {
    const part = parts?.find(component => component.types?.includes(type));
    if (part) return part.longText ?? part.long_name ?? null;
  }
  return null;
}

// Existing user-owned server key; never expose it in the response or logs.
const locationCache = new Map<string, { expires: number; data: unknown }>();
async function locationRequest(url: string, init: RequestInit, cacheKey: string): Promise<any> {
  const cached = locationCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    // Read only the provider's structured error, never the request URL or headers.
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.details?.find((detail: any) => detail.reason)?.reason;
    const fix = reason === "API_KEY_HTTP_REFERRER_BLOCKED"
      ? "Server key: use None or IP application restrictions, not HTTP referrers."
      : reason === "API_KEY_SERVICE_BLOCKED" || reason === "SERVICE_DISABLED"
      ? "Enable the requested API and allow it in the server key API restrictions."
      : "Check Google Cloud API enablement, billing and server key restrictions.";
    console.error("[localizar_estabelecimento] Google", response.status, reason ?? body?.error?.status ?? "REQUEST_FAILED", fix);
    throw new Error("Serviço de localização indisponível");
  }
  const data = await response.json();
  if (locationCache.size >= 100) locationCache.clear();
  locationCache.set(cacheKey, { expires: Date.now() + 300000, data });
  return data;
}

function isPlaceInRj(place: { addressComponents?: { types?: string[]; longText?: string; shortText?: string }[] }): boolean {
  const comps = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  const state = comps.find(c => c.types?.includes("administrative_area_level_1"));
  if (state) {
    const values = [state.shortText, state.longText].filter(Boolean).map(v => String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim());
    return values.some(v => v === "rj" || v === "rio de janeiro" || v === "state of rio de janeiro" || v === "estado do rio de janeiro");
  }
  const postal = comps.find(c => c.types?.includes("postal_code"));
  const cep = (postal?.longText ?? postal?.shortText ?? "").replace(/\D/g, "");
  if (cep.length === 8) { const n = Number(cep); return n >= 20000000 && n <= 28999999; }
  return true;
}

const GENERIC_BUSINESS_TYPES: Record<string, string> = {
  hotel: "hotel", pousada: "pousada", restaurante: "restaurante", clinica: "clínica", academia: "academia", escritorio: "escritório",
  loja: "loja", empresa: "empresa", condominio: "condomínio", salao: "salão", bar: "bar", padaria: "padaria", mercado: "mercado",
  supermercado: "supermercado", lanchonete: "lanchonete", cafeteria: "cafeteria", consultorio: "consultório", hostel: "hostel",
  hospital: "hospital", farmacia: "farmácia", escola: "escola", oficina: "oficina", estabelecimento: "estabelecimento",
  negocio: "negócio", comercio: "comércio", quiosque: "quiosque", pizzaria: "pizzaria", sorveteria: "sorveteria", lavanderia: "lavanderia",
  barbearia: "barbearia", petshop: "pet shop", igreja: "igreja", resort: "resort", spa: "spa", buffet: "buffet", laboratorio: "laboratório",
};
/** Business type when the name is only a generic type ("hotel em Búzios", "minha clínica"); null for real names. */
// Generic only when nothing remains after removing business types, articles/prepositions/possessives
// and the city phrase. Any leftover word (short, foreign, digits) is a real name: "La Gare", "Bar do Zé", "Pousada 7".
function genericBusinessType(nome: string, cidade?: string | null): string | null {
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  let words = fold(nome);
  for (const c of [cidade ?? "", "rj", "rio de janeiro"].map(fold).filter(c => c.length)) {
    for (let i = 0; i + c.length <= words.length; i++) {
      if (c.every((w, j) => words[i + j] === w)) { words = [...words.slice(0, i), ...words.slice(i + c.length)]; i--; }
    }
  }
  const STOP = new Set(["em", "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "o", "a", "os", "as", "um", "uma", "meu", "minha", "meus", "minhas", "nosso", "nossa", "e", "aqui"]);
  const typeOf = (w: string) => GENERIC_BUSINESS_TYPES[w] ?? GENERIC_BUSINESS_TYPES[w.replace(/(oes|aes)$/, "ao").replace(/s$/, "")] ?? null;
  let tipo: string | null = null;
  for (const w of words) {
    if (STOP.has(w)) continue;
    const t = typeOf(w);
    if (!t) return null;
    tipo ??= t;
  }
  return tipo;
}

async function localizarEstabelecimento(params: Record<string, unknown>): Promise<McpResponse> {
  const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max ? value.trim() : null;
  const nome = text(params.nome, 200), cidade = text(params.cidade, 120), bairro = text(params.bairro, 120);
  if (!nome) return fail("nome é obrigatório (até 200 caracteres)");
  if (params.cidade != null && !cidade) return fail("cidade inválida (até 120 caracteres)");
  if (params.bairro != null && !bairro) return fail("bairro inválido");
  if (params.cep != null && !validCep(params.cep)) return fail("CEP deve conter oito dígitos");
  if (params.estado != null && !text(params.estado, 60)) return fail("estado inválido");
  const tipoGenerico = params.cep ? null : genericBusinessType(nome, cidade);
  // Coverage before any search: without city/CEP only ask for them, never promise a visit.
  if (!cidade && !params.cep) {
    return ok({ encontrado: false, candidatos: [], cobertura: null, precisa_localizacao: true,
      ...(tipoGenerico ? { precisa_nome: true } : {}), mensagem_para_lead: MSG_PEDIR_LOCAL },
      MSG_PEDIR_LOCAL, "Peça cidade e bairro (ou CEP) e chame localizar_estabelecimento de novo; não ofereça visita antes de confirmar a cobertura");
  }
  const coverage = await verificarCoberturaRegiao({ cidade: cidade ?? undefined, cep: params.cep ?? undefined, estado: text(params.estado, 60) ?? undefined });
  if (!coverage.success) return coverage;
  const vinculo = (coverage.data as { vinculo?: string | null } | undefined)?.vinculo ?? null;
  if (vinculo === "SEM_COBERTURA") {
    let registro: { registrado: boolean; lead_id?: unknown } = { registrado: false };
    // Team chats are never turned into leads.
    if (!(await refuseTeamInClientFlow("registrar_fora_cobertura", params))) {
      const empresa = params.empresa ?? params.empresa_nome ?? (tipoGenerico ? undefined : nome);
      const result = await registrarForaCobertura({ ...params, empresa, cidade: cidade ?? `CEP ${validCep(params.cep)}` });
      const data = result.data as { lead_id?: unknown } | undefined;
      registro = { registrado: result.success, lead_id: data?.lead_id };
    }
    return ok({ cobertura: "SEM_COBERTURA", vinculo, encontrado: false, candidatos: [], ...registro, mensagem_para_lead: MSG_SEM_COBERTURA },
      MSG_SEM_COBERTURA, "Fora de cobertura já registrado: envie mensagem_para_lead e encerre gentilmente; não ofereça visita nem horários");
  }
  if (vinculo === "MATRIZ") {
    return ok({ cobertura: "MATRIZ", vinculo, encontrado: false, candidatos: [], mensagem_para_lead: MSG_MATRIZ }, MSG_MATRIZ, HINT_MATRIZ);
  }
  if (vinculo !== "DISTRIBUIDORA") {
    const data = coverage.data as { mensagem_para_lead?: string } | undefined;
    return ok({ cobertura: null, encontrado: false, candidatos: [], precisa_confirmar: true, mensagem_para_lead: data?.mensagem_para_lead ?? MSG_PEDIR_LOCAL },
      coverage.message, "Confirme o estado ou o CEP e chame localizar_estabelecimento de novo; não ofereça visita ainda");
  }
  // Coverage confirmed as DISTRIBUIDORA from here on: visit promises are allowed.
  // Generic type only (no proper name): never search Google, ask the lead for the name.
  if (tipoGenerico) return ok({ cobertura: "DISTRIBUIDORA", encontrado: false, precisa_nome: true, candidatos: [],
    mensagem_para_lead: `Qual é o nome ${["pousada", "clínica", "academia", "loja", "empresa", "padaria", "lanchonete", "cafeteria", "farmácia", "escola", "oficina", "pizzaria", "sorveteria", "lavanderia", "barbearia", "igreja"].includes(tipoGenerico) ? "da" : "do"} ${tipoGenerico}? Assim já vejo o melhor dia para a visita.` });
  const fallback = () => ok({ cobertura: "DISTRIBUIDORA", encontrado: false, candidatos: [], precisa_confirmar: true,
    mensagem_para_lead: "Me passa o bairro ou o CEP do estabelecimento? Assim já vejo o melhor dia para o consultor passar aí." });
  // Tool-local name comparison; do not change the shared parameter normalizer.
  const normalizedName = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(word => word && !["restaurante", "loja", "o", "a"].includes(word)).join(" ");
  const shortAddress = (place: any): string | null => {
    const street = addressPart(place.addressComponents, "route");
    const number = addressPart(place.addressComponents, "street_number");
    if (street) return [street, number].filter(Boolean).join(", ");
    // Formatted Google addresses put locality/state/CEP after the street section.
    const sections = typeof place.formattedAddress === "string" ? place.formattedAddress.split(",").map((part: string) => part.trim()) : [];
    const first = sections[0]?.split(/\s+-\s+/)[0];
    if (!first) return null;
    const nextNumber = sections[1]?.match(/^\d+[\w/]*\b/)?.[0];
    return [first, nextNumber].filter(Boolean).join(", ");
  };
  try {
    const areas = await selectCoverage(getClient(), {});
    const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
    let places: any[] = [];
    if (params.cep) {
      const cep = validCep(params.cep);
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return fallback();
      const address = await response.json();
      if (address.erro) return fallback();
      places = [{ displayName: { text: nome }, formattedAddress: [address.logradouro, address.bairro, address.localidade, address.uf, address.cep].filter(Boolean).join(", "),
        addressComponents: [
          { types: ["route"], longText: address.logradouro },
          { types: ["sublocality_level_1"], longText: address.bairro },
          { types: ["administrative_area_level_2"], longText: address.localidade },
          { types: ["postal_code"], longText: address.cep ?? cep },
        ] }];
    } else {
      if (!key) return fallback();
      const textQuery = [nome, bairro, cidade, "RJ"].filter(Boolean).join(" ");
      const result = await locationRequest("https://places.googleapis.com/v1/places:searchText", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.nationalPhoneNumber,places.googleMapsUri,places.primaryType" },
        body: JSON.stringify({ textQuery, languageCode: "pt-BR", regionCode: "BR", maxResultCount: 3 }),
      }, `places:city:${textQuery}`);
      places = Array.isArray(result.places) ? result.places.slice(0, 3) : [];
    }
    places = places.filter(isPlaceInRj);
    const requestedName = normalizedName(nome);
    const matches = !params.cep && requestedName ? places.filter(place => {
      const candidateName = normalizedName(place.displayName?.text ?? "");
      return candidateName && (` ${candidateName} `.includes(` ${requestedName} `) || ` ${requestedName} `.includes(` ${candidateName} `));
    }) : [];
    const correspondenciaExata = matches.length === 1;
    if (correspondenciaExata) places = matches;
    const candidatos = [];
    const addresses: (string | null)[] = [];
    // Sequential, capped at three reverse lookups; no retries on Google errors.
    for (const place of places) {
      let cep = addressPart(place.addressComponents, "postal_code");
      const latitude = place.location?.latitude ?? null, longitude = place.location?.longitude ?? null;
      if (!validCep(cep) && key && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        try {
          const reverse = await locationRequest(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=pt-BR&key=${encodeURIComponent(key)}`, {}, `reverse:${latitude},${longitude}`);
          if (reverse.status === "OK") {
            for (const result of reverse.results ?? []) {
              const postal = addressPart(result.address_components, "postal_code");
              if (validCep(postal)) { cep = postal; break; }
            }
          } else if (reverse.status !== "ZERO_RESULTS") {
            console.error("[localizar_estabelecimento] Geocoding", reverse.status);
          }
        } catch { /* Missing reverse CEP must not discard a Places candidate. */ }
      }
      const region = narrowestCoverage(areas, cep);
      addresses.push(shortAddress(place));
      candidatos.push({ nome: place.displayName?.text ?? nome, endereco: place.formattedAddress ?? null,
        bairro: addressPart(place.addressComponents, "sublocality_level_1", "sublocality"),
        cidade: addressPart(place.addressComponents, "administrative_area_level_2", "locality") ?? cidade,
        cep: validCep(cep) ? cep : null, latitude, longitude, regiao: region?.name ?? null,
        dias_visita: region?.dia_semana ?? null,
        horario: region?.horario_inicio && region.horario_fim ? `${region.horario_inicio.slice(0, 5)} às ${region.horario_fim.slice(0, 5)}` : null,
        maps_url: place.googleMapsUri ?? null, telefone: place.nationalPhoneNumber ?? null, place_id: place.id ?? null });
    }
    if (!candidatos.length) return fallback();
    const first = candidatos[0];
    const mensagem = candidatos.length === 1
      ? `Só pra confirmar: é o ${first.nome}${addresses[0] ? ` da ${addresses[0]}` : ""}${first.bairro ? `, no bairro ${first.bairro}` : ""}?`
      : `Encontrei mais de um com esse nome por aqui 😊 Qual é o seu?\n${candidatos.map((candidate, i) => `${i + 1}. ${candidate.nome}${addresses[i] || candidate.bairro ? ` — ${[addresses[i], candidate.bairro].filter(Boolean).join(", ")}` : ""}`).join("\n")}`;
    return ok({ cobertura: "DISTRIBUIDORA", encontrado: true, candidatos, precisa_confirmar: true, correspondencia_exata: correspondenciaExata, mensagem_para_lead: mensagem });
  } catch { return fallback(); }
}

/**
 * consultar_rota_consultor — retorna próximas datas em que o consultor
 * estará na cidade do cliente. Flora usa para propor visita proativamente.
 *
 * Fluxo Flora:
 *   1. Lead informa cidade
 *   2. Flora chama consultar_rota_consultor(cidade)
 *   3. Flora diz: "Nossa equipe visita Cabo Frio nas segundas e sextas.
 *      As próximas datas são: 21/07 (segunda) e 25/07 (sexta).
 *      Qual você prefere?"
 *   4. Lead confirma → Flora chama agendar_visita_tecnica
 */
async function consultarRotaConsultor(params: Record<string, unknown>): Promise<McpResponse> {
  const { cidade, cep, regiao, proximas_datas_count } = params as {
    regiao?: string;
    cidade?: string;
    cep?: string;
    proximas_datas_count?: number;
  };

  if (!cidade && !cep && !regiao) {
    return fail("Forneça cidade, região ou CEP", "Pergunte ao lead em qual cidade a empresa está localizada");
  }

  const supabase = getClient();

  const located = !regiao && !validCep(cep) ? await lastLocatedRegion(supabase, params.chat_id) : null;
  const selectorParams = located ? { ...params, regiao: located } : params;
  const areas = await selectCoverage(supabase, selectorParams);

  if (!areas || areas.length === 0) {
    // Same check as verificar_cobertura_regiao: out-of-area cities never receive dates or times.
    const coverage = !regiao ? await verificarCoberturaRegiao({ cidade, cep, estado: params.estado }) : null;
    const vinculo = coverage?.success ? (coverage.data as { vinculo?: string | null } | undefined)?.vinculo : null;
    if (vinculo === "SEM_COBERTURA" || vinculo === "MATRIZ") {
      const mensagem = vinculo === "MATRIZ" ? MSG_MATRIZ : MSG_SEM_COBERTURA;
      return ok({ coberto: false, cobertura: vinculo, vinculo, cidade: cidade ?? cep, proximas_datas: [], opcoes_horario: [], mensagem_para_lead: mensagem },
        mensagem, vinculo === "MATRIZ" ? HINT_MATRIZ : `${HINT_SEM_COBERTURA}; nunca ofereça horários`);
    }
    return ok(
      { coberto: false, cidade: regiao ?? cidade ?? cep, proximas_datas: [] },
      `${regiao ?? cidade ?? cep} não está coberta`,
      "Use registrar_fora_cobertura para registrar o lead mesmo assim"
    );
  }

  if (!selectorParams.regiao && !validCep(cep) && new Set(areas.map(a => a.name)).size > 1) {
    return ok(
      { coberto: true, precisa_localizar: true, cidade, regioes: coverageByRegion(areas) },
      `${cidade} tem mais de uma região de visita; a região depende do endereço`,
      MULTI_REGION_HINT
    );
  }

   const count = Math.min(proximas_datas_count ?? 3, 6);

  // Consolidar todos os DoWs de todas as regiões encontradas
  const allDows = new Set<number>();
  for (const a of areas) {
    parseDiaSemana(a.dia_semana ?? "").forEach((d) => allDows.add(d));
  }

  const dowsList = Array.from(allDows).sort();
  const candidates = nextDatesForDows(dowsList, 60);
  const holidays = candidates.length > 0
    ? await loadHolidays(supabase, candidates[0], candidates[candidates.length - 1]) : [];
  const availableArea = (date: string) => {
    const dow = new Date(date + "T12:00:00-03:00").getDay();
    return areas.find(area => parseDiaSemana(area.dia_semana ?? "").includes(dow) &&
      !holidayForDate(holidays, date, area.city ?? cidade));
  };
  const proximas = candidates.filter(date => availableArea(date)).slice(0, count);

  // Formatar para exibição em pt-BR
  const proximasFormatadas = proximas.map((dateStr) => {
    const d   = new Date(dateStr + "T12:00:00-03:00");
    const dow = d.getDay();
    const area = availableArea(dateStr);
    return {
      data:       dateStr,
      data_ptbr:  d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }),
      dia_semana: diaSemanaLabel(dow),
      horario:    area ? `${area.horario_inicio ?? "08:00"} às ${area.horario_fim ?? "18:00"}` : "A confirmar",
      regiao:     area?.name ?? cidade ?? "",
    };
  });

  const diasSemana = dowsList.map(diaSemanaLabel).join(" e ");
  const opcoes = await routeTimeOptions(supabase, candidates.filter(date => availableArea(date)), availableArea);
  const mensagem = opcoes.length > 0
    ? `Tenho estas opções para a visita:\n${opcoes.map((o, i) => `${i + 1}. ${o.texto}`).join("\n")}\nQual opção fica melhor para você?`
    : null;

  return ok(
    {
      coberto:         true,
      cidade:          regiao ?? cidade ?? cep,
      dias_de_visita:  diasSemana,
      proximas_datas:  proximasFormatadas,
      opcoes_horario:  opcoes,
      ...(mensagem ? { mensagem_para_lead: mensagem } : {}),
    },
    `Consultor visita ${regiao ?? cidade ?? cep} às ${diasSemana}. Próximas: ${proximasFormatadas.map((p) => p.data_ptbr).join(", ")}`,
    opcoes.length > 0
      ? "Ofereça ao lead exatamente as opções de opcoes_horario (use mensagem_para_lead). Não calcule outros horários nem peça ao lead para sugerir horário."
      : "Nenhum horário livre encontrado nos próximos dias; use solicitar_atendimento_humano para a equipe combinar a visita."
  );
}

const VISIT_DURATION_MIN = 60;
const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + (m || 0); };
const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const horaTexto = (n: number) => `${Math.floor(n / 60)}h${n % 60 ? String(n % 60).padStart(2, "0") : ""}`;
const DIA_LONGO = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

/** Up to 3 ready-made options on distinct days, inside the region band, free for the consultant. */
async function routeTimeOptions(
  supabase: ReturnType<typeof getClient>, dates: string[],
  areaFor: (date: string) => { horario_inicio?: string | null; horario_fim?: string | null; consultant_user_id?: string | null } | undefined,
): Promise<{ data: string; hora: string; texto: string }[]> {
  if (dates.length === 0) return [];
  let existing: { scheduled_date?: string; start_time?: string; end_time?: string; assigned_to?: string | null }[] = [];
  try {
    const { data } = await supabase.from("schedules").select("scheduled_date, start_time, end_time, assigned_to, status")
      .eq("organization_id", NITSCLEAN_ORG_ID).in("scheduled_date", dates).neq("status", "cancelado");
    existing = Array.isArray(data) ? data : [];
  } catch { console.error("[rota] schedules lookup failed"); }
  const gBusy = await googleBusy(supabase, dates[0], dates[dates.length - 1]);
  const options: { data: string; hora: string; texto: string }[] = [];
  for (const date of dates) {
    if (options.length >= 3) break;
    const area = areaFor(date);
    if (!area) continue;
    const startBand = toMin(area.horario_inicio ?? "08:00");
    const lastStart = toMin(area.horario_fim ?? "18:00") - VISIT_DURATION_MIN;
    const busy = existing.filter(s => s.scheduled_date === date && s.start_time &&
      (!area.consultant_user_id || !s.assigned_to || s.assigned_to === area.consultant_user_id));
    const free: number[] = [];
    for (let t = startBand; t <= lastStart; t += 30) {
      const clash = busy.some(s => {
        const bs = toMin(s.start_time!); const be = s.end_time ? toMin(s.end_time) : bs + VISIT_DURATION_MIN;
        return t < be && bs < t + VISIT_DURATION_MIN;
      });
      if (!clash && !googleClash(gBusy, date, t, VISIT_DURATION_MIN)) free.push(t);
    }
    if (free.length === 0) continue;
    // Vary: 1st earliest, 2nd latest, 3rd middle (morning/afternoon when the band allows).
    const i = options.length;
    const pick = i === 0 ? free[0] : i === 1 ? free[free.length - 1] : free[Math.floor(free.length / 2)];
    const d = new Date(date + "T12:00:00-03:00");
    options.push({ data: date, hora: fromMin(pick),
      texto: `${DIA_LONGO[d.getDay()]}, ${date.slice(8, 10)}/${date.slice(5, 7)}, às ${horaTexto(pick)}` });
  }
  return options;
}

async function obterPromocaoVigente(_params: Record<string, unknown>): Promise<McpResponse> {
  const supabase = getClient();

  const { data: products } = await supabase
    .from("products")
    .select("name, category, price, description")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);

  const promocoes = [
    {
      nome: "Teste Gratuito Ekkoa",
      descricao: "Instale o sistema Ekkoa por 7 dias sem custo. Mais de 70% de conversão após o teste.",
      validade: "Oferta permanente",
    },
    {
      nome: "Comodato de Dispensers",
      descricao: "Dispensers de papel, sabonete e toalha sem custo de equipamento — paga só o consumo.",
      validade: "Oferta permanente",
    },
  ];

  return ok(
    { promocoes, produtos_destaque: products ?? [] },
    "Promoções vigentes NitsClean",
    "Apresente as promoções e pergunte qual mais interessa ao cliente"
  );
}

const PRODUCT_GENERIC_WORDS = new Set(["produto", "produtos", "para", "de", "da", "do", "das", "dos", "linha", "e", "com", "o", "a", "os", "as", "um", "uma", "coisa", "coisas", "item", "itens", "algo", "tipo"]);
// Generic need/segment phrasing ("produtos para hotel", "limpeza de cozinha", "coisas para banheiro") never counts as a named product.
const PRODUCT_GENERIC_TERM = /^(produtos?|coisas?|itens?|item|algo|opcoes|algum|alguma|material|materiais)\b|^limpeza (de|da|do|para)\b|\bpara (o |a |os |as )?(hotel|hoteis|hotelaria|cozinhas?|banheiros?|restaurantes?|lavanderias?|hospita\w*|clinicas?|escritorios?|pisos?|limpeza)\b/;
const PRODUCT_SEARCH_FIELDS = ["name", "brand", "category", "fornecedor", "linha_produto", "description"] as const;

function foldProductText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function productSearchText(value: unknown): string | null {
  const v = normalizeParamValue(value);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || /^n[aã]o informad[oa]$/i.test(t)) return null;
  return t;
}

const PRODUCT_IMAGE_BUCKET = "product-images";

async function resolveProductImageUrls(supabase: ReturnType<typeof getClient>, values: unknown[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const paths: string[] = [];
  for (const v of values) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (/^https:\/\//i.test(v)) out.set(v, v); else paths.push(v);
  }
  if (paths.length) {
    try {
      const { data } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).createSignedUrls(paths, 3600);
      for (const d of (data ?? []) as Array<{ path?: string; signedUrl?: string }>) if (d?.path && d.signedUrl) out.set(d.path, d.signedUrl);
    } catch (e) { console.warn("[mcp] product image sign failed", (e as { code?: string })?.code ?? "unknown"); }
  }
  return out;
}

async function sendProductImage(supabase: ReturnType<typeof getClient>, chatId: string, product: Record<string, unknown>, imageUrl: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const { data: prev } = await supabase.from("product_image_sends").select("id")
      .eq("chat_id", chatId).eq("product_id", product.id).eq("status", "enviado").gte("sent_at", since).limit(1);
    if (Array.isArray(prev) && prev.length) return false;
  } catch { /* lookup failure: proceed */ }
  let status = "erro"; let errorCode: string | null = null;
  try {
    if (!GPTMAKER_API_TOKEN) throw new Error("CONFIG_MISSING");
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`https://api.gptmaker.ai/v2/chat/${encodeURIComponent(chatId)}/send-message`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GPTMAKER_API_TOKEN}` },
        body: JSON.stringify({ image: imageUrl, message: String(product.name ?? "") }),
      });
      if (res.ok) status = "enviado"; else errorCode = `HTTP_${res.status}`;
    } finally { clearTimeout(timer); }
  } catch (e) { errorCode = (e as Error)?.message === "CONFIG_MISSING" ? "CONFIG_MISSING" : ((e as Error)?.name === "AbortError" ? "TIMEOUT" : "NETWORK"); }
  if (errorCode) console.warn("[mcp] product image send failed", errorCode);
  try {
    await supabase.from("product_image_sends").insert({ organization_id: NITSCLEAN_ORG_ID, chat_id: chatId, product_id: product.id, status, error_code: errorCode });
  } catch { /* never break the response */ }
  return status === "enviado";
}

function productSegments(p: Record<string, unknown>): string[] {
  const s = (p.specifications as Record<string, unknown> | null)?.segmentos;
  const list = Array.isArray(s) ? s : typeof s === "string" ? s.split(/[,;]/) : [];
  return list.map((x) => foldProductText(x)).filter(Boolean);
}

function pickVaried(list: Array<Record<string, unknown>>, n: number): Array<Record<string, unknown>> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const p of list) { const k = foldProductText(p.category); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(p); }
  const out: Array<Record<string, unknown>> = []; const gs = [...groups.values()];
  for (let i = 0; out.length < n && gs.some((g) => g.length > i); i++) for (const g of gs) { if (g[i] && out.length < n) out.push(g[i]); }
  return out;
}

async function consultarProduto(params: Record<string, unknown>): Promise<McpResponse> {
  const termo = productSearchText(params.termo) ?? productSearchText(params.nome);
  const categoria = productSearchText(params.categoria);
  const chatId = productSearchText(params.chat_id);
  const supabase = getClient();
  const { data: rows } = await supabase
    .from("products")
    .select("id, name, brand, category, fornecedor, linha_produto, unit, description, disponibilidade, image_url, pode_enviar_foto_cliente, specifications")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("is_active", true)
    .neq("disponibilidade", "descontinuado")
    .limit(3000);
  const products = ((rows ?? []) as Array<Record<string, unknown>>).filter((p) => p.disponibilidade !== "descontinuado" && p.is_active !== false);
  const categoryFold = foldProductText(categoria ?? "");
  const matchesCategory = (p: Record<string, unknown>) => Boolean(categoryFold) && foldProductText(p.category).includes(categoryFold);
  // Category is a ranking hint only: never remove a term/brand/segment match.
  const rankByCategory = (list: Array<Record<string, unknown>>) => [...list].sort((a, b) => Number(matchesCategory(b)) - Number(matchesCategory(a)));
  const termFold = foldProductText(termo ?? "");
  const words = termFold.split(" ").filter((w) => w.length >= 3);
  const haystack = (p: Record<string, unknown>) => PRODUCT_SEARCH_FIELDS.map((f) => foldProductText(p[f])).join(" ");
  const clientPhoto = (p: Record<string, unknown>) => typeof p.image_url === "string" && p.image_url.trim() !== "" && p.pode_enviar_foto_cliente === true;
  const fmt = (p: Record<string, unknown>, urls: Map<string, string>) => {
    const desc = typeof p.description === "string" ? p.description.trim() : "";
    return {
      id: p.id, nome: p.name ?? null, marca: p.brand ?? null, categoria: p.category ?? null,
      fornecedor: p.fornecedor ?? null, unidade: p.unit ?? null,
      descricao: desc ? (desc.length > 200 ? desc.slice(0, 197) + "..." : desc) : null,
      disponibilidade: p.disponibilidade ?? "estoque",
      // Internal-only photos (pode_enviar_foto_cliente=false) are never exposed to the client conversation.
      image_url: clientPhoto(p) ? (urls.get(p.image_url as string) ?? null) : null,
    };
  };
  const produtoCitado = termo ?? categoria ?? null;
  const respondFound = async (corr: string, list: Array<Record<string, unknown>>, allowImage: boolean) => {
    const urls = await resolveProductImageUrls(supabase, list.filter(clientPhoto).map((p) => p.image_url));
    const produtos = list.map((p) => fmt(p, urls));
    let imagemEnviada = false;
    if (allowImage && chatId && list.length === 1 && produtos[0].image_url) {
      imagemEnviada = await sendProductImage(supabase, chatId, list[0], produtos[0].image_url as string);
    }
    return { success: true, data: { encontrado: true, correspondencia: corr, produto_citado: produtoCitado, produtos, imagem_enviada: imagemEnviada } } as McpResponse;
  };

  // 1. Brand / supplier name only
  if (termFold) {
    const byBrand = products.filter((p) => foldProductText(p.brand) === termFold || foldProductText(p.fornecedor) === termFold);
    if (byBrand.length) return respondFound("marca", pickVaried(rankByCategory(byBrand), 5), false);
  }
  // 2. Name match (only source of "total"): every significant term word in name (+brand/linha), at least one in the name.
  const sigWords = termFold.split(" ").filter((w) => w.length >= 2 && !PRODUCT_GENERIC_WORDS.has(w));
  const hasWord = (text: string, w: string) => ` ${text} `.includes(` ${w}`);
  const genericTerm = PRODUCT_GENERIC_TERM.test(termFold);
  if (sigWords.length && !genericTerm) {
    const byName = products.filter((p) => {
      const name = foldProductText(p.name);
      const full = `${name} ${foldProductText(p.brand)} ${foldProductText(p.linha_produto)}`;
      return sigWords.every((w) => hasWord(full, w)) && sigWords.some((w) => hasWord(name, w));
    });
    if (byName.length) return respondFound("total", rankByCategory(byName).slice(0, 5), true);
  }
  // 3. Description/category/segment matches are never "total" and never send images.
  let correspondencia: "parcial" | "nenhuma" = "parcial";
  let found = products;
  if (words.length) {
    const wide = sigWords.filter((w) => w.length >= 3);
    const descMatch = wide.length ? products.filter((p) => { const h = haystack(p); return wide.every((w) => h.includes(w)); }) : [];
    if (descMatch.length) return respondFound("segmento", pickVaried(rankByCategory(descMatch), 5), false);
    found = [];
    if (!found.length) {
      // 3. Segment
      const segTerm = sigWords.join(" ");
      if (segTerm.length >= 4) {
        const bySeg = products.filter((p) => productSegments(p).some((s) => s.includes(segTerm) || segTerm.includes(s)));
        if (bySeg.length) return respondFound("segmento", pickVaried(rankByCategory(bySeg), 5), false);
      }
      found = products.filter((p) => { const h = haystack(p); return words.some((w) => h.includes(w)); });
      correspondencia = "parcial";
    }
  } else {
    found = [];
  }
  if (!found.length) correspondencia = "nenhuma";
  const alternatives = found.length ? found : products.filter(matchesCategory);
  const similares = rankByCategory(alternatives).slice(0, 3).map((p) => fmt(p, new Map()));
  let mensagem = `A NitsClean Distribuidora não trabalha com o ${produtoCitado ?? "produto informado"}.`;
  const cats: string[] = [];
  const seen = new Set<string>();
  for (const s of similares) {
    const c = typeof s.categoria === "string" ? s.categoria.trim() : "";
    if (c && !seen.has(foldProductText(c))) { seen.add(foldProductText(c)); cats.push(c); }
  }
  if (similares.length) {
    const lista = cats.length ? (cats.length === 1 ? cats[0] : `${cats.slice(0, -1).join(", ")} e ${cats[cats.length - 1]}`) : "produtos";
    mensagem += ` Temos opções de ${lista} que podem atender a mesma necessidade.`;
  }
  return { success: true, data: { encontrado: false, correspondencia, produto_citado: produtoCitado, produtos: [], similares, mensagem_para_lead: mensagem, imagem_enviada: false } };
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — LEAD CAPTURE (WRITE)
// ─────────────────────────────────────────────────────────────────────────────

async function criarLead(params: Record<string, unknown>): Promise<McpResponse> {
  const {
    nome,
    telefone,
    email,
    empresa,
    empresa_nome,
    cargo_contato,
    canal,
    canal_origem,
    origem_especifica,
    interaction_id,
    instagram_handle,
    produto_interesse,
    cidade,
    mensagem_inicial,
    post_id,
    post_titulo,
    vinculo,
    client_contact_id,
  } = params as {
    nome: string;
    telefone?: string;
    email?: string;
    empresa?: string;
    empresa_nome?: string;
    cargo_contato?: string;
    canal?: string;
    canal_origem?: string;
    origem_especifica?: string;
    interaction_id?: string;
    instagram_handle?: string;
    produto_interesse?: string;
    cidade?: string;
    mensagem_inicial?: string;
    post_id?: string;
    post_titulo?: string;
    vinculo?: string;
    client_contact_id?: string;
  };

  if (!nome) return fail("Nome do contato é obrigatório");

  const locationFields: Record<string, unknown> = {};
  for (const field of ["endereco", "bairro", "maps_url", "place_id", "regiao"]) {
    const value = params[field];
    if (value == null) continue;
    if (typeof value !== "string" || value.trim().length > 1000) return fail(`${field} inválido`);
    if (field === "maps_url") {
      try { if (new URL(value).protocol !== "https:") return fail("maps_url deve usar HTTPS"); }
      catch { return fail("maps_url inválido"); }
    }
    locationFields[field] = value.trim();
  }
  if (params.cep != null) {
    const postal = validCep(params.cep);
    if (!postal) return fail("CEP deve conter oito dígitos");
    locationFields.zip_code = postal;
  }
  for (const field of ["latitude", "longitude"]) {
    const value = params[field];
    if (value == null) continue;
    const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(number) || Math.abs(number) > (field === "latitude" ? 90 : 180)) return fail(`${field} inválida`);
    locationFields[field] = number;
  }

  // Aceitar tanto canal quanto canal_origem, com fallback para WHATSAPP
  const canalFinal = canal || canal_origem || "WHATSAPP";
  const interactionFinal = interaction_id ?? String(Date.now());

  const supabase = getClient();

  // Idempotência
  const { data: existing } = await supabase
    .from("leads")
    .select("id, contact_name, stage")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("interaction_id", interactionFinal)
    .single();

  if (existing) {
    return ok(
      { lead: existing, criado: false },
      `Lead já existe: ${existing.contact_name}`,
      "Lead já registrado — use atualizar_lead ou agendar_visita_tecnica"
    );
  }

  const empresaFinal = empresa_nome ?? empresa ?? null;
  const chatId = typeof params.chat_id === "string" && params.chat_id.trim()
    ? params.chat_id.trim() : null;
  const personResult = await resolvePessoa(supabase, params, true);
  if (personResult.error || !personResult.pessoa) {
    return fail(personResult.error ?? "Erro ao resolver pessoa: pessoa não identificada");
  }

  const { data: openLeads, error: openLeadError } = await supabase.from("leads")
    .select("id, contact_name, stage, place_id, empresa_nome, company, city")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("pessoa_id", personResult.pessoa.id)
    .order("created_at", { ascending: false }).limit(20);
  if (openLeadError) return fail(dbFail("consultar leads da pessoa", openLeadError));
  const requestedPlaceId = typeof params.place_id === "string" ? params.place_id.trim() : "";
  const companyKey = normalizedEstablishment(empresaFinal);
  const cityKey = normalizedEstablishment(cidade);
  const matchingLead = (openLeads ?? []).find((lead: Record<string, unknown>) => {
    if (["fechado_ganho", "fechado_perdido"].includes(String(lead.stage))) return false;
    if (requestedPlaceId) return lead.place_id === requestedPlaceId;
    if (!companyKey || !cityKey || lead.place_id) return false;
    return normalizedEstablishment(lead.empresa_nome ?? lead.company) === companyKey
      && sameCity(lead.city, cidade);
  });
  if (matchingLead && productSearchText(params.resumo_conversa)) queueTimeline(supabase, { leadId: String(matchingLead.id),
    pessoaId: personResult.pessoa.id, tipo: "resumo", resumo: `Conversa — ${empresaFinal ?? nome}`, params });
  if (matchingLead) return ok(
    { lead: matchingLead, criado: false, pessoa: { id: personResult.pessoa.id, nome: personResult.pessoa.nome } },
    `Lead já existe para ${empresaFinal}`,
    "Lead aberto do mesmo estabelecimento — use atualizar_lead ou agendar_visita_tecnica"
  );

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      organization_id:   NITSCLEAN_ORG_ID,
      contact_name:      nome,
      contact_phone:     telefone && telefone.trim() !== "" ? telefone : null,
      contact_email:     email    && email.trim()    !== "" ? email    : null,
      title:             empresaFinal ? `${nome} — ${empresaFinal}` : nome,
      company:           empresaFinal,
      empresa_nome:      empresaFinal,
      city:              cidade ?? null,
      cargo_contato:     cargo_contato ?? null,
      stage:             "novo",
      source:            canalFinal.toLowerCase(),
      canal_origem:      canalFinal,
      origem_especifica: origem_especifica && origem_especifica.trim() !== "" ? origem_especifica : null,
      interaction_id:    interactionFinal,
      gptmaker_chat_id:  chatId,
      ...locationFields,
      instagram_handle:  instagram_handle && instagram_handle.trim() !== "" ? instagram_handle : null,
      description:       mensagem_inicial ?? produto_interesse ?? null,
      category:          produto_interesse ?? null,
      post_id:           post_id    && post_id.trim()    !== "" ? post_id    : null,
      post_titulo:       post_titulo && post_titulo.trim() !== "" ? post_titulo : null,
      vinculo:           vinculo     ?? null,
      pessoa_id:         personResult.pessoa.id,
      client_contact_id: client_contact_id ?? null,
      position:          0,
      created_by_flora:  true,
      assigned_to:       await floraDefaultOwner(supabase),
    })
    .select("id, contact_name, stage")
    .single();

  if (error) {
    return fail(dbFail("criar lead", error), "Tente novamente ou registre manualmente no Fera");
  }

  await logInteraction(supabase, "criar_lead", params, ok(lead), lead?.id, canalFinal, interactionFinal);
  queueTimeline(supabase, { leadId: String(lead?.id ?? ""), pessoaId: personResult.pessoa.id, tipo: "criar_lead",
    resumo: `Novo lead — ${empresaFinal ?? nome}${productSearchText(produto_interesse) ? `: ${produto_interesse}` : ""}`,
    params: { ...params, canal: canalFinal } });

  return ok(
    { lead, criado: true, pessoa: { id: personResult.pessoa.id, nome: personResult.pessoa.nome } },
    `Lead criado: ${nome}`,
    "Use consultar_rota_consultor para verificar cobertura e propor visita técnica"
  );
}

async function atualizarLead(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, resumo_conversa: _resumo, proximo_passo: _proximo, ...updates } = params as {
    lead_id?: string;
    interaction_id?: string;
    [key: string]: unknown;
  };

  const supabase = getClient();

  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase
      .from("leads")
      .select("id")
      .eq("interaction_id", interaction_id)
      .single();
    leadId = data?.id;
  }

  if (!leadId) return fail("Lead não encontrado — forneça lead_id ou interaction_id");

  const allowedFields: Record<string, string> = {
    nome:              "contact_name",
    telefone:          "contact_phone",
    email:             "contact_email",
    empresa:           "company",
    empresa_nome:      "empresa_nome",
    cargo_contato:     "cargo_contato",
    cidade:            "zip_code",
    produto_interesse: "category",
    notas:             "description",
    valor_estimado:    "value",
    post_id:           "post_id",
    post_titulo:       "post_titulo",
    vinculo:           "vinculo",
  };

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(updates)) {
    const dbField = allowedFields[key] ?? key;
    updatePayload[dbField] = value;
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", leadId)
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .select("id, contact_name, stage, pessoa_id")
    .single();

  if (error) return fail(dbFail("atualizar lead", error));
  const changed = Object.keys(updates).filter((key) => key in allowedFields && key !== "telefone" && key !== "email");
  if (changed.length > 0 || productSearchText(params.resumo_conversa)) queueTimeline(supabase, { leadId: String(lead!.id),
    pessoaId: lead!.pessoa_id, tipo: "resumo",
    resumo: changed.length > 0 ? `Lead atualizado: ${changed.map((key) => key.replace(/_/g, " ")).join(", ")}` : "Conversa", params });

  return ok({ lead }, `Lead atualizado: ${lead!.contact_name}`, "Continue o atendimento ou agende uma visita técnica");
}

async function registrarInteracao(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, tipo, notas, canal } = params as {
    lead_id?: string;
    interaction_id?: string;
    tipo: string;
    notas: string;
    canal?: string;
  };

  const supabase = getClient();

  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase
      .from("leads")
      .select("id")
      .eq("interaction_id", interaction_id)
      .single();
    leadId = data?.id;
  }

  if (!leadId) return fail("Lead não encontrado para registrar interação");

  await supabase.from("flora_interactions").insert({
    organization_id: NITSCLEAN_ORG_ID,
    lead_id:         leadId,
    interaction_id:  interaction_id ?? null,
    canal:           canal  ?? null,
    tool_name:       `interacao_${tipo}`,
    payload:         { tipo, notas },
    response:        { registrado: true },
  });
  const tipoText = productSearchText(tipo) ?? "interação";
  const { data: interactionLead } = await supabase.from("leads").select("pessoa_id")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", leadId).maybeSingle();
  queueTimeline(supabase, { leadId, pessoaId: interactionLead?.pessoa_id,
    tipo: /encerr|finaliz/i.test(tipoText) ? "encerramento" : "resumo",
    resumo: [tipoText.charAt(0).toUpperCase() + tipoText.slice(1), productSearchText(notas)].filter(Boolean).join(": "), params });

  return ok(
    { registrado: true, lead_id: leadId },
    "Interação registrada",
    "Continue o fluxo de atendimento"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3 — SCHEDULING (R+W)
// ─────────────────────────────────────────────────────────────────────────────

async function listarHorariosDisponiveis(params: Record<string, unknown>): Promise<McpResponse> {
  const { cidade, data_preferida } = params as { cidade?: string; data_preferida?: string };

  const supabase = getClient();

  let targetDows: number[] = [];
  if (cidade) {
    const { data: allAreas } = await supabase
      .from("ekkoa_coverage_areas")
      .select("city, dia_semana, horario_inicio, horario_fim")
      .eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("is_active", true);
    const areas = (allAreas ?? []).filter((a: { city: string | null }) => cityInArea(cidade, a.city));

    if (areas && areas.length > 0) {
      for (const a of areas) {
        parseDiaSemana(a.dia_semana ?? "").forEach((d) => targetDows.push(d));
      }
      targetDows = [...new Set(targetDows)].sort();
    }
  }

  let nextDate: Date;
  if (data_preferida) {
    nextDate = new Date(data_preferida + "T12:00:00");
  } else if (targetDows.length > 0) {
    const dates = nextDatesForDows(targetDows, 1);
    nextDate = dates.length > 0 ? new Date(dates[0] + "T12:00:00") : new Date();
  } else {
    nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
  }

  const dateStr = nextDate.toISOString().split("T")[0];

  const { data: existing } = await supabase
    .from("schedules")
    .select("start_time, end_time, title")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("scheduled_date", dateStr)
    .in("status", ["agendado", "confirmado"]);

  const allSlots      = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
  const occupiedTimes = (existing ?? []).map((s) => (s.start_time as string)?.substring(0, 5));
  const available     = allSlots.filter((t) => !occupiedTimes.includes(t));

  const diasPtbr: Record<number, string> = {
    0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta",
    4: "Quinta",  5: "Sexta",  6: "Sábado",
  };
  const dowName = diasPtbr[nextDate.getDay()] ?? "";

  return ok(
    { data: dateStr, dia_semana: dowName, horarios_disponiveis: available, total_disponivel: available.length },
    `${available.length} horários disponíveis para ${dowName} ${dateStr}`,
    available.length > 0
      ? "Apresente os horários e use agendar_visita_tecnica quando o cliente confirmar"
      : "Nenhum horário disponível nesta data — consulte a próxima data via consultar_rota_consultor"
  );
}

async function bookedStageId(supabase: ReturnType<typeof getClient>): Promise<string | null> {
  try {
    const { data } = await supabase.from("lead_stages").select("id").eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("chave", "visita_agendada").eq("ativo", true).maybeSingle();
    return typeof data?.id === "string" ? data.id : null;
  } catch { console.error("[agendamento] stage lookup failed"); return null; }
}

async function agendarVisita(params: Record<string, unknown>): Promise<McpResponse> {
  const {
    lead_id, interaction_id, nome_contato, empresa, telefone,
    data_visita, horario, cidade, produto_interesse, email,
  } = params as {
    lead_id?: string; interaction_id?: string; nome_contato: string;
    empresa?: string; telefone?: string; data_visita: string; horario: string;
    cidade?: string; produto_interesse?: string; email?: string;
  };

  if (!data_visita || !horario) return fail("data_visita e horario são obrigatórios");
  if (!nome_contato) return fail("nome_contato é obrigatório");

  const supabase = getClient();
  const holidayRejection = await rejectHolidayVisit(supabase, data_visita, cidade);
  if (holidayRejection) return holidayRejection;
  let leadId = lead_id;
  let bookingLead = await loadBookingLead(supabase, leadId, interaction_id);
  if (!leadId && interaction_id) {
    leadId = bookingLead?.id;
  }

  const product = bookingProduct(bookingLead, produto_interesse);
  const validEmail = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? email.trim() : null;
  const title = `Visita NitsClean — ${empresa || nome_contato}${product ? ` [${product}]` : ""}`;
  const area = bookingArea(await selectCoverage(supabase, params, true), data_visita, horario);
  const startTime = `${horario}:00`;
  const endHour   = parseInt(horario.split(":")[0], 10) + 1;
  const endTime   = `${String(endHour).padStart(2, "0")}:00:00`;

  const { data: schedule, error } = await supabase
    .from("schedules")
    .insert({
      organization_id: NITSCLEAN_ORG_ID, title,
      source: "flora", assigned_to: area?.consultant_user_id ?? await floraDefaultOwner(supabase),
      scheduled_date:  data_visita, start_time: startTime, end_time: endTime,
      schedule_type: "visita_comercial", status: "agendado", location: bookingLocation(bookingLead, cidade),
      zip_code: bookingLead?.zip_code ?? validCep(params.cep), notes: bookingNotes(bookingLead, params, product),
      client_id: bookingLead?.client_id ?? null, lead_id: leadId ?? null,
    })
    .select("id, title, scheduled_date, start_time, status")
    .single();

  if (error) return fail(dbFail("criar agendamento", error));

  // A visit the client asked to reschedule is cancelled by the database trigger in the same transaction as this insert.

  if (leadId) {
    // Automatic pipeline move: booked visit → "Visita agendada" (when the org has that stage configured).
    const stageId = await bookedStageId(supabase);
    await supabase.from("leads")
      .update({ ...(stageId ? { stage_id: stageId } : {}), updated_at: new Date().toISOString() })
      .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", leadId);
  }
  await fillBookingEmail(supabase, bookingLead, validEmail);

  await logInteraction(supabase, "agendar_visita", params, ok(schedule), leadId, undefined, interaction_id);

  const dataFmt = new Date(data_visita + "T12:00:00")
    .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return ok(
    { agendamento: schedule, lead_id: leadId },
    `Visita agendada para ${dataFmt} às ${horario}h`,
    `Confirme com o cliente: "${title} em ${dataFmt} às ${horario}h. Nosso consultor entrará em contato."`
  );
}

/**
 * agendar_visita_tecnica — versão B2B, promovida ativamente pela Flora
 *
 * Diferente de agendar_visita (genérico), esta função:
 * - Valida que a data cai num dia coberto para a cidade
 * - Cria o agendamento com schedule_type = "visita_tecnica"
 * - Retorna mensagem pronta para Flora enviar ao lead
 * - Move lead para estágio "agendado"
 *
 * IMPORTANTE: Visita Técnica = consultor vai até o cliente.
 * Esta é a principal forma de venda da NitsClean — Flora DEVE estimular!
 */
async function agendarVisitaTecnica(params: Record<string, unknown>): Promise<McpResponse> {
  const {
    lead_id, interaction_id, contato_id,
    nome_contato, empresa, telefone, cargo, email,
    data_visita, horario, cidade, produto_interesse, notas,
  } = params as {
    lead_id?: string; interaction_id?: string; contato_id?: string;
    nome_contato: string; empresa?: string; telefone?: string; cargo?: string; email?: string;
    data_visita: string; horario: string; cidade: string;
    produto_interesse?: string; notas?: string;
  };

  if (!data_visita || !horario) return fail("data_visita e horario são obrigatórios");
  if (!cidade) return fail("cidade é obrigatória para validar a rota do consultor");

  const supabase = getClient();
  params = await currentEstablishment(supabase, params);
  let validatedLead: BookingLead | null = null;
  if (lead_id) {
    try { validatedLead = await loadBookingLead(supabase, lead_id); }
    catch (error) { return fail(error instanceof Error ? error.message : "Erro ao validar lead"); }
    if (!validatedLead) return fail("lead_id não encontrado nesta organização");
  }
  // Explicit selectors cannot fall back to a broader city or an unrestricted booking.
  const areas = await selectCoverage(supabase, params, true);
  if ((params.regiao || params.cep) && areas.length === 0) return fail("Região ou CEP sem cobertura ativa");
  if (areas.length === 0) {
    // Same check as verificar_cobertura_regiao: an out-of-area city is never booked nor offered times.
    const coverage = await verificarCoberturaRegiao({ cidade, estado: params.estado });
    if (coverage.success && (coverage.data as { vinculo?: string | null } | undefined)?.vinculo === "SEM_COBERTURA") {
      return { success: false, message: MSG_SEM_COBERTURA,
        data: { cobertura: "SEM_COBERTURA", vinculo: "SEM_COBERTURA", cidade, mensagem_para_lead: MSG_SEM_COBERTURA },
        next_action_hint: `${HINT_SEM_COBERTURA}; nunca ofereça horários` };
    }
  }
  const holidayRejection = await rejectHolidayVisit(supabase, data_visita, cidade);
  if (holidayRejection) return holidayRejection;
  const validEmail = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? email.trim() : null;

  const coveredDows = new Set<number>();
  for (const a of (areas ?? [])) {
    parseDiaSemana(a.dia_semana ?? "").forEach((d) => coveredDows.add(d));
  }

  const visitDate = new Date(data_visita + "T12:00:00");
  const visitDow  = visitDate.getDay();

  if (coveredDows.size > 0 && !coveredDows.has(visitDow)) {
    const validDays = Array.from(coveredDows).map(diaSemanaLabel).join(" e ");
    const candidates = nextDatesForDows(Array.from(coveredDows), 60);
    const holidays = candidates.length > 0
      ? await loadHolidays(supabase, candidates[0], candidates[candidates.length - 1]) : [];
    const proximas = candidates.filter(date => !holidayForDate(holidays, date, cidade)).slice(0, 3);
    return fail(
      `${data_visita} não é dia de cobertura em ${cidade}. Dias válidos: ${validDays}`,
      `Próximas datas disponíveis: ${proximas.join(", ")}. Proponha uma dessas ao cliente.`
    );
  }

  // Check only the windows belonging to this city and the requested weekday,
  // before any schedule, lead update, interaction or notification is written.
  const requestedMinutes = timeMinutes(horario);
  if (!Number.isFinite(requestedMinutes)) return fail("horario deve ser um horário válido no formato HH:MM");
  const windows = (areas ?? [])
    .filter((area) => parseDiaSemana(area.dia_semana ?? "").includes(visitDow))
    .filter((area) => area.horario_inicio && area.horario_fim)
    .map((area) => ({ inicio: area.horario_inicio.slice(0, 5), fim: area.horario_fim.slice(0, 5) }));
  if (windows.length > 0 && !windows.some((window) =>
    requestedMinutes >= timeMinutes(window.inicio) && requestedMinutes <= timeMinutes(window.fim)
  )) {
    const ranges = windows.map((window) => `das ${displayTime(window.inicio)} às ${displayTime(window.fim)}`).join(" ou ");
    const mensagemParaLead = `Nesse dia o consultor atende em ${cidade} ${ranges}. Qual horário dentro dessa faixa fica melhor?`;
    return {
      success: false,
      message: mensagemParaLead,
      data: { cidade, data_visita, janelas: windows, mensagem_para_lead: mensagemParaLead },
      next_action_hint: `Envie ao lead: "${mensagemParaLead}"`,
    };
  }

  // The Flora Google Calendar has a timed commitment at this time: reject before any write.
  if (googleClash(await googleBusy(supabase, data_visita, data_visita), data_visita, requestedMinutes, VISIT_DURATION_MIN)) {
    const mensagemParaLead = `Esse horário já está ocupado na nossa agenda. Posso te oferecer outro horário?`;
    return { success: false, message: mensagemParaLead,
      data: { data_visita, horario, ocupado_google: true, mensagem_para_lead: mensagemParaLead },
      next_action_hint: "Chame consultar_rota_consultor para obter opcoes_horario livres e ofereça ao lead." };
  }

  // Resolve identity only after all route/window checks, before operational writes.
  if (!validatedLead && interaction_id) validatedLead = await loadBookingLead(supabase, undefined, interaction_id);
  const current = await resolveCurrentLead(supabase, params, validatedLead);
  params = current.params;
  const leadId = current.lead.id;
  const bookingLead = current.snapshot;
  const product = bookingLead.category;
  const empresaLabel = params.empresa || "empresa";
  const title        = `Visita Comercial — ${empresaLabel} — ${cidade}${product ? ` [${product}]` : ""}`;
  const startTime    = `${horario}:00`;
  const endHour      = parseInt(horario.split(":")[0], 10) + 1;
  const endTime      = `${String(endHour).padStart(2, "0")}:00:00`;

  const notesArr = bookingNotes(bookingLead, { ...params, email: validEmail }, product);

  const { data: schedule, error } = await supabase
    .from("schedules")
    .insert({
      organization_id: NITSCLEAN_ORG_ID,
      title, scheduled_date: data_visita, start_time: startTime, end_time: endTime,
      schedule_type: "visita_comercial", schedule_subtype: "PROSPECCAO",
      source: "flora", assigned_to: bookingArea(areas, data_visita, horario)?.consultant_user_id ?? await floraDefaultOwner(supabase),
      status: "agendado",
      location: bookingLocation(bookingLead, cidade), zip_code: bookingLead?.zip_code ?? validCep(params.cep), notes: notesArr,
      client_id: bookingLead?.client_id ?? null,
      lead_id: leadId ?? null,
      latitude: coordOrNull((current.params as Record<string, unknown>).latitude ?? params.latitude, 90),
      longitude: coordOrNull((current.params as Record<string, unknown>).longitude ?? params.longitude, 180),
      confirmacao_status: params.chat_id ? "pendente" : "nao_aplicavel",
    })
    .select("id, title, scheduled_date, start_time, status")
    .single();

  if (error) return fail(dbFail("criar agendamento", error));

  // A visit the client asked to reschedule is cancelled by the database trigger in the same transaction as this insert.

  if (leadId) {
    // Automatic pipeline move: booked visit → "Visita agendada" (when the org has that stage configured).
    const stageId = await bookedStageId(supabase);
    await supabase.from("leads")
      .update({ ...(stageId ? { stage_id: stageId } : {}), updated_at: new Date().toISOString() })
      .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", leadId);
  }
  await fillBookingEmail(supabase, bookingLead, validEmail);

  await logInteraction(supabase, "agendar_visita_tecnica", params, ok(schedule), leadId, undefined, interaction_id);

  const dataFmt = visitDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  queueTimeline(supabase, { leadId: String(leadId ?? ""), pessoaId: bookingLead?.pessoa_id, tipo: "agendamento",
    referenciaId: schedule?.id, params,
    resumo: `Visita comercial ${String(data_visita).slice(8, 10)}/${String(data_visita).slice(5, 7)} ${String(horario).slice(0, 5)}${product ? `, ${product}` : ""}` });
  queueTeamNotification(supabase, "agendamento_comercial", { ...params, produto_interesse: product,
    endereco: bookingLead?.endereco, bairro: bookingLead?.bairro, cidade: bookingLead?.city || cidade,
    maps_url: bookingLead?.maps_url }, leadId, schedule?.id);

  const mensagemParaLead =
    `Perfeito! Sua visita comercial está confirmada para ${dataFmt} às ${horario}h em ${cidade}. ` +
    (product
      ? `Nosso consultor vai apresentar ${product} para a sua empresa. `
      : `Nosso consultor vai apresentar as soluções ideais para a sua empresa. `) +
    `Qualquer dúvida, pode chamar aqui! 😊`;

  return ok(
    {
      agendamento_id:              schedule?.id,
      confirmado_provisoriamente:  true,
      agendamento:                 schedule,
      lead_id:                     leadId,
      mensagem_para_lead:          mensagemParaLead,
    },
    `Visita técnica agendada: ${dataFmt} às ${horario}h em ${cidade}`,
    `Envie ao lead: "${mensagemParaLead}"`
  );
}

/**
 * agendar_reuniao_sede — lead solicita reunião presencial na sede NitsClean
 *
 * ATENÇÃO: Flora NUNCA deve oferecer este tipo de reunião proativamente.
 * Só registrar e acionar Fera quando o próprio lead solicitar.
 *
 * Fluxo: Flora registra → Fera notifica equipe NitsClean →
 * Flora informa lead: "Um especialista entrará em contato em breve."
 */
async function agendarReuniaoSede(params: Record<string, unknown>): Promise<McpResponse> {
  const {
    lead_id, interaction_id,
    nome_contato, empresa, telefone, canal,
    data_preferida, motivo,
  } = params as {
    lead_id?: string; interaction_id?: string;
    nome_contato: string; empresa?: string; telefone?: string; canal?: string;
    data_preferida?: string; motivo?: string;
  };

  if (!nome_contato) return fail("nome_contato é obrigatório");

  const supabase = getClient();

  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase
      .from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }

  // Flagrar lead para atendimento humano — equipe NitsClean irá contatar
  if (leadId) {
    await supabase.from("leads").update({
      precisa_humano: true,
      stage:          "qualificado",
      description: [
        `⚠️ REUNIÃO SEDE SOLICITADA`,
        motivo         ? `Motivo: ${motivo}` : null,
        data_preferida ? `Data preferida: ${data_preferida}` : null,
        empresa        ? `Empresa: ${empresa}` : null,
        telefone       ? `Tel: ${telefone}` : null,
        interaction_id ? `Flora: ${interaction_id}` : null,
      ].filter(Boolean).join(" | "),
      updated_at: new Date().toISOString(),
    }).eq("id", leadId);
  }

  await logInteraction(supabase, "agendar_reuniao_sede", params, ok({ solicitado: true }), leadId, canal, interaction_id);

  const mensagemParaLead =
    `Anotado! Recebi sua solicitação de reunião na nossa sede. ` +
    `Um especialista da NitsClean entrará em contato em breve para agendar e confirmar todos os detalhes. ` +
    `Enquanto isso, posso te ajudar com mais alguma informação?`;

  return ok(
    { solicitado: true, lead_id: leadId, mensagem_para_lead: mensagemParaLead },
    "Solicitação de reunião na sede registrada — equipe NitsClean será notificada",
    `Envie ao lead: "${mensagemParaLead}"`
  );
}

async function cancelarReagendarVisita(params: Record<string, unknown>): Promise<McpResponse> {
  const { schedule_id, interaction_id, acao, nova_data, novo_horario, motivo } = params as {
    schedule_id?: string; interaction_id?: string;
    acao: "cancelar" | "reagendar";
    nova_data?: string; novo_horario?: string; motivo?: string;
  };

  const supabase = getClient();
  let schedId = schedule_id;
  if (!schedId && interaction_id) {
    const { data } = await supabase
      .from("schedules").select("id").ilike("notes", `%${interaction_id}%`).limit(1).single();
    schedId = data?.id;
  }
  if (!schedId) return fail("Agendamento não encontrado");

  if (acao === "cancelar") {
    const { error } = await supabase.from("schedules")
      .update({ status: "cancelado", notes: motivo ? `Cancelado: ${motivo}` : "Cancelado via Flora" })
      .eq("id", schedId);
    if (error) return fail(dbFail("cancelar", error));
    return ok({ cancelado: true }, "Agendamento cancelado", "Ofereça uma nova data ao cliente se quiser reagendar");
  }

  if (acao === "reagendar") {
    if (!nova_data || !novo_horario) return fail("Forneça nova_data e novo_horario para reagendar");
    const endHour = parseInt(novo_horario.split(":")[0], 10) + 1;
    const { data: updated, error } = await supabase.from("schedules")
      .update({
        scheduled_date: nova_data,
        start_time:     `${novo_horario}:00`,
        end_time:       `${String(endHour).padStart(2, "0")}:00:00`,
        status:         "agendado",
        notes:          motivo ? `Reagendado: ${motivo}` : "Reagendado via Flora",
      })
      .eq("id", schedId)
      .select("id, scheduled_date, start_time")
      .single();
    if (error) return fail(dbFail("reagendar", error));
    return ok({ reagendado: true, agendamento: updated }, `Reagendado para ${nova_data} às ${novo_horario}h`);
  }

  return fail(`Ação inválida: ${acao}. Use "cancelar" ou "reagendar"`);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 4 — CRM PIPELINE (WRITE)
// ─────────────────────────────────────────────────────────────────────────────

const VALID_STAGES = ["novo", "qualificado", "proposta", "agendado", "ganho", "perdido"];

async function moverLeadEstagio(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, novo_estagio, motivo } = params as {
    lead_id?: string; interaction_id?: string; novo_estagio: string; motivo?: string;
  };

  if (!VALID_STAGES.includes(novo_estagio)) {
    return fail(`Estágio inválido: ${novo_estagio}`, `Estágios válidos: ${VALID_STAGES.join(", ")}`);
  }

  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
  if (!leadId) return fail("Lead não encontrado");

  const { data: lead, error } = await supabase
    .from("leads")
    .update({ stage: novo_estagio, description: motivo, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select("id, contact_name, stage")
    .single();

  if (error) return fail(dbFail("processar a solicitação", error));
  return ok({ lead }, `Lead movido para ${novo_estagio}`);
}

async function atribuirResponsavel(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, responsavel_nome } = params as {
    lead_id?: string; interaction_id?: string; responsavel_nome: string;
  };

  const supabase = getClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, user_id, name")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .ilike("name", `%${responsavel_nome}%`)
    .limit(1);

  const userId = profiles?.[0]?.user_id ?? null;

  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
  if (!leadId) return fail("Lead não encontrado");

  const { error } = await supabase.from("leads")
    .update({ assigned_to: userId, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) return fail(dbFail("processar a solicitação", error));
  return ok(
    { atribuido: true, responsavel: profiles?.[0]?.name ?? responsavel_nome },
    `Lead atribuído para ${profiles?.[0]?.name ?? responsavel_nome}`
  );
}

async function adicionarTag(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, tags } = params as {
    lead_id?: string; interaction_id?: string; tags: string[];
  };

  if (!tags || tags.length === 0) return fail("Forneça pelo menos uma tag");

  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
  if (!leadId) return fail("Lead não encontrado");

  const { data: current } = await supabase.from("leads").select("flora_tags").eq("id", leadId).single();
  const existingTags: string[] = current?.flora_tags ?? [];
  const newTags = [...new Set([...existingTags, ...tags])];

  const { error } = await supabase.from("leads")
    .update({ flora_tags: newTags, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) return fail(dbFail("processar a solicitação", error));
  return ok({ tags: newTags }, `Tags adicionadas: ${tags.join(", ")}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5 — ROUTING / EXCEPTIONS
// ─────────────────────────────────────────────────────────────────────────────

const TRANSFER_DEDUP_MS = 30 * 60 * 1000;
const CHASE_COOLDOWN_MS = 15 * 60 * 1000;

function transferNote(now: Date, motivo: string | null, urgencia: string, resumo: string | null): string {
  const stamp = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
  const parts = [`Motivo: ${motivo ?? "Atendimento humano solicitado"}`, `Urgência: ${urgencia}`];
  if (resumo) parts.push(`Resumo: ${resumo}`);
  return `[${stamp}] Transferência — ${parts.join(" | ")}`;
}

const SCHEDULING_HANDOFF_HINT = "Não transfira para agendar. Peça o e-mail do cliente para enviar o convite e chame criar_lead e depois agendar_visita_tecnica com a data e hora escolhidas.";

/** True when the handoff is really a visit booking and carries no genuine human-only request. */
function isSchedulingHandoff(motivo: unknown, resumo: unknown): boolean {
  const text = `${typeof motivo === "string" ? motivo : ""} ${typeof resumo === "string" ? resumo : ""}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!/agendament|agendar|visita|escolheu|horario/.test(text)) return false;
  return !/pessoa|humano|atendente|vendedor|reclama|insatisf|preco|valor|orcamento|cotacao|desconto|matriz|compra|comprar|pedido|cobrando|retorno|urgente/.test(text);
}

async function solicitarAtendimentoHumano(params: Record<string, unknown>): Promise<McpResponse> {
  const str = (key: string, max = 500): string | null | false => {
    const value = params[key];
    if (value == null) return null;
    if (typeof value !== "string" || value.length > max) return false;
    return value.trim() || null;
  };
  const fields: Record<string, string | null> = {};
  for (const [key, max] of [["lead_id", 100], ["interaction_id", 200], ["chat_id", 300], ["nome_contato", 500],
    ["empresa", 500], ["cidade", 500], ["produto_interesse", 500], ["resumo", 1000], ["motivo", 500], ["urgencia", 20]] as const) {
    const value = str(key, max);
    if (value === false) return fail(`${key} inválido`);
    fields[key] = value;
  }
  const urgencia = fields.urgencia && ["baixa", "media", "alta"].includes(fields.urgencia) ? fields.urgencia : "media";
  const supabase = getClient();
  const leadSelect = "id, description, pessoa_id, contact_phone, canal_origem, instagram_handle, empresa_nome, company, contact_name, city, category, gptmaker_chat_id, assigned_to";

  params = await currentEstablishment(supabase, params);
  const channel = resolveChannelFromChatId(fields.chat_id);
  let candidate: Record<string, unknown> | null = null;
  for (const [column, value] of [["id", fields.lead_id], ["interaction_id", fields.interaction_id], ["gptmaker_chat_id", fields.chat_id], ["contact_phone", digits(params.telefone)]] as const) {
    if (!value || candidate) continue;
    const { data, error } = await supabase.from("leads").select(`${leadSelect}, stage, city`)
      .eq("organization_id", NITSCLEAN_ORG_ID).eq(column, value)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(dbFail("consultar lead da transferência", error));
    candidate = data;
  }
  // Scheduling disguised as a handoff: no atendimento, alert or queue; Flora is told to book instead.
  if (isSchedulingHandoff(fields.motivo, fields.resumo)) {
    const candidateId = candidate && typeof candidate.id === "string" ? candidate.id : null;
    if (candidateId) queueTimeline(supabase, { leadId: candidateId, pessoaId: candidate?.pessoa_id, tipo: "transferencia",
      resumo: "Transferência barrada: era agendamento", params: { chat_id: fields.chat_id } });
    const res: McpResponse = { success: false, data: { acao_correta: "agendar" }, message: SCHEDULING_HANDOFF_HINT, next_action_hint: SCHEDULING_HANDOFF_HINT };
    await logInteraction(supabase, "solicitar_atendimento_humano", params, res, candidateId);
    return res;
  }
  const current = await resolveCurrentLead(supabase, params, candidate);
  const { lead, pessoa } = current;
  const leadCriado = current.created;
  params = current.params;
  const leadId = String(lead.id);

  // Transfer notes now go to the lead timeline; existing description text is left untouched.
  await supabase.from("leads").update({
    precisa_humano: true,
    updated_at: new Date().toISOString(),
  }).eq("id", leadId).eq("organization_id", NITSCLEAN_ORG_ID);

  const event: TeamEvent = fields.motivo && /MATRIZ/i.test(fields.motivo) ? "lead_matriz" : "transferencia";
  const nowDate = new Date();
  const service = await loadHumanService(supabase, nowDate);
  const emHorario = estaEmHorario(nowDate, service.config, service.closed, service.city);
  const proximo = proximoHorarioUtil(nowDate, service.config, service.closed, service.city);
  // Outside hours alerts wait for the next opening; high urgency skips the wait only when the org enabled it.
  const holdAlert = !emHorario && !(urgencia === "alta" && service.urgentBypass);

  let recent = false, cooling = false, alreadyQueued = false;
  try {
    const now = Date.now();
    const { data } = await supabase.from("notification_logs").select("id, sent_at").eq("organization_id", NITSCLEAN_ORG_ID)
      .in("event_type", ["transferencia", "lead_matriz"]).contains("payload", { lead_id: leadId })
      .gte("sent_at", new Date(now - TRANSFER_DEDUP_MS).toISOString()).order("sent_at", { ascending: false }).limit(1);
    const last = (data ?? [])[0];
    recent = Boolean(last);
    cooling = Boolean(last) && new Date(String(last.sent_at)).getTime() > now - CHASE_COOLDOWN_MS;
  } catch { console.error("[solicitar_atendimento_humano] dedup lookup failed"); }
  if (holdAlert) {
    try {
      const { data } = await supabase.from("notification_logs").select("id").eq("organization_id", NITSCLEAN_ORG_ID)
        .eq("status", "QUEUED").contains("payload", { lead_id: leadId }).limit(1);
      alreadyQueued = Array.isArray(data) && data.length > 0;
    } catch { console.error("[solicitar_atendimento_humano] queue lookup failed"); }
  }

  // One open atendimento per lead: follow-ups aggregate into it instead of opening another.
  let atendimentoId: string | null = null;
  let atendimentoAberto = false;
  try {
    const { data: open } = await supabase.from("atendimentos").select("id, cobrancas").eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("lead_id", leadId).in("status", ["aberto", "em_atendimento"]).limit(1).maybeSingle();
    if (open?.id) {
      atendimentoId = String(open.id); atendimentoAberto = true;
      await supabase.from("atendimentos").update({ cobrancas: Number(open.cobrancas ?? 0) + 1,
        ultima_cobranca_em: nowDate.toISOString(), urgencia }).eq("id", atendimentoId).eq("organization_id", NITSCLEAN_ORG_ID);
    } else {
      const { data: created } = await supabase.from("atendimentos").insert({
        organization_id: NITSCLEAN_ORG_ID, lead_id: leadId, pessoa_id: pessoa?.id ?? lead.pessoa_id ?? null,
        empresa: productSearchText(params.empresa) ?? (lead.empresa_nome ?? lead.company ?? null),
        contato_nome: productSearchText(params.nome_contato) ?? (lead.contact_name ?? null),
        canal: channel?.canal ?? (typeof lead.canal_origem === "string" ? lead.canal_origem : null), chat_id: fields.chat_id,
        tipo: event === "lead_matriz" ? "matriz" : "transferencia", motivo: fields.motivo, resumo: timelineText(fields.resumo, 1000),
        urgencia, responsavel_id: (typeof lead.assigned_to === "string" ? lead.assigned_to : null) ?? service.defaultOwner,
        relogio_inicia_em: (emHorario ? nowDate : proximo.at).toISOString(), recebido_fora_horario: !emHorario,
      }).select("id").maybeSingle();
      if (created?.id) atendimentoId = String(created.id);
    }
  } catch { console.error("[solicitar_atendimento_humano] atendimento write failed"); }
  const cobranca = recent || atendimentoAberto;

  // A follow-up ("cobrando retorno") alerts at most once per CHASE_COOLDOWN_MS per lead; outside hours only one alert waits.
  const notificado = holdAlert ? !alreadyQueued : (!recent || (urgencia === "alta" && !cooling));
  const foraLabel = emHorario ? "" : " fora do horário";
  const transferSummary = cobranca
    ? `Cliente cobrou novamente${foraLabel} (urgência ${urgencia})${fields.motivo ? `: ${fields.motivo}` : ""}`
    : `${emHorario ? "Transferido p/ equipe" : "Transferência recebida fora do horário"} (urgência ${urgencia})${fields.motivo ? `: ${fields.motivo}` : ""}`;
  queueTimeline(supabase, { leadId, pessoaId: pessoa?.id ?? lead.pessoa_id, tipo: "transferencia",
    resumo: [transferSummary, timelineText(fields.resumo, 300)].filter(Boolean).join(". "), params, referenciaId: atendimentoId });

  const whatsapp = channel?.canal === "WHATSAPP" ? channel.identificador
    : (!channel && lead.canal_origem === "WHATSAPP" ? digits(lead.contact_phone) : null);
  const instagram = (channel?.canal === "INSTAGRAM" || (!channel && lead.canal_origem === "INSTAGRAM"))
    ? (pessoa?.instagram_handle ?? (typeof lead.instagram_handle === "string" ? lead.instagram_handle : null)) : null;
  if (atendimentoId && (whatsapp || instagram)) {
    try {
      await supabase.from("atendimentos").update({ whatsapp, instagram }).eq("id", atendimentoId).eq("organization_id", NITSCLEAN_ORG_ID);
    } catch { console.error("[solicitar_atendimento_humano] atendimento contact update failed"); }
  }

  const mensagem = holdAlert ? humanOutOfHoursMessage(proximo) : HUMAN_IN_HOURS_MESSAGE;
  const retornoPrevisto = { quando: proximo.at.toISOString(), texto: proximo.label };
  await logInteraction(supabase, "solicitar_atendimento_humano", params, ok({ solicitado: true, lead_id: leadId, em_horario: emHorario }),
    leadId, channel?.canal, fields.interaction_id ?? undefined);

  if (notificado) {
    queueTeamNotification(supabase, event, {
      ...params,
      empresa: params.empresa, nome_contato: params.nome_contato,
      cidade: params.cidade, produto_interesse: params.produto_interesse,
      resumo: fields.resumo, motivo: fields.motivo, urgencia,
      whatsapp_cliente: whatsapp, instagram_cliente: instagram,
      titulo: cobranca ? "⏰ Cliente cobrando retorno" : null,
      atendimento_id: atendimentoId,
      recebido_fora_em: emHorario ? null : stampSaoPaulo(nowDate, service.config.timezone),
    }, leadId, undefined, holdAlert ? proximo.at.toISOString() : undefined);
  }

  return ok({ solicitado: true, lead_id: leadId, lead_criado: leadCriado, notificado, urgencia,
    atendimento_id: atendimentoId, em_horario: emHorario, retorno_previsto: retornoPrevisto, mensagem_para_lead: mensagem });
}

// ─── Team assistant (read-only): what is pending now for a Fera user ───
async function registrarForaCobertura(params: Record<string, unknown>): Promise<McpResponse> {
  const { nome, telefone, instagram_handle, cidade, interaction_id, canal, produto_interesse, estado, chat_id } = params as {
    nome?: string; telefone?: string; instagram_handle?: string; cidade: string;
    interaction_id?: string; canal?: string; produto_interesse?: string; estado?: string; chat_id?: string;
  };

  for (const key of ["nome", "telefone", "instagram_handle", "cidade", "interaction_id", "canal", "produto_interesse", "estado", "chat_id"]) {
    if (params[key] != null && (typeof params[key] !== "string" || (params[key] as string).length > 500)) {
      return fail(`Parâmetro ${key} inválido`);
    }
  }
  if (!cidade?.trim()) return fail("Cidade é obrigatória para registrar fora da cobertura");

  const supabase = getClient();
  const empresa = productSearchText(params.empresa ?? params.empresa_nome);
  const personResult = await resolvePessoa(supabase, { ...params, nome }, true);
  if (personResult.error) return fail(personResult.error);
  const pessoa = personResult.pessoa;
  // Reuse only a lead of this same company, or (without company) this same outside-coverage city.
  const companyKey = normalizedEstablishment(empresa);
  const cityKey = normalizedEstablishment(cidade);
  const sameTarget = (lead: Record<string, unknown>) => (pessoa ? lead.pessoa_id === pessoa.id : true) && (companyKey
    ? normalizedEstablishment(lead.empresa_nome ?? lead.company) === companyKey
    : !normalizedEstablishment(lead.empresa_nome ?? lead.company) && lead.fora_cobertura === true
      && normalizedEstablishment(lead.city) === cityKey);
  const candidates: Record<string, unknown>[] = [];
  const leadSelect = "id, pessoa_id, empresa_nome, company, city, fora_cobertura, stage";
  if (pessoa) {
    const { data, error } = await supabase.from("leads").select(leadSelect).eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("pessoa_id", pessoa.id).order("created_at", { ascending: false }).limit(100);
    if (error) return fail(dbFail("consultar lead", error));
    candidates.push(...(Array.isArray(data) ? data : []));
  }
  if (interaction_id) {
    const { data, error } = await supabase.from("leads").select(leadSelect).eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("interaction_id", interaction_id).limit(1).maybeSingle();
    if (error) return fail(dbFail("consultar lead", error));
    if (data) candidates.push(data);
  }
  // One outside-coverage record per chat: reuse it instead of inserting a duplicate.
  let chatLeadId: string | undefined;
  if (chat_id) {
    const { data, error } = await supabase.from("leads").select("id").eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("gptmaker_chat_id", chat_id).eq("fora_cobertura", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return fail(dbFail("consultar lead", error));
    chatLeadId = (data as { id?: string } | null)?.id;
  }
  const existingId = (candidates.find(sameTarget)?.id as string | undefined) ?? chatLeadId;
  const values = {
        organization_id:  NITSCLEAN_ORG_ID,
        contact_name:     currentContactName(nome, pessoa?.nome),
        contact_phone:    telefone ?? (resolveChannelFromChatId(chat_id)?.canal === "WHATSAPP" ? resolveChannelFromChatId(chat_id)!.identificador : null),
        instagram_handle: instagram_handle  ?? null,
        title:            `Fora de cobertura — ${empresa ? `${empresa} — ` : ""}${cidade}${estado ? `/${estado}` : ""}`,
        stage:            "fechado_perdido",
        source:           canal?.toLowerCase() ?? "whatsapp",
        canal_origem:     (canal ?? resolveChannelFromChatId(chat_id)?.canal ?? "WHATSAPP") as string,
        gptmaker_chat_id:  chat_id ?? null,
        pessoa_id:        pessoa?.id ?? null,
        company:          empresa,
        empresa_nome:     empresa,
        city:             cidade.trim(),
        fora_cobertura:   true,
        vinculo:          "SEM_COBERTURA",
        category:         productSearchText(produto_interesse),
        description:      `Lead fora da área de cobertura. Cidade: ${cidade}${estado ? ` — ${estado}` : ""}`,
        created_by_flora: true,
      };
  const write = existingId
    ? supabase.from("leads").update(values).eq("organization_id", NITSCLEAN_ORG_ID).eq("id", existingId)
    : supabase.from("leads").insert({ ...values, interaction_id: interaction_id ?? null });
  const { data: lead, error } = await write.select("id").single();
  if (error) {
    return fail(dbFail("registrar", error));
  }
  queueTimeline(supabase, { leadId: String(lead?.id ?? ""), pessoaId: pessoa?.id, tipo: "fora_perfil",
    resumo: `Fora da área — ${empresa ? `${empresa}, ` : ""}${cidade}${estado ? `/${estado}` : ""}`, params });

  return ok(
    { registrado: true, cidade, lead_id: lead?.id, vinculo: "SEM_COBERTURA" },
    `Lead em ${cidade} registrado — fora da cobertura atual`,
    "Informe ao cliente: 'No momento não atendemos sua região, mas registramos seu interesse. Quando expandirmos, entraremos em contato!'"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 6 — WEBCHAT OTP (verificação de identidade)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * enviar_codigo_otp — gera e envia código OTP para verificar identidade no WebChat
 *
 * SEGURANÇA: O código NUNCA é retornado para a Flora.
 * Flora recebe apenas token_verificacao (string opaca) para usar em validar_codigo_otp.
 *
 * Fluxo WebChat:
 *   1. Lead informa telefone no WebChat
 *   2. Flora chama enviar_codigo_otp(telefone)
 *   3. Sistema envia OTP via WhatsApp para o telefone
 *   4. Flora pede: "Digite o código de 6 dígitos que enviamos para seu WhatsApp"
 *   5. Lead informa código → Flora chama validar_codigo_otp(token, codigo)
 *   6. Se validado: identidade confirmada
 *
 * TODO: Integrar Z-API para envio real quando WhatsApp for reconectado (D-zapi)
 */
async function enviarCodigoOtp(params: Record<string, unknown>): Promise<McpResponse> {
  const { telefone, interaction_id, canal_envio } = params as {
    telefone: string;
    interaction_id?: string;
    canal_envio?: string;
  };

  if (!telefone) return fail("telefone é obrigatório para enviar OTP");

  const telefoneLimpo = telefone.replace(/\D/g, "");
  if (telefoneLimpo.length < 10) {
    return fail("Telefone inválido — forneça com DDD (ex: 21912345678)");
  }

  // Gerar OTP de 6 dígitos
  const otp     = String(Math.floor(100_000 + Math.random() * 900_000));
  const otpHash = await sha256(otp);

  // Token opaco para a Flora (nunca o código real)
  const token    = `otp_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const expiraEm = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

  const supabase = getClient();

  const { error } = await supabase.from("otp_verifications").insert({
    organization_id: NITSCLEAN_ORG_ID,
    token,
    telefone:        telefoneLimpo,
    codigo_hash:     otpHash,
    canal_envio:     canal_envio ?? "WHATSAPP",
    interaction_id:  interaction_id ?? null,
    expira_em:       expiraEm.toISOString(),
  });

  if (error) return fail(dbFail("gerar OTP", error));

  // TODO: Envio real via Z-API / API WhatsApp
  // await fetch("https://api.z-api.io/instances/INSTANCE/token/TOKEN/send-text", {
  //   method: "POST", headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ phone: telefoneLimpo, message: `Seu código NitsClean: ${otp}. Válido por 5 minutos.` })
  // });

  return ok(
    {
      codigo_enviado:     true,
      expira_em_segundos: 300,
      token_verificacao:  token,
    },
    "Código enviado via WhatsApp",
    "Peça ao lead o código de 6 dígitos recebido e use validar_codigo_otp para confirmar"
  );
}

/**
 * validar_codigo_otp — verifica se o código informado pelo lead é válido
 *
 * Controles:
 * - Máximo de 3 tentativas (configurável em max_tentativas)
 * - Expiração em 5 minutos
 * - Código armazenado apenas como SHA-256 hash (nunca plain)
 */
async function validarCodigoOtp(params: Record<string, unknown>): Promise<McpResponse> {
  const { token_verificacao, codigo_informado } = params as {
    token_verificacao: string;
    codigo_informado: string;
  };

  if (!token_verificacao) return fail("token_verificacao é obrigatório");
  if (!codigo_informado)  return fail("codigo_informado é obrigatório");

  const supabase = getClient();

  const { data: otp } = await supabase
    .from("otp_verifications")
    .select("id, codigo_hash, tentativas, max_tentativas, expira_em, validado")
    .eq("token", token_verificacao)
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .single();

  if (!otp) return ok({ validado: false, motivo: "token_invalido", tentativas_restantes: 0 });

  // Já validado anteriormente
  if (otp.validado) {
    return ok({
      validado:            true,
      ja_validado:         true,
      tentativas_restantes: otp.max_tentativas - otp.tentativas,
    });
  }

  // Verificar expiração
  if (new Date(otp.expira_em) < new Date()) {
    return ok({ validado: false, motivo: "expirado", tentativas_restantes: 0 });
  }

  // Verificar max tentativas
  if (otp.tentativas >= otp.max_tentativas) {
    return ok({ validado: false, motivo: "max_tentativas_atingido", tentativas_restantes: 0 });
  }

  // Comparar hash
  const inputHash       = await sha256(String(codigo_informado).trim());
  const novasTentativas = otp.tentativas + 1;

  if (inputHash === otp.codigo_hash) {
    await supabase.from("otp_verifications")
      .update({ validado: true, tentativas: novasTentativas })
      .eq("token", token_verificacao);

    return ok(
      { validado: true, tentativas_restantes: otp.max_tentativas - novasTentativas },
      "Identidade verificada com sucesso",
      "Prossiga com o atendimento — lead verificado"
    );
  }

  // Código errado
  await supabase.from("otp_verifications")
    .update({ tentativas: novasTentativas })
    .eq("token", token_verificacao);

  const restantes = otp.max_tentativas - novasTentativas;
  return ok(
    { validado: false, motivo: "codigo_incorreto", tentativas_restantes: restantes },
    undefined,
    restantes > 0
      ? `Peça ao lead para tentar novamente. Restam ${restantes} tentativa(s).`
      : "Código bloqueado. Use enviar_codigo_otp para gerar um novo."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP TOOLS MANIFEST (for GPT Maker discovery)
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS_MANIFEST_CLIENTE = [
  {
    name: "localizar_estabelecimento",
    description: "Localiza estabelecimento por nome + cidade ou CEP. Antes de buscar, checa a cobertura: SEM_COBERTURA registra fora de cobertura e devolve a mensagem de fora de área; MATRIZ orienta transferir; sem cidade/CEP pede cidade e bairro. Só busca em DISTRIBUIDORA; sempre confirme o candidato com o lead.",
    parameters: { type: "object", required: ["nome"], properties: {
      nome: { type: "string", maxLength: 200 }, cidade: { type: "string", maxLength: 120 },
      bairro: { type: "string", maxLength: 120 }, cep: { type: "string" },
      estado: { type: "string", maxLength: 60, description: "UF ou nome do estado, se o lead informou" },
    } },
  },
  // ── Block 1: Identification ──────────────────────────────────────────────
  {
    name: "buscar_contato",
    description: "Busca uma pessoa B2B por canal ou e-mail e retorna até cinco estabelecimentos já ligados a ela. Mantém compatibilidade com contatos de clientes existentes.",
    parameters: {
      type: "object",
      properties: {
        canal_id:   { type: "string", description: "Identificador do canal. WhatsApp: E.164 sem + (ex: 5521912345678). Instagram: @handle ou handle." },
        canal_tipo: { type: "string", enum: ["WHATSAPP", "INSTAGRAM", "INSTAGRAM_UID", "MESSENGER", "TELEGRAM", "WIDGET"] },
        nome:       { type: "string", description: "Nome do contato — Modo 2, busca fuzzy primeiro+último token" },
        telefone:   { type: "string", description: "Telefone com DDD — Modo 2, busca nos últimos 8 dígitos" },
        email:      { type: "string", description: "E-mail da pessoa; pode unir conversas de canais diferentes" },
        vincular_canal_id_se_encontrado: { type: "boolean", description: "Se true e Modo 2 encontrou, vincula canal_id+canal_tipo ao contato encontrado" },
      },
    },
  },
  {
    name: "verificar_cobertura_regiao",
    description: "Define vinculo DISTRIBUIDORA (área ativa), MATRIZ (RJ sem área) ou SEM_COBERTURA (outro estado), mensagem e próxima ação. Estado desconhecido exige confirmação. Para datas use consultar_rota_consultor.",
    parameters: {
      type: "object",
      properties: {
        cidade: { type: "string" },
        cep:    { type: "string" },
        estado: { type: "string", description: "UF ou nome do estado; RJ descoberto encaminha à MATRIZ" },
        regiao: { type: "string", description: "Nome exato de uma área ativa; prioridade sobre CEP e cidade" },
      },
    },
  },
  {
    name: "consultar_rota_consultor",
    description: "Retorna as próximas datas em que o consultor estará na cidade. Usar para propor visita técnica proativamente. Retorna datas formatadas para Flora apresentar ao lead.",
    parameters: {
      type: "object",
      properties: {
        cidade:               { type: "string", description: "Cidade do cliente" },
        cep:                  { type: "string" },
        regiao:               { type: "string", description: "Nome exato da área; prioridade sobre CEP e cidade" },
        proximas_datas_count: { type: "number", description: "Quantas próximas datas retornar (padrão: 3, máximo: 6)" },
      },
    },
  },
  {
    name: "obter_promocao_vigente",
    description: "Retorna promoções e destaques de produtos ativos da NitsClean",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "consultar_produto",
    description: "Consulte ANTES de responder sobre qualquer produto. Busca tolerante (sem acento/maiúsculas) por nome, marca, linha, categoria, fornecedor, descrição ou segmento (ex.: hotel, lavanderia). Nunca retorna preço nem produtos descontinuados; cada produto traz disponibilidade (estoque/sob_encomenda) e image_url (null quando não há foto liberada para o cliente — nesse caso não prometa foto). Nome de marca sozinho retorna correspondencia=marca com exemplos. Retorna imagem_enviada quando a imagem de um produto exato foi enviada ao chat. Correspondência TOTAL só quando todas as palavras significativas do termo estão no NOME do produto (envia imagem se for 1 produto); match só na descrição/categoria/segmento retorna correspondencia=segmento, sem imagem. TOTAL/segmento/marca retornam encontrado=true com até 5 produtos. Parcial/nenhuma retorna encontrado=false, produtos=[], similares (até 3) e mensagem_para_lead informando que a NitsClean não trabalha com o produto citado — use-a; nunca prometa apresentar o produto citado.",
    parameters: {
      type: "object",
      properties: {
        termo:     { type: "string", description: "Texto livre citado pelo cliente: nome, marca ou linha do produto" },
        categoria: { type: "string", description: "Categoria opcional para ordenar resultados ou sugerir similares quando o termo não encontra produto; nunca exclui correspondências pelo termo" },
        nome:      { type: "string", description: "Compatibilidade: mesmo que termo" },
        chat_id:   { type: "string", description: "ID do chat no GPT Maker; quando houver UM produto exato com imagem, a imagem é enviada ao cliente (no máximo 1x por 24h)" },
      },
    },
  },
  // ── Block 2: Lead Capture ─────────────────────────────────────────────────
  {
    name: "criar_lead",
    description: "Registra uma oportunidade por estabelecimento. Reutiliza somente lead aberto da mesma pessoa e do mesmo local; mantém idempotência por interaction_id.",
    parameters: {
      type: "object",
      required: ["nome", "canal", "interaction_id"],
      properties: {
        resumo_conversa: { type: "string", description: "Opcional: resumo curto (até 500 caracteres) do que foi conversado, sem e-mail/telefone" },
        proximo_passo:   { type: "string", description: "Opcional: próximo passo combinado (até 200 caracteres)" },
        nome:              { type: "string" },
        telefone:          { type: "string" },
        email:             { type: "string", description: "E-mail opcional; preenche lead e pessoa apenas se vazios" },
        email:             { type: "string" },
        empresa_nome:      { type: "string", description: "Nome da empresa (B2B)" },
        cargo_contato:     { type: "string", description: "Cargo/função do contato na empresa" },
        canal:             { type: "string", enum: ["WIDGET", "WHATSAPP", "MESSENGER", "INSTAGRAM", "TELEGRAM"] },
        origem_especifica: { type: "string", enum: ["DM", "COMMENT", "QR_PRODUTO", "ANUNCIO_PAGO", "WIDGET_DIRECT"] },
        interaction_id:    { type: "string", description: "ID único da sessão Flora para idempotência" },
        instagram_handle:  { type: "string" },
        produto_interesse: { type: "string" },
        cidade:            { type: "string" },
        endereco:          { type: "string" },
        bairro:            { type: "string" },
        cep:               { type: "string" },
        latitude:          { type: "number" },
        longitude:         { type: "number" },
        maps_url:          { type: "string" },
        place_id:          { type: "string" },
        regiao:            { type: "string" },
        mensagem_inicial:  { type: "string" },
        post_id:           { type: "string", description: "ID do post IG que gerou o lead (BI de performance)" },
        post_titulo:       { type: "string", description: "Título/descrição do post IG" },
        vinculo:           { type: "string", enum: ["DISTRIBUIDORA", "MATRIZ", "SEM_COBERTURA"] },
        client_contact_id: { type: "string", description: "UUID do contato já identificado em client_contacts" },
      },
    },
  },
  {
    name: "atualizar_lead",
    description: "Atualiza dados de um lead existente",
    parameters: {
      type: "object",
      properties: {
        resumo_conversa: { type: "string", description: "Opcional: resumo curto (até 500 caracteres) do que foi conversado, sem e-mail/telefone" },
        proximo_passo:   { type: "string", description: "Opcional: próximo passo combinado (até 200 caracteres)" },
        lead_id:           { type: "string" },
        interaction_id:    { type: "string" },
        nome:              { type: "string" },
        telefone:          { type: "string" },
        email:             { type: "string" },
        empresa_nome:      { type: "string" },
        cargo_contato:     { type: "string" },
        produto_interesse: { type: "string" },
        notas:             { type: "string" },
        valor_estimado:    { type: "number" },
        post_id:           { type: "string" },
        post_titulo:       { type: "string" },
        vinculo:           { type: "string", enum: ["DISTRIBUIDORA", "MATRIZ", "SEM_COBERTURA"] },
      },
    },
  },
  {
    name: "registrar_interacao",
    description: "Registra um evento/interação no histórico do lead",
    parameters: {
      type: "object",
      required: ["tipo", "notas"],
      properties: {
        resumo_conversa: { type: "string", description: "Opcional: resumo curto (até 500 caracteres) do que foi conversado, sem e-mail/telefone" },
        proximo_passo:   { type: "string", description: "Opcional: próximo passo combinado (até 200 caracteres)" },
        lead_id:        { type: "string" },
        interaction_id: { type: "string" },
        tipo:           { type: "string", enum: ["mensagem", "ligacao", "email", "reuniao", "demo", "outro"] },
        notas:          { type: "string" },
        canal:          { type: "string" },
      },
    },
  },
  // ── Block 3: Scheduling ───────────────────────────────────────────────────
  {
    name: "listar_horarios_disponiveis",
    description: "Lista horários disponíveis para agendamento na cidade do cliente",
    parameters: {
      type: "object",
      properties: {
        cidade:         { type: "string" },
        data_preferida: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "agendar_visita",
    description: "Cria agendamento genérico de visita. Para visitas técnicas B2B use agendar_visita_tecnica.",
    parameters: {
      type: "object",
      required: ["nome_contato", "data_visita", "horario"],
      properties: {
        lead_id:           { type: "string" }, interaction_id: { type: "string" },
        nome_contato:      { type: "string" }, empresa: { type: "string" }, telefone: { type: "string" },
        data_visita:       { type: "string", description: "YYYY-MM-DD" },
        horario:           { type: "string", description: "HH:MM" },
        cidade:            { type: "string" }, cep: { type: "string" }, produto_interesse: { type: "string" }, notas: { type: "string" },
      },
    },
  },
  {
    name: "agendar_visita_tecnica",
    description: "Agenda visita técnica do consultor NitsClean ao cliente. PRINCIPAL FORMA DE VENDA — Flora deve estimular proativamente após confirmar cidade com cobertura. Valida que a data é dia de cobertura. Retorna mensagem_para_lead pronta.",
    parameters: {
      type: "object",
      required: ["nome_contato", "data_visita", "horario", "cidade"],
      properties: {
        resumo_conversa: { type: "string", description: "Opcional: resumo curto (até 500 caracteres) do que foi conversado, sem e-mail/telefone" },
        proximo_passo:   { type: "string", description: "Opcional: próximo passo combinado (até 200 caracteres)" },
        chat_id: { type: "string", description: "Chat atual do GPT Maker; recupera o estabelecimento selecionado" },
        endereco: { type: "string" }, bairro: { type: "string" },
        maps_url: { type: "string" }, place_id: { type: "string" },
        lead_id:           { type: "string" },
        interaction_id:    { type: "string" },
        contato_id:        { type: "string", description: "UUID de client_contacts se lead já identificado" },
        nome_contato:      { type: "string" },
        empresa:           { type: "string" },
        telefone:          { type: "string" },
        cargo:             { type: "string" },
        email:             { type: "string", description: "E-mail opcional do contato; preenche o lead apenas se vazio" },
        data_visita:       { type: "string", description: "YYYY-MM-DD — deve ser dia de cobertura da cidade" },
        horario:           { type: "string", description: "HH:MM" },
        cidade:            { type: "string", description: "Cidade onde o consultor visitará (obrigatório)" },
        regiao:            { type: "string", description: "Nome exato da área; prioridade sobre CEP e cidade" },
        cep:               { type: "string" },
        produto_interesse: { type: "string" },
        notas:             { type: "string" },
      },
    },
  },
  {
    name: "agendar_reuniao_sede",
    description: "Registra solicitação de reunião presencial na sede NitsClean. Usar APENAS quando o próprio lead solicitar — nunca oferecer proativamente. Flora responde: 'um especialista entrará em contato em breve'.",
    parameters: {
      type: "object",
      required: ["nome_contato"],
      properties: {
        lead_id:        { type: "string" },
        interaction_id: { type: "string" },
        nome_contato:   { type: "string" },
        empresa:        { type: "string" },
        telefone:       { type: "string" },
        canal:          { type: "string" },
        data_preferida: { type: "string", description: "Data sugerida pelo lead (YYYY-MM-DD)" },
        motivo:         { type: "string" },
      },
    },
  },
  {
    name: "cancelar_reagendar_visita",
    description: "Cancela ou reagenda uma visita existente",
    parameters: {
      type: "object",
      required: ["acao"],
      properties: {
        schedule_id:    { type: "string" },
        interaction_id: { type: "string" },
        acao:           { type: "string", enum: ["cancelar", "reagendar"] },
        nova_data:      { type: "string" },
        novo_horario:   { type: "string" },
        motivo:         { type: "string" },
      },
    },
  },
  // ── Block 4: CRM Pipeline ─────────────────────────────────────────────────
  {
    name: "mover_lead_estagio",
    description: "Move um lead para outro estágio do funil CRM",
    parameters: {
      type: "object",
      required: ["novo_estagio"],
      properties: {
        lead_id:        { type: "string" },
        interaction_id: { type: "string" },
        novo_estagio:   { type: "string", enum: ["novo", "qualificado", "proposta", "agendado", "ganho", "perdido"] },
        motivo:         { type: "string" },
      },
    },
  },
  {
    name: "atribuir_responsavel",
    description: "Atribui um lead a um consultor/vendedor pelo nome",
    parameters: {
      type: "object",
      required: ["responsavel_nome"],
      properties: {
        lead_id:          { type: "string" },
        interaction_id:   { type: "string" },
        responsavel_nome: { type: "string" },
      },
    },
  },
  {
    name: "adicionar_tag",
    description: "Adiciona tags/labels a um lead para segmentação",
    parameters: {
      type: "object",
      required: ["tags"],
      properties: {
        lead_id:        { type: "string" },
        interaction_id: { type: "string" },
        tags:           { type: "array", items: { type: "string" } },
      },
    },
  },
  // ── Block 5: Routing / Exceptions ─────────────────────────────────────────
  {
    name: "responder_confirmacao_visita",
    description: "Use quando o cliente responder ao lembrete de visita enviado pela NitsClean: 'confirmo' confirma a visita; 'preciso remarcar' devolve opcoes_horario prontas e mensagem_para_lead. Depois que o cliente escolher, chame agendar_visita_tecnica com o mesmo lead_id (a visita antiga é cancelada sozinha).",
    parameters: {
      type: "object",
      required: ["chat_id", "resposta"],
      properties: {
        chat_id:  { type: "string", description: "chat_id da conversa atual" },
        resposta: { type: "string", description: "confirmo | remarcar (ou o texto do cliente)" },
      },
    },
  },
  {
    name: "solicitar_atendimento_humano",
    description: "Transfere o cliente para atendimento humano: garante um lead no Fera (cria se necessário), registra nota no histórico e notifica a equipe (sem repetir em 30 min, exceto urgência alta).",
    parameters: {
      type: "object",
      properties: {
        resumo_conversa: { type: "string", description: "Opcional: resumo curto (até 500 caracteres) do que foi conversado, sem e-mail/telefone" },
        proximo_passo:   { type: "string", description: "Opcional: próximo passo combinado (até 200 caracteres)" },
        telefone: { type: "string" }, email: { type: "string" }, cep: { type: "string" },
        endereco: { type: "string" }, bairro: { type: "string" },
        maps_url: { type: "string" }, place_id: { type: "string" },
        lead_id:           { type: "string", description: "ID do lead, se já conhecido" },
        interaction_id:    { type: "string" },
        chat_id:           { type: "string", description: "chat_id do GPT Maker; identifica pessoa e canal" },
        nome_contato:      { type: "string", description: "Nome de quem está conversando" },
        empresa:           { type: "string", description: "Empresa/estabelecimento do cliente" },
        cidade:            { type: "string" },
        produto_interesse: { type: "string" },
        resumo:            { type: "string", description: "O que o cliente pediu, em uma ou duas frases" },
        motivo:            { type: "string", description: "Motivo da transferência; contenha MATRIZ para leads da Matriz" },
        urgencia:          { type: "string", enum: ["baixa", "media", "alta"] },
      },
    },
  },
  {
    name: "registrar_fora_cobertura",
    description: "Registra interesse de lead SEM_COBERTURA (fora do RJ). Não usar para vínculo MATRIZ. Não dispara notificação da equipe.",
    parameters: {
      type: "object",
      required: ["cidade"],
      properties: {
        resumo_conversa: { type: "string", description: "Opcional: resumo curto (até 500 caracteres) do que foi conversado, sem e-mail/telefone" },
        proximo_passo:   { type: "string", description: "Opcional: próximo passo combinado (até 200 caracteres)" },
        empresa:         { type: "string", description: "Opcional: empresa/estabelecimento atual (isola o lead por empresa)" },
        nome:              { type: "string" },
        telefone:          { type: "string" },
        instagram_handle:  { type: "string" },
        cidade:            { type: "string" },
        estado:            { type: "string" },
        chat_id:           { type: "string", description: "Chat GPT Maker; preserva canal e identificador do contato" },
        interaction_id:    { type: "string" },
        canal:             { type: "string" },
        produto_interesse: { type: "string" },
      },
    },
  },
  // ── Block 6: WebChat OTP ──────────────────────────────────────────────────
  {
    name: "enviar_codigo_otp",
    description: "Gera e envia código OTP via WhatsApp para verificar identidade no WebChat. O código NUNCA é retornado — apenas token_verificacao opaco. Usar para confirmar que lead possui o telefone informado.",
    parameters: {
      type: "object",
      required: ["telefone"],
      properties: {
        telefone:       { type: "string", description: "Telefone com DDD, sem + (ex: 21912345678)" },
        interaction_id: { type: "string" },
        canal_envio:    { type: "string", enum: ["WHATSAPP"], description: "Canal de envio (padrão: WHATSAPP)" },
      },
    },
  },
  {
    name: "validar_codigo_otp",
    description: "Valida código OTP informado pelo lead. Máximo 3 tentativas, expira em 5 minutos. Retorna validado: true/false e tentativas_restantes.",
    parameters: {
      type: "object",
      required: ["token_verificacao", "codigo_informado"],
      properties: {
        token_verificacao: { type: "string", description: "Token opaco recebido em enviar_codigo_otp" },
        codigo_informado:  { type: "string", description: "Código de 6 dígitos informado pelo lead" },
      },
    },
  },
];

// Expose the trusted chat identifier to every tool without making it required.
for (const tool of TOOLS_MANIFEST_CLIENTE) {
  Object.assign(tool.parameters.properties, {
    chat_id: { type: "string", description: "ID real do chat GPT Maker: canal-contato. Prevalece sobre campos de canal preenchidos pelo modelo." },
  });
}

function coordOrNull(value: unknown, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

/** Client answer to a visit confirmation sent by the Fera: confirm, or start a reschedule with ready-made options. */
async function responderConfirmacaoVisita(params: Record<string, unknown>): Promise<McpResponse> {
  const chatId = typeof params.chat_id === "string" ? params.chat_id.trim() : "";
  const resposta = String(params.resposta ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const kind = /remarc|reagend|outro dia|outro horario|nao posso|nao vou/.test(resposta) ? "remarcar"
    : /confirm|sim|ok|combinado|pode ser|certo/.test(resposta) ? "confirmo" : null;
  if (!chatId) return fail("Informe o chat_id");
  if (!kind) return fail("Resposta não reconhecida", "Pergunte ao cliente se confirma a visita ou se precisa remarcar");
  const supabase = getClient();
  const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const { data: leads } = await supabase.from("leads").select("id, city, regiao, zip_code").eq("organization_id", NITSCLEAN_ORG_ID).eq("gptmaker_chat_id", chatId);
  const leadIds = (leads ?? []).map((l: { id: string }) => l.id);
  if (!leadIds.length) return ok({ encontrado: false }, "Nenhuma visita encontrada para esta conversa");
  const { data: visits } = await supabase.from("schedules").select("id, lead_id, scheduled_date, start_time, status")
    .eq("organization_id", NITSCLEAN_ORG_ID).in("lead_id", leadIds).in("status", ["agendado", "confirmado"]).gte("scheduled_date", today)
    .order("scheduled_date").order("start_time").limit(1);
  const visit = visits?.[0];
  if (!visit) return ok({ encontrado: false }, "Nenhuma visita futura encontrada para esta conversa");
  const quando = `${String(visit.scheduled_date).slice(8, 10)}/${String(visit.scheduled_date).slice(5, 7)} às ${Number(String(visit.start_time).slice(0, 2))}h${String(visit.start_time).slice(3, 5) === "00" ? "" : String(visit.start_time).slice(3, 5)}`;
  const timeline = (resumo: string) => queueTimeline(supabase, { leadId: visit.lead_id, tipo: "visita", referenciaId: visit.id, params, resumo });
  if (kind === "confirmo") {
    const { error } = await supabase.from("schedules").update({ status: "confirmado", confirmacao_status: "confirmado", confirmado_em: new Date().toISOString() }).eq("id", visit.id);
    if (error) return fail(dbFail("confirmar visita", error));
    timeline(`Cliente confirmou a visita de ${quando}`);
    return ok({ encontrado: true, confirmado: true, schedule_id: visit.id, mensagem_para_lead: `Perfeito, visita confirmada para ${quando}. Até lá!` }, "Visita confirmada");
  }
  const { error } = await supabase.from("schedules").update({ confirmacao_status: "remarcar" }).eq("id", visit.id);
  if (error) return fail(dbFail("remarcar visita", error));
  timeline(`Cliente pediu para remarcar a visita de ${quando}`);
  const lead = (leads ?? []).find((l: { id: string }) => l.id === visit.lead_id) as { city?: string; regiao?: string; zip_code?: string } | undefined;
  const rota = await consultarRotaConsultor({ chat_id: chatId, cidade: lead?.city ?? undefined, regiao: lead?.regiao ?? undefined, cep: lead?.zip_code ?? undefined });
  const rd = (rota.success ? rota.data : {}) as Record<string, unknown>;
  return ok({ encontrado: true, remarcar: true, schedule_id: visit.id, lead_id: visit.lead_id,
    opcoes_horario: rd.opcoes_horario ?? [], precisa_localizar: rd.precisa_localizar ?? false,
    mensagem_para_lead: typeof rd.mensagem_para_lead === "string" ? rd.mensagem_para_lead : "Sem problemas! Qual dia e horário ficam melhores para você?" },
    "Visita marcada para remarcar", "Quando o cliente escolher, chame agendar_visita_tecnica com o mesmo lead_id; a visita antiga é cancelada automaticamente");
}

// ─────────────────────────────────────────────────────────────────────────────
// FLORA EQUIPE (Lote 14) — same Flora, same number. The caller is ALWAYS identified on the server from the
// chat_id phone (part after "-") against active Fera users; phone/name params sent by the AI are ignored.
// ─────────────────────────────────────────────────────────────────────────────

interface TeamUser { user_id: string; nome: string; papeis: string[]; organization_id: string; phones: string[] }
type TeamLookup = { user: TeamUser | null; ambiguo: boolean };
const TEAM_TTL_MS = 60_000;
const teamCache = new Map<string, { at: number; value: TeamLookup }>();
const PRIVILEGED_ROLES = ["admin", "gestor", "super_admin"];

function phoneVariants(phone: string): string[] {
  return Array.from(new Set([phone, phone.startsWith("55") ? phone.slice(2) : `55${phone}`]));
}

/** Team member behind this chat (WhatsApp only), or null. Never reads phone/name from params. */
async function resolverEquipe(supabase: ReturnType<typeof getClient>, chatId: unknown): Promise<TeamLookup> {
  const channel = resolveChannelFromChatId(chatId);
  const phone = channel?.canal === "WHATSAPP" ? digits(channel.identificador) : null;
  if (!phone || phone.length < 10) return { user: null, ambiguo: false };
  const hit = teamCache.get(phone);
  if (hit && Date.now() - hit.at < TEAM_TTL_MS) return hit.value;
  const variants = phoneVariants(phone);
  let value: TeamLookup = { user: null, ambiguo: false };
  try {
    const { data, error } = await supabase.from("profiles").select("user_id, name, organization_id, is_active").eq("organization_id", NITSCLEAN_ORG_ID).in("phone", variants).limit(5);
    if (error) { dbFail("identificar usuário da equipe", error); return value; }
    const active = (Array.isArray(data) ? data : []).filter((p: { is_active?: boolean | null }) => p.is_active !== false);
    if (active.length > 1 || (active.length === 1 && active[0].organization_id !== NITSCLEAN_ORG_ID)) value = { user: null, ambiguo: active.length > 1 };
    else if (active.length === 1) {
      const p = active[0] as { user_id: string; name: string | null; organization_id: string };
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", p.user_id);
      const papeis = (Array.isArray(roles) ? roles : []).map((r: { role: string }) => r.role).filter((r: string) => r !== "visitante");
      if (papeis.length) value = { user: { user_id: p.user_id, nome: p.name ?? "Equipe", papeis, organization_id: p.organization_id, phones: variants }, ambiguo: false };
    }
  } catch { console.error("[mcp] team lookup failed"); }
  teamCache.set(phone, { at: Date.now(), value });
  return value;
}

const NAO_AUTORIZADO: McpResponse = { success: false, message: "não autorizado", data: { autorizado: false } };
function isPrivileged(u: TeamUser): boolean { return u.papeis.some((r) => PRIVILEGED_ROLES.includes(r)); }
function hasRole(u: TeamUser, ...roles: string[]): boolean { return u.papeis.some((r) => roles.includes(r)); }
/** Field roles (anything beyond back-office billing/credit). */
function isField(u: TeamUser): boolean { return u.papeis.some((r) => !["financeiro", "faturamento"].includes(r)); }
function feraLink(path: string): string { return `${FERA_NOTIFICATION_URL}${path}`; }
function spToday(): string { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
function validDate(v: unknown): string | null { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
function visitCode(id: string, oc?: unknown): string { return typeof oc === "string" && oc ? `#${oc}` : `#V-${id.slice(0, 8)}`; }

async function withTeam(fn: (u: TeamUser, supabase: ReturnType<typeof getClient>) => Promise<McpResponse>, params: Record<string, unknown>,
  allowed?: (u: TeamUser) => boolean): Promise<McpResponse> {
  const supabase = getClient();
  const { user, ambiguo } = await resolverEquipe(supabase, params.chat_id);
  if (ambiguo) return { ...NAO_AUTORIZADO, message: "não autorizado: este número está em mais de um cadastro; peça ao gestor para corrigir em Usuários" };
  if (!user || (allowed && !allowed(user))) return NAO_AUTORIZADO;
  return fn(user, supabase);
}

/** Client-flow tools refuse team chats so a team member is never turned into a lead, booking or handoff. */
const CLIENT_ONLY_TOOLS = new Set(["criar_lead", "agendar_visita", "agendar_visita_tecnica", "agendar_reuniao_sede", "solicitar_atendimento_humano", "registrar_fora_cobertura", "responder_confirmacao_visita"]);
async function refuseTeamInClientFlow(method: string, params: Record<string, unknown>): Promise<McpResponse | null> {
  if (!CLIENT_ONLY_TOOLS.has(method)) return null;
  const { user } = await resolverEquipe(getClient(), params.chat_id);
  if (!user) return null;
  return { success: false, message: "Este número é de um usuário da equipe do Fera: não trate como cliente.",
    data: { use_ferramentas_equipe: true, equipe: { nome: user.nome, papeis: user.papeis } },
    next_action_hint: "Use as ferramentas de equipe (minha_agenda, criar_lead_equipe, agendar_visita_equipe, listar_pendencias)." };
}
async function teamInfo(chatId: unknown): Promise<{ nome: string; papeis: string[] } | null> {
  const { user } = await resolverEquipe(getClient(), chatId);
  return user ? { nome: user.nome, papeis: user.papeis } : null;
}

type ScheduleRow = Record<string, any>;
const SCHEDULE_FIELDS = "id, ocorrencia_codigo, ocorrencia_tipo, coleta_status, title, scheduled_date, start_time, status, schedule_type, schedule_subtype, prontidao, assigned_to, location, client_id, lead_id, clients(name), leads(empresa_nome, company, title)";
const PRONTIDAO_TXT: Record<string, string> = { falta_nota: "falta nota", falta_material: "falta separar material", falta_ambos: "falta nota e material" };
function visitSummary(s: ScheduleRow) {
  return { codigo: visitCode(s.id, s.ocorrencia_codigo), tipo_ocorrencia: s.ocorrencia_tipo ?? null, horario: typeof s.start_time === "string" ? s.start_time.slice(0, 5) : null,
    cliente: s.clients?.name ?? s.leads?.empresa_nome ?? s.leads?.company ?? s.leads?.title ?? s.title, tipo: s.schedule_type,
    status: s.status, prontidao: s.prontidao === "pronto" ? "pronto" : PRONTIDAO_TXT[s.prontidao] ?? s.prontidao,
    local: s.location ?? null, link: feraLink(`/agenda?agendamento=${s.id}`) };
}

async function identificarUsuario(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data } = await supabase.from("notification_logs").select("event_type, payload, sent_at, queued_at")
      .eq("organization_id", NITSCLEAN_ORG_ID).in("destination", u.phones).or(`sent_at.gte.${since},queued_at.gte.${since}`).limit(10);
    const ultimos_avisos = (Array.isArray(data) ? data : []).filter((l: any) => l.payload?.codigo)
      .map((l: any) => ({ codigo: l.payload.codigo, evento: l.event_type, em: l.sent_at ?? l.queued_at }));
    return ok({ autorizado: true, nome: u.nome, papeis: u.papeis, visao: isPrivileged(u) ? "organizacao" : "propria", ultimos_avisos });
  }, params);
}

async function minhaAgenda(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const date = validDate(params.data) ?? spToday();
    const { data, error } = await supabase.from("schedules").select(SCHEDULE_FIELDS).eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("assigned_to", u.user_id).eq("scheduled_date", date).neq("status", "cancelado").order("start_time").limit(30);
    if (error) return fail(dbFail("consultar agenda", error));
    return ok({ data: date, visitas: (Array.isArray(data) ? data : []).map(visitSummary), link: feraLink("/hoje") });
  }, params);
}

async function agendaEquipe(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (_u, supabase) => {
    const date = validDate(params.data) ?? spToday();
    const [{ data, error }, { data: profs }] = await Promise.all([
      supabase.from("schedules").select(SCHEDULE_FIELDS).eq("organization_id", NITSCLEAN_ORG_ID).eq("scheduled_date", date)
        .neq("status", "cancelado").order("start_time").limit(100),
      supabase.from("profiles").select("user_id, name").eq("organization_id", NITSCLEAN_ORG_ID),
    ]);
    if (error) return fail(dbFail("consultar agenda da equipe", error));
    const names = new Map((Array.isArray(profs) ? profs : []).map((p: any) => [p.user_id, p.name]));
    const filtro = typeof params.consultor === "string" ? params.consultor.trim().toLowerCase() : "";
    const grupos: Record<string, unknown[]> = {};
    for (const s of Array.isArray(data) ? data : []) {
      const nome = String(names.get(s.assigned_to) ?? "Sem responsável");
      if (filtro && !nome.toLowerCase().includes(filtro)) continue;
      (grupos[nome] ??= []).push(visitSummary(s));
    }
    return ok({ data: date, consultores: Object.entries(grupos).map(([consultor, visitas]) => ({ consultor, visitas })), link: feraLink("/dashboard") });
  }, params, isPrivileged);
}

async function listarPendencias(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const privileged = isPrivileged(u);
    const faturamento = hasRole(u, "faturamento");
    const today = spToday();
    let atQuery = supabase.from("atendimentos").select("id, empresa, contato_nome, status, urgencia, aberto_em, relogio_inicia_em, responsavel_id, assumido_por")
      .eq("organization_id", NITSCLEAN_ORG_ID).in("status", ["aberto", "em_atendimento"]).order("relogio_inicia_em").limit(30);
    if (!privileged) atQuery = atQuery.or(`responsavel_id.eq.${u.user_id},assumido_por.eq.${u.user_id}`);
    let visitQuery = supabase.from("schedules").select("id, title, start_time, location, status, assigned_to, prontidao, ocorrencia_codigo, coleta_status, coleta_pendencias")
      .eq("organization_id", NITSCLEAN_ORG_ID).eq("scheduled_date", today).neq("status", "cancelado").order("start_time").limit(30);
    if (!privileged) visitQuery = visitQuery.eq("assigned_to", u.user_id);
    const tarefaQuery = privileged || faturamento
      ? supabase.from("tarefas_faturamento").select("id, numero, empresa_nome, tipo_nota, acao, data_visita, prazo").eq("organization_id", NITSCLEAN_ORG_ID)
        .eq("status", "aberta").order("prazo").limit(30)
      : Promise.resolve({ data: [] });
    const [{ data: ats }, { data: visits }, { data: tarefas }] = await Promise.all([atQuery, visitQuery, tarefaQuery as any]);
    const service = await loadHumanService(supabase, new Date());
    const now = new Date();
    return ok({
      usuario: { nome: u.nome, visao: privileged ? "organizacao" : "propria" },
      atendimentos: (Array.isArray(ats) ? ats : []).map((a: Record<string, unknown>) => {
        const minutos = minutosUteis(new Date(String(a.relogio_inicia_em)), now, service.config, service.closed, service.city);
        return { codigo: `#A-${String(a.id).slice(0, 8)}`, empresa: a.empresa ?? a.contato_nome ?? "Cliente", status: a.status, urgencia: a.urgencia,
          espera_minutos_uteis: minutos, gravidade: gravidade(minutos),
          link: `${FERA_NOTIFICATION_URL}/atendimentos?id=${encodeURIComponent(String(a.id))}` };
      }),
      visitas_hoje: (Array.isArray(visits) ? visits : []).map((v: Record<string, unknown>) => ({ codigo: visitCode(String(v.id), v.ocorrencia_codigo), titulo: v.title, coleta_pendente: v.coleta_status === "pendente" ? v.coleta_pendencias ?? [] : undefined,
        horario: typeof v.start_time === "string" ? v.start_time.slice(0, 5) : null, local: v.location ?? null,
        prontidao: v.prontidao === "pronto" ? "pronto" : PRONTIDAO_TXT[String(v.prontidao)] ?? v.prontidao,
        link: `${FERA_NOTIFICATION_URL}/agenda?agendamento=${encodeURIComponent(String(v.id))}` })),
      tarefas_nota: (Array.isArray(tarefas) ? tarefas : []).map((t: any) => ({ codigo: `#T-${t.numero}`, empresa: t.empresa_nome, acao: t.acao, tipo_nota: t.tipo_nota,
        data_visita: t.data_visita, prazo: t.prazo, link: feraLink("/tarefas") })),
    });
  }, params);
}

/** Visibility mirrors the screens: managers/stock/back-office see the whole tenant, others only their own portfolio. */
function seesAll(u: TeamUser): boolean { return isPrivileged(u) || hasRole(u, "operacional", "financeiro", "faturamento"); }

async function consultarClienteOuLead(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const termo = productSearchText(params.termo);
    if (!termo || termo.length < 2) return fail("Informe o nome da empresa (termo)");
    const like = `%${termo.replace(/[%_,()]/g, " ").trim()}%`;
    let cq = supabase.from("clients").select("id, name, company, city, phone").eq("organization_id", NITSCLEAN_ORG_ID)
      .or(`name.ilike.${like},company.ilike.${like}`).limit(5);
    let lq = supabase.from("leads").select("id, empresa_nome, company, title, city, contact_name, stage").eq("organization_id", NITSCLEAN_ORG_ID)
      .is("client_id", null).or(`empresa_nome.ilike.${like},company.ilike.${like},title.ilike.${like}`).limit(5);
    if (!seesAll(u)) {
      cq = cq.or(`created_by.eq.${u.user_id},assigned_user_id.eq.${u.user_id}`);
      lq = lq.or(`created_by.eq.${u.user_id},assigned_to.eq.${u.user_id}`);
    }
    const [{ data: clients, error: ce }, { data: leads, error: le }] = await Promise.all([cq, lq]);
    if (ce || le) return fail(dbFail("consultar cliente ou lead", ce ?? le));
    const today = spToday();
    const resumo = async (kind: "cliente" | "lead", row: any) => {
      const col = kind === "cliente" ? "client_id" : "lead_id";
      const [{ data: contatos }, { data: prox }, pontos, hist] = await Promise.all([
        supabase.from("empresa_contatos").select("cargo, is_primary, pessoas(nome)").eq(col, row.id).limit(5),
        supabase.from("schedules").select("id, scheduled_date, start_time, title").eq(col, row.id).gte("scheduled_date", today)
          .in("status", ["agendado", "confirmado"]).order("scheduled_date").limit(1).maybeSingle(),
        kind === "cliente" ? supabase.from("comodatos").select("id", { count: "exact", head: true }).eq("client_id", row.id) : Promise.resolve({ count: null }),
        kind === "lead" ? supabase.from("lead_timeline").select("resumo, created_at").eq("lead_id", row.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
          : supabase.from("schedules").select("resumo_execucao, scheduled_date").eq("client_id", row.id).eq("status", "concluido").order("scheduled_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const h: any = (hist as any)?.data;
      return { tipo: kind, nome: kind === "cliente" ? row.company || row.name : row.empresa_nome || row.company || row.title, cidade: row.city ?? null,
        contatos: (Array.isArray(contatos) ? contatos : []).map((c: any) => ({ nome: c.pessoas?.nome ?? null, cargo: c.cargo ?? null, principal: !!c.is_primary })),
        ultimo_historico: h ? (h.resumo ?? h.resumo_execucao ?? null) : null,
        pontos_instalados: kind === "cliente" ? (pontos as any)?.count ?? 0 : null,
        proxima_visita: prox ? { data: (prox as any).scheduled_date, horario: String((prox as any).start_time ?? "").slice(0, 5), codigo: visitCode((prox as any).id) } : null,
        link: feraLink(kind === "cliente" ? `/clientes?id=${row.id}` : `/leads?id=${row.id}`), id: row.id };
    };
    const out = [...await Promise.all((Array.isArray(clients) ? clients : []).map((c) => resumo("cliente", c))),
      ...await Promise.all((Array.isArray(leads) ? leads : []).map((l) => resumo("lead", l)))];
    return ok({ resultados: out, encontrados: out.length });
  }, params);
}

function cnpjValidoMcp(v: unknown): boolean {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

async function criarLeadEquipe(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const empresa = productSearchText(params.empresa);
    const cidade = productSearchText(params.cidade);
    const contato = productSearchText(params.contato_nome);
    if (!empresa || !cidade || !contato) return fail("Informe empresa, cidade e o nome de pelo menos 1 contato");
    const cnpj = params.cnpj ? String(params.cnpj).replace(/\D/g, "") : null;
    if (cnpj && !cnpjValidoMcp(cnpj)) return fail("CNPJ inválido: confira os dígitos");
    const tel = digits(params.contato_telefone);
    let pessoaId: string | null = null;
    if (tel && tel.length >= 10) {
      const { data: found } = await supabase.from("pessoas").select("id").eq("organization_id", NITSCLEAN_ORG_ID).in("whatsapp", phoneVariants(tel)).limit(1).maybeSingle();
      pessoaId = (found as any)?.id ?? null;
    }
    if (!pessoaId) {
      const { data: p, error: pe } = await supabase.from("pessoas").insert({ organization_id: NITSCLEAN_ORG_ID, nome: contato, whatsapp: tel && tel.length >= 10 ? tel : null })
        .select("id").single();
      if (pe) return fail(dbFail("criar contato", pe));
      pessoaId = (p as any).id;
    }
    const { data: lead, error } = await supabase.from("leads").insert({ organization_id: NITSCLEAN_ORG_ID, title: empresa, empresa_nome: empresa, company: empresa,
      city: cidade, endereco: productSearchText(params.endereco) || null, cnpj, pessoa_id: pessoaId, cargo_contato: productSearchText(params.cargo) || null,
      contact_name: contato, contact_phone: tel, stage: "novo", source: "flora_equipe", created_by: u.user_id, assigned_to: u.user_id })
      .select("id").single();
    if (error) return fail(dbFail("criar lead", error));
    return ok({ lead_id: (lead as any).id, link: feraLink(`/leads?id=${(lead as any).id}`) }, `Lead ${empresa} criado`);
  }, params, isField);
}

const TEAM_TYPES = ["visita_comercial", "visita_tecnica", "entrega", "manutencao"];
const TEAM_OPS: Record<string, string[]> = { manutencao: ["manutencao_reposicao", "substituicao"], entrega: ["entrega", "instalacao_definitiva"],
  visita_tecnica: ["instalacao_teste", "instalacao_definitiva", "substituicao"], visita_comercial: [] };

async function agendarVisitaEquipe(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const tipo = String(params.tipo ?? "");
    const date = validDate(params.data);
    const hora = typeof params.horario === "string" && /^\d{2}:\d{2}$/.test(params.horario) ? params.horario : null;
    if (!TEAM_TYPES.includes(tipo)) return fail("tipo deve ser visita_comercial, visita_tecnica, entrega ou manutencao");
    if (!date || !hora) return fail("Informe data (AAAA-MM-DD) e horario (HH:MM)");
    if (date < spToday()) return fail("Data no passado");
    // Vendedor (without a technical role) books only commercial visits.
    if (tipo !== "visita_comercial" && !isPrivileged(u) && !hasRole(u, "consultor_tecnico", "operacional")) return fail("Seu perfil agenda só visita comercial");
    const clientId = typeof params.client_id === "string" ? params.client_id : null;
    const leadId = typeof params.lead_id === "string" ? params.lead_id : null;
    if (tipo !== "visita_comercial" && !clientId) return fail("Manutenção, entrega e visita técnica exigem um cliente (client_id)");
    if (!clientId && !leadId) return fail("Informe client_id ou lead_id (use consultar_cliente_ou_lead)");
    const target = clientId
      ? await supabase.from("clients").select("id, name, company, address, city, zip_code, latitude, longitude, document, created_by, assigned_user_id").eq("id", clientId).eq("organization_id", NITSCLEAN_ORG_ID).maybeSingle()
      : await supabase.from("leads").select("id, empresa_nome, company, title, endereco, city, zip_code, latitude, longitude, cnpj, created_by, assigned_to").eq("id", leadId!).eq("organization_id", NITSCLEAN_ORG_ID).maybeSingle();
    const t: any = target.data;
    if (!t) return fail("Cliente/lead não encontrado");
    if (!seesAll(u) && t.created_by !== u.user_id && (clientId ? t.assigned_user_id : t.assigned_to) !== u.user_id) return NAO_AUTORIZADO;
    const operacao = typeof params.operacao_material === "string" && params.operacao_material ? params.operacao_material : null;
    if (operacao && !(TEAM_OPS[tipo] ?? []).includes(operacao)) return fail("operacao_material não combina com o tipo de visita");
    const itens = Array.isArray(params.itens) ? (params.itens as any[]).slice(0, 30).map((i) => ({ descricao: productSearchText(i?.descricao).slice(0, 150),
      quantidade: String(i?.quantidade ?? "1").replace(/\D/g, "") || "1", product_id: typeof i?.product_id === "string" ? i.product_id : null })).filter((i) => i.descricao) : [];
    if (operacao) {
      if (!cnpjValidoMcp(clientId ? t.document : t.cnpj)) return fail("A empresa precisa de CNPJ válido para emitir a nota: cadastre o CNPJ no Fera antes de agendar", "Abra o cadastro no link e informe o CNPJ");
      if (!itens.length) return fail("Informe os itens (descricao e quantidade) da operação");
    }
    const assignee = isPrivileged(u) && typeof params.consultor_id === "string" ? params.consultor_id : u.user_id;
    if (assignee !== u.user_id) {
      const { data: prof } = await supabase.from("profiles").select("user_id").eq("user_id", assignee).eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true).maybeSingle();
      if (!prof) return fail("Consultor inválido");
    }
    const holiday = await rejectHolidayVisit(supabase, date, t.city ?? undefined);
    if (holiday) return { success: false, message: holiday.message };
    const startMin = timeMinutes(hora);
    const { data: same } = await supabase.from("schedules").select("start_time, end_time").eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("assigned_to", assignee).eq("scheduled_date", date).in("status", ["agendado", "confirmado", "em_atendimento"]);
    const clash = (Array.isArray(same) ? same : []).some((s: any) => {
      const a = timeMinutes(String(s.start_time ?? "").slice(0, 5)); const b = s.end_time ? timeMinutes(String(s.end_time).slice(0, 5)) : a + 60;
      return startMin < b && a < startMin + 60;
    });
    if (clash) return fail("Já existe visita nesse horário para o consultor");
    if (googleClash(await googleBusy(supabase, date, date), date, startMin, 60)) return fail("Horário ocupado na agenda da Flora (Google)");
    const nome = clientId ? t.company || t.name : t.empresa_nome || t.company || t.title;
    const label = ({ visita_comercial: "Visita comercial", visita_tecnica: "Visita técnica", entrega: "Entrega", manutencao: "Manutenção" } as Record<string, string>)[tipo];
    const { data: created, error } = await supabase.from("schedules").insert({
      organization_id: NITSCLEAN_ORG_ID, title: `${label} — ${nome}`, schedule_type: tipo, scheduled_date: date, start_time: hora,
      end_time: fromMin(Math.min(startMin + 60, 23 * 60 + 59)), status: "agendado", client_id: clientId, lead_id: clientId ? null : leadId,
      location: [clientId ? t.address : t.endereco, t.city].filter(Boolean).join(", ") || null, zip_code: t.zip_code ?? null,
      latitude: t.latitude ?? null, longitude: t.longitude ?? null, assigned_to: assignee, created_by: u.user_id, source: "flora_equipe",
      operacao_material: operacao, itens, notes: productSearchText(params.observacao).slice(0, 500) || null,
    }).select("id").single();
    if (error) return fail(dbFail("agendar visita", error));
    const id = (created as any).id;
    return ok({ schedule_id: id, codigo: visitCode(id), link: feraLink(`/agenda?agendamento=${id}`), prontidao: operacao ? "pendente: nota e material" : "pronto" },
      `${label} agendada para ${date.split("-").reverse().join("/")} às ${hora}`);
  }, params, isField);
}

async function visitaEmAndamento(supabase: ReturnType<typeof getClient>, u: TeamUser): Promise<ScheduleRow | null> {
  const { data } = await supabase.from("schedules").select("id, organization_id, lead_id, client_id, latitude, longitude, title, notes, clients(name, latitude, longitude), leads(latitude, longitude, pessoa_id)")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("assigned_to", u.user_id).eq("status", "em_atendimento").order("checkin_em", { ascending: false }).limit(1).maybeSingle();
  return (data as ScheduleRow | null) ?? null;
}

async function registrarLocalizacaoCheckin(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const lat = Number(params.latitude), lng = Number(params.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail("Localização inválida");
    const s = await visitaEmAndamento(supabase, u);
    if (!s) return fail("Você não tem visita em andamento. Inicie a visita no Fera primeiro.", "Abra o Fera em Hoje e toque em Iniciar");
    const dest = s.latitude != null ? [s.latitude, s.longitude] : s.clients?.latitude != null ? [s.clients.latitude, s.clients.longitude]
      : s.leads?.latitude != null ? [s.leads.latitude, s.leads.longitude] : null;
    const { data: org } = await supabase.from("organizations").select("raio_checkin_m").eq("id", NITSCLEAN_ORG_ID).maybeSingle();
    const raio = Number((org as any)?.raio_checkin_m ?? 300) || 300;
    let distancia: number | null = null;
    if (dest) {
      const r = 6_371_000, rad = (d: number) => d * Math.PI / 180;
      const a = Math.sin(rad(dest[0] - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(dest[0])) * Math.sin(rad(dest[1] - lng) / 2) ** 2;
      distancia = Math.round(2 * r * Math.asin(Math.sqrt(a)));
    }
    const { error } = await supabase.from("schedule_checkins").update({ latitude: lat, longitude: lng, distancia_m: distancia,
      fora_do_raio: distancia !== null && distancia > raio, destino_sem_coordenadas: !dest, sem_permissao: false,
      localizacao_origem: "whatsapp", localizacao_whatsapp_em: new Date().toISOString() }).eq("schedule_id", s.id).eq("user_id", u.user_id);
    if (error) return fail(dbFail("registrar localização", error));
    return ok({ codigo: visitCode(s.id), distancia_m: distancia, fora_do_raio: distancia !== null && distancia > raio, destino_sem_coordenadas: !dest,
      link: feraLink(`/agenda?agendamento=${s.id}`) }, distancia !== null ? `Localização registrada: ${distancia} m do cliente` : "Localização registrada (cliente sem coordenadas)");
  }, params, isField);
}

/** Stateless confirmation code: HMAC over user + visit + text + expiry, keyed by the MCP secret. */
async function noteCode(userId: string, scheduleId: string, texto: string, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(MCP_BEARER_TOKEN || "fera"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}|${scheduleId}|${texto}|${exp}`)));
  return `${exp.toString(36)}.${Array.from(sig.slice(0, 9)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function registrarNotaVisita(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const texto = productSearchText(params.texto).replace(/\s+/g, " ").trim().slice(0, 1000);
    if (texto.length < 3) return fail("Envie o texto da nota (transcrição do áudio)");
    const s = await visitaEmAndamento(supabase, u);
    if (!s) return visitaRelatada(u, supabase, params, texto, "nota");
    const proximo = productSearchText(params.proximo_passo).slice(0, 200) || null;
    const payload = `${texto}|${proximo ?? ""}`;
    if (params.confirmar !== true) {
      const exp = Date.now() + 10 * 60_000;
      const codigo = await noteCode(u.user_id, s.id, payload, exp);
      return ok({ precisa_confirmacao: true, codigo_confirmacao: codigo, visita: visitCode(s.id), resumo: texto, proximo_passo: proximo,
        mensagem_para_usuario: `Entendi: "${texto}"${proximo ? ` · Próximo passo: ${proximo}` : ""}. Confirma?` },
        undefined, "Só grave depois do 'sim': chame de novo com confirmar=true, o mesmo texto/proximo_passo e codigo_confirmacao");
    }
    const code = String(params.codigo_confirmacao ?? "");
    const exp = parseInt(code.split(".")[0] ?? "", 36);
    if (!Number.isFinite(exp) || exp < Date.now() || code !== await noteCode(u.user_id, s.id, payload, exp)) {
      return fail("Confirmação expirada ou texto diferente: mostre o resumo de novo e peça confirmação");
    }
    const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const nota = `[WhatsApp ${stamp}] ${texto}${proximo ? ` — Próximo passo: ${proximo}` : ""}`;
    const { error } = await supabase.from("schedules").update({ notes: [s.notes, nota].filter(Boolean).join("\n").slice(-4000) }).eq("id", s.id);
    if (error) return fail(dbFail("gravar nota da visita", error));
    if (s.lead_id) {
      const bg = supabase.from("lead_timeline").insert({ organization_id: NITSCLEAN_ORG_ID, lead_id: s.lead_id, pessoa_id: s.leads?.pessoa_id ?? null,
        tipo: "visita", origem: "fera", resumo: `Nota do consultor (WhatsApp): ${texto}`.slice(0, 500), proximo_passo: proximo, referencia_id: s.id });
      (globalThis as any).EdgeRuntime?.waitUntil?.(Promise.resolve(bg).then(() => undefined, () => undefined));
    }
    return ok({ gravado: true, visita: visitCode(s.id), link: feraLink(`/agenda?agendamento=${s.id}`) }, "Nota gravada na visita");
  }, params, isField);
}

async function loadAtendimento(supabase: ReturnType<typeof getClient>, u: TeamUser, params: Record<string, unknown>) {
  const raw = String(params.atendimento_id ?? params.codigo ?? "").replace(/^#?A-/i, "").trim().toLowerCase();
  if (!/^[0-9a-f-]{8,36}$/.test(raw)) return null;
  let q = supabase.from("atendimentos").select("id, status, responsavel_id, assumido_por, empresa, lead_id").eq("organization_id", NITSCLEAN_ORG_ID)
    .in("status", ["aberto", "em_atendimento"]).limit(50);
  if (!isPrivileged(u)) q = q.or(`responsavel_id.eq.${u.user_id},assumido_por.eq.${u.user_id},responsavel_id.is.null`);
  const { data } = await q;
  return (Array.isArray(data) ? data : []).find((a: any) => String(a.id).startsWith(raw)) ?? null;
}

async function assumirAtendimento(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const a: any = await loadAtendimento(supabase, u, params);
    if (!a) return fail("Atendimento não encontrado ou sem permissão");
    const { error } = await supabase.from("atendimentos").update({ status: "em_atendimento", assumido_por: u.user_id, assumido_em: new Date().toISOString() }).eq("id", a.id);
    if (error) return fail(dbFail("assumir atendimento", error));
    return ok({ codigo: `#A-${String(a.id).slice(0, 8)}`, link: feraLink(`/atendimentos?id=${a.id}`) }, `Você assumiu o atendimento de ${a.empresa ?? "cliente"}`);
  }, params, isField);
}

const RESULTADOS_ATENDIMENTO = ["virou_agendamento", "virou_proposta", "duvida_resolvida", "perdido", "outro"];
async function resolverAtendimento(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const resolucao = productSearchText(params.resolucao).slice(0, 500);
    const resultado = String(params.resultado ?? "");
    if (resolucao.length < 3 || !RESULTADOS_ATENDIMENTO.includes(resultado)) return fail(`Informe resolucao e resultado (${RESULTADOS_ATENDIMENTO.join(", ")})`);
    const a: any = await loadAtendimento(supabase, u, params);
    if (!a) return fail("Atendimento não encontrado ou sem permissão");
    const { error } = await supabase.from("atendimentos").update({ status: "resolvido", resolucao, resultado, resolvido_por: u.user_id,
      assumido_por: a.assumido_por ?? u.user_id }).eq("id", a.id);
    if (error) return fail(dbFail("resolver atendimento", error));
    return ok({ codigo: `#A-${String(a.id).slice(0, 8)}`, link: feraLink(`/atendimentos?id=${a.id}`) }, "Atendimento resolvido");
  }, params, isField);
}

/** Resolves an alert code (#V-…, #T-…, #A-…) sent to THIS user's chat in the last 7 days. */
async function contextoAviso(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const codigo = String(params.codigo ?? "").trim().toUpperCase().replace(/^(OC|[VTA])-/, "#$1-");
    if (!/^#([VTA]-[0-9A-F]{1,8}|OC-\d{6})$/i.test(codigo)) return fail("Código inválido (ex.: #OC-000123)");
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data } = await supabase.from("notification_logs").select("event_type, payload, sent_at, queued_at").eq("organization_id", NITSCLEAN_ORG_ID)
      .in("destination", u.phones).or(`sent_at.gte.${since},queued_at.gte.${since}`).limit(50);
    const log: any = (Array.isArray(data) ? data : []).find((l: any) => String(l.payload?.codigo ?? "").toUpperCase() === codigo);
    if (!log) return fail("Não achei esse aviso entre os seus últimos avisos");
    const p = log.payload ?? {};
    let visita: unknown = null;
    if (typeof p.schedule_id === "string") {
      const { data: s } = await supabase.from("schedules").select(SCHEDULE_FIELDS).eq("id", p.schedule_id).eq("organization_id", NITSCLEAN_ORG_ID).maybeSingle();
      if (s && (seesAll(u) || (s as any).assigned_to === u.user_id)) visita = { ...visitSummary(s), data: (s as any).scheduled_date, schedule_id: (s as any).id };
    }
    return ok({ codigo, evento: log.event_type, enviado_em: log.sent_at ?? log.queued_at, visita,
      acoes_possiveis: log.event_type === "prontidao_pendente" ? ["marcar_material_separado"] : String(log.event_type ?? "").startsWith("tarefa_nota") ? ["abrir /tarefas no Fera"] : [] });
  }, params);
}

async function marcarMaterialSeparado(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const raw = String(params.schedule_id ?? params.codigo ?? "").replace(/^#?V-/i, "").trim().toLowerCase();
    if (!/^[0-9a-f-]{8,36}$/.test(raw)) return fail("Informe o código da visita (#V-…)");
    let q = supabase.from("schedules").select("id, assigned_to, exige_material, material_status, scheduled_date").eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("exige_material", true).in("status", ["agendado", "confirmado", "em_atendimento"]).gte("scheduled_date", spToday()).limit(100);
    if (!isPrivileged(u) && !hasRole(u, "operacional")) q = q.eq("assigned_to", u.user_id);
    const { data } = await q;
    const s: any = (Array.isArray(data) ? data : []).find((r: any) => String(r.id).startsWith(raw));
    if (!s) return fail("Visita não encontrada ou sem permissão");
    const { error } = await supabase.from("schedules").update({ material_status: "separado", material_separado_em: new Date().toISOString(), material_separado_por: u.user_id }).eq("id", s.id);
    if (error) return fail(dbFail("marcar material separado", error));
    return ok({ codigo: visitCode(s.id), link: feraLink(`/agenda?agendamento=${s.id}`) }, "Material marcado como separado");
  }, params, isField);
}

// ─── Lote 15: audio/text collection of an occurrence (#OC-…) ───────────────────
/** The user's occurrence: by #OC code (own, or any for managers), else the visit in progress, else the latest one with pending information. */
async function ocorrenciaDoUsuario(supabase: ReturnType<typeof getClient>, u: TeamUser, codigo: unknown): Promise<ScheduleRow | null> {
  const fields = "id, ocorrencia_codigo, ocorrencia_tipo, status, assigned_to, coleta_status, coleta_rascunho, coleta_pendencias, coleta_processada_em, title, clients(name), leads(empresa_nome, company)";
  const m = String(codigo ?? "").toUpperCase().match(/OC-?(\d{1,6})/);
  if (m) {
    const { data } = await supabase.from("schedules").select(fields).eq("organization_id", NITSCLEAN_ORG_ID).eq("ocorrencia_numero", Number(m[1])).maybeSingle();
    return data && (isPrivileged(u) || (data as ScheduleRow).assigned_to === u.user_id) ? data as ScheduleRow : null;
  }
  const { data: andamento } = await supabase.from("schedules").select(fields).eq("organization_id", NITSCLEAN_ORG_ID).eq("assigned_to", u.user_id)
    .eq("status", "em_atendimento").order("checkin_em", { ascending: false }).limit(1).maybeSingle();
  if (andamento) return andamento as ScheduleRow;
  const { data: pend } = await supabase.from("schedules").select(fields).eq("organization_id", NITSCLEAN_ORG_ID).eq("assigned_to", u.user_id)
    .eq("coleta_status", "pendente").order("scheduled_date", { ascending: false }).limit(1).maybeSingle();
  return (pend as ScheduleRow | null) ?? null;
}
function nomeOcorrencia(s: ScheduleRow): string { return s.clients?.name || s.leads?.empresa_nome || s.leads?.company || s.title || ""; }

async function chamarColeta(userId: string, id: string, action: string, extra: Record<string, unknown> = {}): Promise<{ status: number; body: any }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/coleta-ocorrencia`, { method: "POST", signal: AbortSignal.timeout(110000),
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "x-acting-user": userId, "Content-Type": "application/json" }, body: JSON.stringify({ id, action, ...extra }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch { return { status: 502, body: { error: "Não foi possível processar a coleta agora" } }; }
}

// ─── Visit not scheduled: the seller reports it on WhatsApp (anexar_coleta / registrar_nota without an open visit) ───
const MSG_SEM_VISITA = "Não achei visita sua aberta.";
/** Covered city named inside free text ("visitei o Bar do Zé em Búzios"), using the area cities + aliases. */
function cidadeNoTexto(texto: string, areas: Array<{ city?: string | null }>): string | null {
  const t = ` ${foldPlace(texto)} `;
  const cand = new Set<string>();
  for (const a of areas) for (const k of cityKeys(a.city)) cand.add(k);
  for (const [alias] of Object.entries(CITY_ALIASES)) if (alias.length >= 5) cand.add(alias);
  return [...cand].sort((a, b) => b.length - a.length).find((c) => t.includes(` ${c} `)) ?? null;
}
/** Same company already in the Fera: client by name+city, else an open (not converted, not lost) lead by name+city. */
async function empresaExistente(supabase: ReturnType<typeof getClient>, empresa: string, cidade: string) {
  const alvo = normalizedEstablishment(empresa);
  const { data: cl } = await supabase.from("clients").select("id, name, company, city, address, zip_code, latitude, longitude").eq("organization_id", NITSCLEAN_ORG_ID).limit(2000);
  const cliente = (Array.isArray(cl) ? cl : []).find((c: any) => [c.name, c.company].some((n) => normalizedEstablishment(n) === alvo) && sameCity(c.city, cidade));
  if (cliente) return { tipo: "cliente" as const, row: cliente as any };
  const { data: ls } = await supabase.from("leads").select("id, empresa_nome, company, title, city, client_id, stage, endereco, zip_code, latitude, longitude, pessoa_id, stage_id").eq("organization_id", NITSCLEAN_ORG_ID).limit(3000);
  const lead = (Array.isArray(ls) ? ls : []).find((l: any) => [l.empresa_nome, l.company, l.title].some((n) => normalizedEstablishment(n) === alvo)
    && sameCity(l.city, cidade) && !l.client_id && !["fechado_perdido", "fechado_ganho"].includes(l.stage));
  return lead ? { tipo: "lead" as const, row: lead as any } : null;
}

/** No open visit: offer to register it (codigo_confirmacao); with confirmar=true + code, create/reuse the lead and a done 1st commercial visit. */
async function visitaRelatada(u: TeamUser, supabase: ReturnType<typeof getClient>, params: Record<string, unknown>, texto: string, modo: "coleta" | "nota"): Promise<McpResponse> {
  const empresa = (productSearchText(params.empresa) ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
  const { data: areasRaw } = await supabase.from("ekkoa_coverage_areas").select("name, city").eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true);
  const areas = (Array.isArray(areasRaw) ? areasRaw : []) as Array<{ name: string; city: string | null }>;
  const cidadeDita = (productSearchText(params.cidade) ?? "").trim().slice(0, 120) || cidadeNoTexto(texto, areas) || "";
  const pedir = (msg: string, faltam: string[]) => ({ success: false, message: msg, data: { sem_visita_aberta: true, faltam, mensagem_para_equipe: msg } });
  if (!empresa) return pedir(`${MSG_SEM_VISITA} Para eu registrar a visita, me diga o nome do estabelecimento e a cidade.`, cidadeDita ? ["empresa"] : ["empresa", "cidade"]);
  if (!cidadeDita) return pedir(`${MSG_SEM_VISITA} Em qual cidade fica ${empresa}?`, ["cidade"]);
  // Same coverage rule as the client flow: only DISTRIBUIDORA cities get a visit.
  const cob = await verificarCoberturaRegiao({ cidade: cidadeDita });
  const cd: any = cob.data ?? {};
  if (!cob.success || cd.vinculo !== "DISTRIBUIDORA") {
    const msg = cd.precisa_confirmar ? `${MSG_SEM_VISITA} Não reconheci a cidade "${cidadeDita}". Qual a cidade (ou o CEP) de ${empresa}?`
      : `${MSG_SEM_VISITA} ${cidadeDita} fica fora da área atendida pela NitsClean${cd.vinculo === "MATRIZ" ? " (atendida pela Matriz)" : ""}, então não registrei a visita.`;
    return { success: false, message: msg, data: { sem_visita_aberta: true, vinculo: cd.vinculo ?? null, mensagem_para_equipe: msg } };
  }
  const cobs: any[] = Array.isArray(cd.cobertura) ? cd.cobertura : [];
  const area = cobs.find((c) => cityInArea(cidadeDita, c.cidade, true)) ?? cobs[0] ?? null;
  const cidade = area?.cidade ?? cidadeDita;
  const assinatura = `relatar|${modo}|${normalizedEstablishment(empresa)}|${normalizedEstablishment(cidade)}|${texto}`;
  if (params.confirmar !== true) {
    const exp = Date.now() + 15 * 60_000;
    const codigo = await noteCode(u.user_id, "relatar", assinatura, exp);
    const existente = await empresaExistente(supabase, empresa, cidade);
    const msg = `${MSG_SEM_VISITA} Quer que eu registre a visita a ${empresa} agora?`;
    return ok({ sem_visita_aberta: true, registrar_visita: true, precisa_confirmacao: true, codigo_confirmacao: codigo, empresa, cidade,
      cadastro_existente: existente?.tipo ?? null, mensagem_para_usuario: msg, mensagem_para_equipe: msg }, msg,
      "Só registre depois do 'sim': chame de novo a mesma acao com confirmar=true, o MESMO texto, empresa e cidade e o codigo_confirmacao");
  }
  const code = String(params.codigo_confirmacao ?? "");
  const exp = parseInt(code.split(".")[0] ?? "", 36);
  if (!Number.isFinite(exp) || exp < Date.now() || code !== await noteCode(u.user_id, "relatar", assinatura, exp)) {
    return fail("Confirmação expirada ou dados diferentes: pergunte de novo se registro a visita");
  }
  const existente = await empresaExistente(supabase, empresa, cidade);
  let leadId: string | null = existente?.tipo === "lead" ? existente.row.id : null;
  const clientId: string | null = existente?.tipo === "cliente" ? existente.row.id : null;
  let pessoaId: string | null = existente?.tipo === "lead" ? existente.row.pessoa_id ?? null : null;
  const { data: etapa } = await supabase.from("lead_stages").select("id").eq("organization_id", NITSCLEAN_ORG_ID).eq("chave", "visita_realizada").maybeSingle();
  if (!existente) {
    const contato = productSearchText(params.contato_nome);
    const tel = digits(params.contato_telefone);
    if (contato) {
      const { data: p } = await supabase.from("pessoas").insert({ organization_id: NITSCLEAN_ORG_ID, nome: contato, whatsapp: tel && tel.length >= 10 ? tel : null }).select("id").single();
      pessoaId = (p as any)?.id ?? null;
    }
    const { data: lead, error } = await supabase.from("leads").insert({ organization_id: NITSCLEAN_ORG_ID, title: empresa, empresa_nome: empresa, company: empresa, city: cidade,
      regiao: area?.regiao ?? null, vinculo: "DISTRIBUIDORA", pessoa_id: pessoaId, contact_name: contato || null, contact_phone: tel, source: "flora_equipe",
      stage_id: (etapa as any)?.id ?? null, created_by: u.user_id, assigned_to: u.user_id }).select("id").single();
    if (error) return fail(dbFail("criar lead da visita relatada", error));
    leadId = (lead as any).id;
  } else if (leadId && (etapa as any)?.id) {
    // Novo / Qualificado / Visita agendada move forward to "Visita realizada"; later stages stay.
    const { data: atual } = await supabase.from("lead_stages").select("chave").eq("id", existente.row.stage_id ?? "").maybeSingle();
    if (!atual || ["novo", "qualificado", "visita_agendada"].includes((atual as any).chave)) {
      await supabase.from("leads").update({ stage_id: (etapa as any).id }).eq("id", leadId).eq("organization_id", NITSCLEAN_ORG_ID);
    }
  }
  const row: any = existente?.row ?? {};
  const hora = new Date().toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const { data: created, error: se } = await supabase.from("schedules").insert({ organization_id: NITSCLEAN_ORG_ID, title: `Visita comercial — ${row.name || row.empresa_nome || empresa}`,
    schedule_type: "visita_comercial", schedule_subtype: "PROSPECCAO", ocorrencia_tipo: "primeira_visita", scheduled_date: spToday(), start_time: hora, end_time: hora,
    status: "concluido", lead_id: clientId ? null : leadId, client_id: clientId, assigned_to: u.user_id, created_by: u.user_id, source: "flora_relatada",
    confirmacao_status: "nao_aplicavel", location: [row.address ?? row.endereco, cidade].filter(Boolean).join(", ") || cidade, zip_code: row.zip_code ?? null,
    latitude: row.latitude ?? null, longitude: row.longitude ?? null, coleta_status: "coletando",
    resumo_execucao: "Visita relatada pela Flora (sem check-in GPS)", notes: modo === "nota" ? `[WhatsApp ${stamp}] ${texto}`.slice(0, 4000) : null })
    .select("id, ocorrencia_codigo").single();
  if (se) return fail(dbFail("registrar visita relatada", se));
  const id = (created as any).id as string;
  const { data: sc } = await supabase.from("schedules").select("ocorrencia_codigo").eq("id", id).maybeSingle();
  const oc = (sc as any)?.ocorrencia_codigo ?? (created as any).ocorrencia_codigo ?? null;
  const { error: ee } = await supabase.from("schedule_evidencias").insert({ organization_id: NITSCLEAN_ORG_ID, schedule_id: id, tipo: "texto", origem: "flora",
    observacoes: texto, transcricao: texto, autor_id: u.user_id, itens: [] });
  if (ee) return fail(dbFail("anexar texto à visita relatada", ee));
  if (leadId) {
    const bg = supabase.from("lead_timeline").insert({ organization_id: NITSCLEAN_ORG_ID, lead_id: leadId, pessoa_id: pessoaId, tipo: "visita", origem: "fera",
      resumo: `Visita relatada pela Flora (sem check-in): ${texto}`.slice(0, 500), referencia_id: id });
    (globalThis as any).EdgeRuntime?.waitUntil?.(Promise.resolve(bg).then(() => undefined, () => undefined));
  }
  // What is still missing: the collection draft from the text (same rules as the app).
  const r = await chamarColeta(u.user_id, id, "concluir");
  const pendencias: string[] = r.status === 200 ? r.body.pendencias ?? [] : [];
  const ocTxt = oc ? `#${oc}` : visitCode(id);
  const msg = `Registrei a visita a ${row.name || row.empresa_nome || empresa} como ${ocTxt} (relatada pela Flora, sem check-in).`
    + (r.status !== 200 ? " Não consegui gerar o rascunho agora: peça a lista do que falta daqui a pouco."
      : pendencias.length ? `\nFalta:\n- ${pendencias.slice(0, 12).join("\n- ")}` : " Nada pendente: posso confirmar a coleta.");
  return ok({ registrada: true, ocorrencia: ocTxt, schedule_id: id, empresa: row.name || row.empresa_nome || empresa, cidade, lead_id: leadId, client_id: clientId,
    lead_criado: !existente, origem: "relatada_flora", sem_checkin: true, resumo: r.body?.resumo ?? null, pendencias,
    link: feraLink(`/agenda?agendamento=${id}`), mensagem_para_equipe: msg.length > 1200 ? `${msg.slice(0, 1197)}...` : msg }, msg,
    pendencias.length ? "Pergunte ao vendedor cada pendência e anexe as respostas com anexar_coleta (codigo = a ocorrência)" : "Chame confirmar_coleta para confirmar");
}

async function anexarColetaOcorrencia(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const texto = productSearchText(params.texto).replace(/\s+/g, " ").trim().slice(0, 4000);
    if (texto.length < 3) return fail("Envie o texto ou a transcrição do áudio");
    const s = await ocorrenciaDoUsuario(supabase, u, params.codigo);
    if (!s && params.codigo) return fail("Não achei ocorrência aberta sua com esse código.", "Confira o código #OC-…");
    if (!s) return visitaRelatada(u, supabase, params, texto, "coleta");
    if (s.coleta_status === "confirmada") return fail(`A coleta da #${s.ocorrencia_codigo} já foi confirmada`);
    if (!(s.status === "em_atendimento" || s.status === "concluido")) return fail("Inicie o atendimento no Fera antes de anexar");
    const { error } = await supabase.from("schedule_evidencias").insert({ organization_id: NITSCLEAN_ORG_ID, schedule_id: s.id, tipo: "texto", origem: "flora",
      observacoes: texto, transcricao: texto, autor_id: u.user_id, itens: [] });
    if (error) return fail(dbFail("anexar à ocorrência", error));
    if (!s.coleta_status) await supabase.from("schedules").update({ coleta_status: "coletando" }).eq("id", s.id).is("coleta_status", null);
    return ok({ ocorrencia: `#${s.ocorrencia_codigo}`, cliente: nomeOcorrencia(s), anexado: true, pendencias_anteriores: s.coleta_pendencias ?? [] },
      `Anexado à #${s.ocorrencia_codigo}`, "Quando o vendedor terminar de falar, chame confirmar_coleta_ocorrencia (sem confirmar) para gerar o rascunho e a lista do que falta");
  }, params, isField);
}

async function pendenciasOcorrencia(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const s = await ocorrenciaDoUsuario(supabase, u, params.codigo);
    if (!s) return fail("Não achei ocorrência sua com esse código");
    const r = await chamarColeta(u.user_id, s.id, "pendencias");
    if (r.status !== 200) return fail(r.body?.error ?? "Não foi possível consultar");
    return ok({ ocorrencia: `#${s.ocorrencia_codigo}`, cliente: nomeOcorrencia(s), situacao: r.body.status ?? "sem coleta", resumo: r.body.resumo, pendencias: r.body.pendencias ?? [] });
  }, params, isField);
}

async function confirmarColetaOcorrencia(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const s = await ocorrenciaDoUsuario(supabase, u, params.codigo);
    if (!s) return fail("Não achei ocorrência sua com esse código");
    if (s.coleta_status === "confirmada") return fail(`A coleta da #${s.ocorrencia_codigo} já foi confirmada`);
    if (params.confirmar !== true) {
      const r = await chamarColeta(u.user_id, s.id, "concluir");
      if (r.status !== 200) return fail(r.body?.error ?? "Não foi possível gerar o rascunho");
      const pend: string[] = r.body.pendencias ?? [];
      if (pend.length) return ok({ ocorrencia: `#${s.ocorrencia_codigo}`, resumo: r.body.resumo, pendencias: pend, pode_confirmar: false },
        "Rascunho gerado com pendências", "Pergunte ao vendedor cada pendência, anexe as respostas com anexar_coleta_ocorrencia e gere o rascunho de novo");
      const exp = Date.now() + 15 * 60_000;
      const codigo = await noteCode(u.user_id, s.id, `coleta|${r.body.resumo}`, exp);
      return ok({ ocorrencia: `#${s.ocorrencia_codigo}`, resumo: r.body.resumo, pendencias: [], pode_confirmar: true, codigo_confirmacao: codigo,
        mensagem_para_usuario: `Resumo da #${s.ocorrencia_codigo}: ${r.body.resumo}. Confirma?` }, undefined,
        "Só confirme depois do 'sim': chame de novo com confirmar=true e o codigo_confirmacao");
    }
    const code = String(params.codigo_confirmacao ?? "");
    const exp = parseInt(code.split(".")[0] ?? "", 36);
    const atual = await chamarColeta(u.user_id, s.id, "pendencias");
    if (!Number.isFinite(exp) || exp < Date.now() || code !== await noteCode(u.user_id, s.id, `coleta|${atual.body?.resumo ?? ""}`, exp)) {
      return fail("Confirmação expirada ou o rascunho mudou: gere o rascunho de novo e peça confirmação");
    }
    const r = await chamarColeta(u.user_id, s.id, "confirmar");
    if (r.status !== 200) return { success: false, message: r.body?.error ?? "Não foi possível confirmar", data: { pendencias: r.body?.pendencias ?? [] } };
    return ok({ ocorrencia: `#${s.ocorrencia_codigo}`, confirmada: true, pontos_previstos: r.body.pontos_previstos, novos_agendamentos: (r.body.agendamentos ?? []).map((c: string) => `#${c}`),
      pendencias_agendar: r.body.pendencias_agendar ?? [], link: feraLink(`/agenda?agendamento=${s.id}`) },
      `Coleta da #${s.ocorrencia_codigo} confirmada${(r.body.pendencias_agendar ?? []).length ? `. Sem horário livre na rota: ${(r.body.pendencias_agendar as string[]).join("; ")} (ficou como pendência)` : ""}`);
  }, params, isField);
}


// ─── Indicadores (flora_equipe acao=indicadores): short role-based answers + optional PNG panorama ───
const FONT5X7: Record<string, number[]> = {
  "0": [0x3E, 0x51, 0x49, 0x45, 0x3E], "1": [0x00, 0x42, 0x7F, 0x40, 0x00], "2": [0x42, 0x61, 0x51, 0x49, 0x46], "3": [0x21, 0x41, 0x45, 0x4B, 0x31],
  "4": [0x18, 0x14, 0x12, 0x7F, 0x10], "5": [0x27, 0x45, 0x45, 0x45, 0x39], "6": [0x3C, 0x4A, 0x49, 0x49, 0x30], "7": [0x01, 0x71, 0x09, 0x05, 0x03],
  "8": [0x36, 0x49, 0x49, 0x49, 0x36], "9": [0x06, 0x49, 0x49, 0x29, 0x1E],
  A: [0x7E, 0x11, 0x11, 0x11, 0x7E], B: [0x7F, 0x49, 0x49, 0x49, 0x36], C: [0x3E, 0x41, 0x41, 0x41, 0x22], D: [0x7F, 0x41, 0x41, 0x22, 0x1C],
  E: [0x7F, 0x49, 0x49, 0x49, 0x41], F: [0x7F, 0x09, 0x09, 0x09, 0x01], G: [0x3E, 0x41, 0x49, 0x49, 0x7A], H: [0x7F, 0x08, 0x08, 0x08, 0x7F],
  I: [0x00, 0x41, 0x7F, 0x41, 0x00], J: [0x20, 0x40, 0x41, 0x3F, 0x01], K: [0x7F, 0x08, 0x14, 0x22, 0x41], L: [0x7F, 0x40, 0x40, 0x40, 0x40],
  M: [0x7F, 0x02, 0x0C, 0x02, 0x7F], N: [0x7F, 0x04, 0x08, 0x10, 0x7F], O: [0x3E, 0x41, 0x41, 0x41, 0x3E], P: [0x7F, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3E, 0x41, 0x51, 0x21, 0x5E], R: [0x7F, 0x09, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7F, 0x01, 0x01],
  U: [0x3F, 0x40, 0x40, 0x40, 0x3F], V: [0x1F, 0x20, 0x40, 0x20, 0x1F], W: [0x3F, 0x40, 0x38, 0x40, 0x3F], X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  ":": [0x00, 0x36, 0x36, 0x00, 0x00], "-": [0x08, 0x08, 0x08, 0x08, 0x08], ".": [0x00, 0x60, 0x60, 0x00, 0x00], "/": [0x20, 0x10, 0x08, 0x04, 0x02],
  "%": [0x23, 0x13, 0x08, 0x64, 0x62], "#": [0x14, 0x7F, 0x14, 0x7F, 0x14], "(": [0x00, 0x1C, 0x22, 0x41, 0x00], ")": [0x00, 0x41, 0x22, 0x1C, 0x00],
  ",": [0x00, 0x50, 0x30, 0x00, 0x00],
};
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf: Uint8Array): number { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** Plain bar chart PNG (title + labelled horizontal bars) rendered without any library. Returns null when compression is unavailable. */
async function graficoPng(titulo: string, barras: Array<{ rotulo: string; valor: number }>): Promise<Uint8Array | null> {
  const CS = (globalThis as any).CompressionStream;
  if (!CS) return null;
  const W = 800, rowH = 44, H = 90 + Math.max(1, barras.length) * rowH + 20;
  const px = new Uint8Array(W * H * 3);
  const fill = (x0: number, y0: number, w: number, h: number, rgb: number[]) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) { const i = (y * W + x) * 3; px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; }
  };
  const texto = (s: string, x: number, y: number, sc: number, rgb: number[]) => {
    const t = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    for (const ch of t) { const g = FONT5X7[ch]; if (g) g.forEach((col, cx) => { for (let cy = 0; cy < 7; cy++) if (col & (1 << cy)) fill(x + cx * sc, y + cy * sc, sc, sc, rgb); }); x += 6 * sc; }
  };
  fill(0, 0, W, H, [12, 12, 14]);
  texto(titulo.slice(0, 40), 24, 24, 4, [240, 240, 240]);
  fill(24, 64, W - 48, 2, [225, 29, 42]);
  const max = Math.max(1, ...barras.map((b) => b.valor));
  barras.forEach((b, i) => {
    const y = 84 + i * rowH;
    texto(b.rotulo.slice(0, 22), 24, y + 8, 2, [200, 200, 200]);
    const w = Math.round((b.valor / max) * 330);
    fill(310, y + 4, Math.max(w, 3), 24, [225, 29, 42]);
    texto(String(b.valor), 320 + Math.max(w, 3), y + 8, 2, [240, 240, 240]);
  });
  const raw = new Uint8Array(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (W * 3 + 1) + 1); }
  const zipped = new Uint8Array(await new Response(new Response(raw).body!.pipeThrough(new CS("deflate"))).arrayBuffer());
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length); out.set(new TextEncoder().encode(type), 4); out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out;
  };
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, W); dv.setUint32(4, H); ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zipped), chunk("IEND", new Uint8Array())];
  const png = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { png.set(p, o); o += p.length; }
  return png;
}

const REPORT_BUCKET = "team-reports";
/** Uploads the PNG privately, signs it for 1h and sends it to the chat through the same GPT Maker send-message used for product images. */
async function enviarImagemEquipe(supabase: ReturnType<typeof getClient>, chatId: string, png: Uint8Array, legenda: string): Promise<boolean> {
  try {
    if (!GPTMAKER_API_TOKEN) return false;
    const path = `${NITSCLEAN_ORG_ID}/${spToday()}/${crypto.randomUUID()}.png`;
    const { error } = await supabase.storage.from(REPORT_BUCKET).upload(path, png, { contentType: "image/png", upsert: false });
    if (error) { console.warn("[mcp] report upload failed"); return false; }
    const { data: signed } = await supabase.storage.from(REPORT_BUCKET).createSignedUrl(path, 3600);
    if (!signed?.signedUrl) return false;
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`https://api.gptmaker.ai/v2/chat/${encodeURIComponent(chatId)}/send-message`, {
        method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${GPTMAKER_API_TOKEN}` },
        body: JSON.stringify({ image: signed.signedUrl, message: legenda }),
      });
      if (!res.ok) console.warn("[mcp] report send failed", `HTTP_${res.status}`);
      return res.ok;
    } finally { clearTimeout(timer); }
  } catch (e) { console.warn("[mcp] report send failed", (e as Error)?.name === "AbortError" ? "TIMEOUT" : "NETWORK"); return false; }
}

function ehPanorama(texto: string): boolean { return /como estamos|panorama|funil|semana|semanal|resumo geral|vis[aã]o geral|dashboard|gr[aá]fico/i.test(texto); }
function visaoIndicadores(papeis: string[]): "gestor" | "faturamento" | "campo" {
  if (papeis.some((r) => PRIVILEGED_ROLES.includes(r))) return "gestor";
  if (papeis.includes("faturamento") && !papeis.some((r) => ["vendedor", "consultor_tecnico"].includes(r))) return "faturamento";
  return "campo";
}
const addDiasIso = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const arr = (v: unknown): any[] => Array.isArray(v) ? v : [];
const brDia = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

async function indicadores(params: Record<string, unknown>): Promise<McpResponse> {
  return withTeam(async (u, supabase) => {
    const texto = typeof params.texto === "string" ? params.texto : "";
    const hoje = spToday(), amanha = addDiasIso(hoje, 1);
    const semana = /semana/i.test(texto), desde = semana ? addDiasIso(hoje, -6) : hoje;
    const visao = visaoIndicadores(u.papeis);
    const org = NITSCLEAN_ORG_ID;
    const linhas: string[] = []; let barras: Array<{ rotulo: string; valor: number }> = []; let titulo = "";
    const amanhaSemNota = async (proprio: boolean) => {
      let q = supabase.from("schedules").select("id, ocorrencia_codigo, title, prontidao, nota_status, material_status").eq("organization_id", org)
        .eq("scheduled_date", amanha).in("status", ["agendado", "confirmado"]).neq("prontidao", "pronto");
      if (proprio) q = q.eq("assigned_to", u.user_id);
      return arr((await q.limit(50)).data);
    };
    if (visao === "gestor") {
      const [leadsNovos, leadsAbertos, stages, visitas, coletas, atend, atrasadas, semNota, propostas] = await Promise.all([
        supabase.from("leads").select("id").eq("organization_id", org).gte("created_at", `${desde}T03:00:00Z`).limit(1000),
        supabase.from("leads").select("stage_id").eq("organization_id", org).is("client_id", null).limit(5000),
        supabase.from("lead_stages").select("id, nome, ordem, tipo").eq("organization_id", org).eq("ativo", true).order("ordem"),
        supabase.from("schedules").select("status").eq("organization_id", org).gte("scheduled_date", desde).lte("scheduled_date", hoje).in("status", ["concluido", "nao_realizado"]).limit(2000),
        supabase.from("schedules").select("id").eq("organization_id", org).eq("coleta_status", "pendente").limit(500),
        supabase.from("atendimentos").select("status, aberto_em, assumido_em").eq("organization_id", org).gte("aberto_em", `${addDiasIso(hoje, -30)}T03:00:00Z`).limit(2000),
        supabase.from("schedules").select("id").eq("organization_id", org).eq("schedule_type", "manutencao").lt("scheduled_date", hoje).in("status", ["agendado", "confirmado"]).limit(500),
        amanhaSemNota(false),
        supabase.from("proposals").select("id").eq("organization_id", org).in("status", ["rascunho", "enviada"]).limit(1000),
      ]);
      const porEtapa = new Map<string, number>(); for (const l of arr(leadsAbertos.data)) porEtapa.set(l.stage_id, (porEtapa.get(l.stage_id) ?? 0) + 1);
      const etapas = arr(stages.data).filter((s: any) => !["ganho", "perdido", "cliente"].includes(s.tipo)).map((s: any) => ({ rotulo: s.nome, valor: porEtapa.get(s.id) ?? 0 }));
      const vs = arr(visitas.data), feitas = vs.filter((v) => v.status === "concluido").length;
      const at = arr(atend.data), abertos = at.filter((a) => ["aberto", "em_atendimento"].includes(a.status)).length;
      const tempos = at.filter((a) => a.assumido_em && a.aberto_em && a.assumido_em >= `${desde}`).map((a) => (Date.parse(a.assumido_em) - Date.parse(a.aberto_em)) / 60000).filter((m) => m >= 0);
      const tMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;
      const per = semana ? "na semana" : "hoje";
      titulo = semana ? "Fera - semana" : "Fera - hoje";
      linhas.push(`📊 ${semana ? "Semana" : "Hoje"}:`,
        `• Leads novos ${per}: ${arr(leadsNovos.data).length} — funil: ${etapas.map((e) => `${e.rotulo} ${e.valor}`).join(", ") || "sem etapas"} ${feraLink("/leads")}`,
        `• Visitas ${per}: ${feitas} feitas, ${vs.length - feitas} não realizadas ${feraLink("/agenda")}`,
        `• Ocorrências com informações pendentes: ${arr(coletas.data).length} ${feraLink("/hoje")}`,
        `• Atendimentos abertos: ${abertos}${tMedio !== null ? ` — resposta média ${tMedio} min` : ""} ${feraLink("/atendimentos")}`,
        `• Manutenções atrasadas: ${arr(atrasadas.data).length} ${feraLink("/manutencoes")}`,
        `• Amanhã sem nota/material: ${semNota.length} ${feraLink("/tarefas")}`,
        `• Propostas abertas: ${arr(propostas.data).length} ${feraLink("/propostas")}`);
      barras = /funil/i.test(texto) && etapas.length ? etapas : [
        { rotulo: "Leads novos", valor: arr(leadsNovos.data).length }, { rotulo: "Visitas feitas", valor: feitas },
        { rotulo: "Info pendente", valor: arr(coletas.data).length }, { rotulo: "Atend. abertos", valor: abertos },
        { rotulo: "Manut. atrasadas", valor: arr(atrasadas.data).length }, { rotulo: "Amanha sem nota", valor: semNota.length },
        { rotulo: "Propostas abertas", valor: arr(propostas.data).length }];
      if (/funil/i.test(texto)) titulo = "Funil de leads";
    } else if (visao === "faturamento") {
      const [{ data: tarefas }, semNota] = await Promise.all([
        supabase.from("tarefas_faturamento").select("acao, empresa_nome, prazo, tipo_nota").eq("organization_id", org).eq("status", "aberta").order("prazo").limit(100),
        amanhaSemNota(false),
      ]);
      const t = arr(tarefas), nome: Record<string, string> = { emitir: "Emitir", cancelar: "Cancelar", devolucao: "Devolução" };
      const fmtPrazo = (p: string | null) => p ? new Date(p).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "sem prazo";
      titulo = "Notas abertas";
      linhas.push(`🧾 Notas abertas: ${t.length} ${feraLink("/tarefas")}`);
      for (const a of ["emitir", "cancelar", "devolucao"]) {
        const g = t.filter((x) => x.acao === a); if (!g.length) continue;
        linhas.push(`• ${nome[a]} (${g.length}): ${g.slice(0, 4).map((x) => `${x.empresa_nome ?? "?"} até ${fmtPrazo(x.prazo)}`).join("; ")}${g.length > 4 ? "…" : ""}`);
      }
      linhas.push(`• Operações de amanhã sem nota: ${semNota.filter((s) => s.nota_status === "pendente").length}`);
      barras = ["emitir", "cancelar", "devolucao"].map((a) => ({ rotulo: nome[a], valor: t.filter((x) => x.acao === a).length }));
    } else {
      const [{ data: ag }, { data: pend }, { data: props }] = await Promise.all([
        supabase.from("schedules").select("id, ocorrencia_codigo, title, scheduled_date, start_time, itens, material_status, prontidao").eq("organization_id", org)
          .eq("assigned_to", u.user_id).in("scheduled_date", [hoje, amanha]).in("status", ["agendado", "confirmado", "em_atendimento"]).order("scheduled_date").order("start_time").limit(40),
        supabase.from("schedules").select("ocorrencia_codigo, title").eq("organization_id", org).eq("assigned_to", u.user_id).eq("coleta_status", "pendente").limit(20),
        supabase.from("proposals").select("title, status").eq("organization_id", org).in("status", ["rascunho", "enviada"]).or(`assigned_to.eq.${u.user_id},created_by.eq.${u.user_id}`).limit(20),
      ]);
      const vis = arr(ag), linha = (v: any) => `${String(v.start_time ?? "").slice(0, 5) || "--:--"} ${v.title}${v.ocorrencia_codigo ? ` #${v.ocorrencia_codigo}` : ""}`;
      titulo = "Minha agenda";
      for (const [dia, rot] of [[hoje, "Hoje"], [amanha, "Amanhã"]] as const) {
        const d = vis.filter((v) => v.scheduled_date === dia);
        linhas.push(`${rot} (${brDia(dia)}): ${d.length ? d.map(linha).join("; ") : "nada agendado"}`);
      }
      const levar = new Map<string, number>();
      for (const v of vis.filter((x) => x.material_status === "pendente" || x.material_status === "separado")) for (const i of arr(v.itens)) levar.set(i.descricao, (levar.get(i.descricao) ?? 0) + (Number(String(i.quantidade).replace(",", ".")) || 0));
      if (levar.size) linhas.push(`Levar: ${[...levar].map(([d, q]) => `${q}x ${d}`).join(", ")}`);
      linhas.push(`Ocorrências com info pendente: ${arr(pend).length ? arr(pend).map((p) => `#${p.ocorrencia_codigo}`).join(", ") : "nenhuma"}`);
      linhas.push(`Propostas abertas: ${arr(props).length}`);
      linhas.push(`${feraLink("/hoje")} · ${feraLink("/propostas")}`);
      barras = [{ rotulo: "Hoje", valor: vis.filter((v) => v.scheduled_date === hoje).length }, { rotulo: "Amanha", valor: vis.filter((v) => v.scheduled_date === amanha).length },
        { rotulo: "Info pendente", valor: arr(pend).length }, { rotulo: "Propostas", valor: arr(props).length }];
    }
    let imagem_enviada = false;
    if (ehPanorama(texto)) {
      try {
        const png = await graficoPng(titulo, barras);
        if (png) imagem_enviada = await enviarImagemEquipe(supabase, String(params.chat_id), png, titulo);
      } catch { imagem_enviada = false; }
    }
    const msg = linhas.join("\n");
    return ok({ visao, imagem_enviada, mensagem_para_equipe: msg.length > 1200 ? `${msg.slice(0, 1197)}...` : msg });
  }, params);
}

// ─── flora_equipe: single dispatcher (one GPT Maker intent) over the team tools ───
const FLORA_EQUIPE_ACOES: Record<string, string> = {
  minha_agenda: "minha_agenda", agenda_equipe: "agenda_equipe", listar_pendencias: "listar_pendencias", consultar: "consultar_cliente_ou_lead",
  criar_lead: "criar_lead_equipe", agendar_visita: "agendar_visita_equipe", registrar_localizacao: "registrar_localizacao_checkin",
  registrar_nota: "registrar_nota_visita", anexar_coleta: "anexar_coleta_ocorrencia", pendencias_ocorrencia: "pendencias_ocorrencia",
  confirmar_coleta: "confirmar_coleta_ocorrencia", contexto_aviso: "contexto_aviso", indicadores: "indicadores",
};
const CAMPO_ALIAS: Record<string, string> = {
  empresa: "empresa", nome: "empresa", estabelecimento: "empresa", cidade: "cidade", endereco: "endereco", cnpj: "cnpj",
  contato: "contato_nome", contato_nome: "contato_nome", responsavel: "contato_nome", telefone: "contato_telefone", whatsapp: "contato_telefone",
  contato_telefone: "contato_telefone", cargo: "cargo", tipo: "tipo", horario: "horario", hora: "horario", data: "data",
  latitude: "latitude", lat: "latitude", longitude: "longitude", lng: "longitude", lon: "longitude", cliente: "termo", termo: "termo",
  consultor: "consultor", client_id: "client_id", lead_id: "lead_id", observacao: "observacao", obs: "observacao", proximo_passo: "proximo_passo",
};
const semAcento = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Free fields from `dados` (object) and "chave: valor" pairs / coordinates / dates / times inside `texto`. Server-side only. */
function interpretarCamposEquipe(texto: unknown, dados: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const t = typeof texto === "string" ? texto : "";
  for (const part of t.split(/[\n;]+/)) {
    const m = /^\s*([\p{L}_ ]{2,20})\s*[:=]\s*(.+?)\s*$/u.exec(part);
    const k = m ? CAMPO_ALIAS[semAcento(m[1]).replace(/\s+/g, "_")] : undefined;
    if (k && m) out[k] = m[2];
  }
  const coord = /(-?\d{1,2}\.\d{3,})\s*[,; ]\s*(-?\d{1,3}\.\d{3,})/.exec(t);
  if (coord && out.latitude === undefined) { out.latitude = coord[1]; out.longitude = coord[2]; }
  if (out.data === undefined) {
    const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t), br = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
    if (iso) out.data = iso[1];
    else if (br) { const y = br[3] ? (br[3].length === 2 ? `20${br[3]}` : br[3]) : spToday().slice(0, 4); out.data = `${y}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`; }
  }
  if (out.horario === undefined) { const h = /\b(\d{1,2})(?::|h)(\d{2})?\b/i.exec(t.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, "")); if (h && Number(h[1]) < 24) out.horario = `${h[1].padStart(2, "0")}:${h[2] ?? "00"}`; }
  if (dados && typeof dados === "object" && !Array.isArray(dados)) {
    for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
      const key = CAMPO_ALIAS[semAcento(k)] ?? (["itens", "operacao_material", "consultor_id"].includes(k) ? k : undefined);
      if (key && v !== null && v !== undefined && v !== "") out[key] = v;
    }
  }
  for (const k of ["latitude", "longitude"]) if (typeof out[k] === "string") out[k] = Number(String(out[k]).replace(",", "."));
  if (typeof out.horario === "string") { const h = /^(\d{1,2})(?::|h)?(\d{2})?$/.exec(out.horario.trim()); if (h) out.horario = `${h[1].padStart(2, "0")}:${h[2] ?? "00"}`; }
  if (typeof out.tipo === "string") {
    const v = semAcento(out.tipo);
    out.tipo = v.includes("comerc") ? "visita_comercial" : v.includes("manut") ? "manutencao" : v.includes("entreg") ? "entrega" : v.includes("tecn") || v.includes("instal") ? "visita_tecnica" : out.tipo;
  }
  return out;
}

const OBRIGATORIOS: Record<string, string[]> = {
  criar_lead: ["empresa", "cidade", "contato_nome"], agendar_visita: ["tipo", "data", "horario"], registrar_localizacao: ["latitude", "longitude"],
  consultar: ["termo"], registrar_nota: ["texto"], anexar_coleta: ["texto"], contexto_aviso: ["codigo"],
};
const NOME_CAMPO: Record<string, string> = { empresa: "nome da empresa", cidade: "cidade", contato_nome: "nome do contato", tipo: "tipo da visita", data: "data",
  horario: "horário", latitude: "localização", longitude: "localização", termo: "nome do cliente", texto: "texto", codigo: "código do aviso" };

/** Short Portuguese reply the Flora sends literally. */
function mensagemEquipe(acao: string, r: McpResponse): string {
  const d: any = r.data ?? {};
  if (typeof d.mensagem_para_equipe === "string") return d.mensagem_para_equipe;
  const cut = (v: string) => v.length > 900 ? `${v.slice(0, 897)}...` : v;
  if (!r.success) return cut(r.message === "não autorizado" ? "Você não tem permissão para isso." : (r.message ?? "Não consegui fazer isso agora."));
  const linhaVisita = (v: any) => `${v.horario ?? "--:--"} ${v.cliente ?? v.titulo ?? ""} ${v.codigo ?? ""}${v.prontidao && v.prontidao !== "pronto" ? ` (${v.prontidao})` : ""}`.trim();
  const dia = (iso?: string) => iso ? iso.split("-").reverse().join("/") : "hoje";
  switch (acao) {
    case "minha_agenda": return cut(d.visitas?.length ? `Sua agenda ${dia(d.data)}:\n${d.visitas.map(linhaVisita).join("\n")}` : `Você não tem visitas ${dia(d.data)}.`);
    case "agenda_equipe": return cut(d.consultores?.length ? `Equipe ${dia(d.data)}:\n${d.consultores.map((c: any) => `${c.consultor}: ${c.visitas.map(linhaVisita).join("; ")}`).join("\n")}` : `Nenhuma visita da equipe ${dia(d.data)}.`);
    case "listar_pendencias": {
      const l: string[] = [];
      if (d.atendimentos?.length) l.push(`Atendimentos abertos: ${d.atendimentos.length}`);
      if (d.visitas_hoje?.length) l.push(`Visitas hoje: ${d.visitas_hoje.map(linhaVisita).join("; ")}`);
      if (d.tarefas_nota?.length) l.push(`Tarefas de nota: ${d.tarefas_nota.map((t: any) => `${t.codigo} ${t.empresa ?? ""}`).join("; ")}`);
      return cut(l.length ? l.join("\n") : "Nada pendente agora.");
    }
    case "consultar": return cut(d.resultados?.length ? d.resultados.slice(0, 3).map((x: any) => `${x.nome ?? x.empresa ?? ""}${x.link ? ` ${x.link}` : ""}`).join("\n") : "Não encontrei esse cliente/lead.");
    case "pendencias_ocorrencia": return cut(d.pendencias?.length ? `${d.ocorrencia} ${d.cliente ?? ""} — falta:\n- ${d.pendencias.join("\n- ")}` : `${d.ocorrencia ?? "Ocorrência"}: nada pendente.`);
    case "confirmar_coleta":
    case "registrar_nota":
      if (d.precisa_confirmacao || d.pode_confirmar) return cut(`${d.resumo ?? ""}\n\nConfirma? Responda SIM.`.trim());
      if (d.pendencias?.length && d.pode_confirmar === false) return cut(`${d.ocorrencia} — antes de confirmar, falta:\n- ${d.pendencias.join("\n- ")}`);
  }
  return cut([r.message, d.link].filter(Boolean).join(" ") || "Feito.");
}

async function floraEquipe(params: Record<string, unknown>): Promise<McpResponse> {
  const acao = typeof params.acao === "string" ? params.acao.trim() : "";
  const { user, ambiguo } = await resolverEquipe(getClient(), params.chat_id);
  if (!user) {
    const msg = ambiguo ? "Este número está em mais de um cadastro do Fera. Peça ao gestor para corrigir em Usuários." : "Este número não está cadastrado na equipe do Fera.";
    return { success: false, message: msg, data: { equipe: false, mensagem_para_equipe: msg } };
  }
  const tool = FLORA_EQUIPE_ACOES[acao];
  if (!tool) {
    const msg = "Não entendi o que fazer. Diga, por exemplo: minha agenda, pendências, criar lead ou agendar visita.";
    return { success: false, message: `acao inválida: ${acao || "(vazia)"}`, data: { equipe: true, acoes: Object.keys(FLORA_EQUIPE_ACOES), mensagem_para_equipe: msg } };
  }
  const campos = interpretarCamposEquipe(params.texto, params.dados);
  const p: Record<string, unknown> = { ...campos, chat_id: params.chat_id };
  if (typeof params.texto === "string" && params.texto.trim()) p.texto = params.texto;
  if (typeof params.codigo === "string" && params.codigo.trim()) p.codigo = params.codigo.trim();
  if (validDate(params.data)) p.data = params.data;
  if (params.confirmar === true) p.confirmar = true;
  if (typeof params.codigo_confirmacao === "string") p.codigo_confirmacao = params.codigo_confirmacao;
  // Unscheduled visit (anexar_coleta / registrar_nota): establishment and city may also come as top-level fields.
  for (const k of ["empresa", "cidade"]) if (typeof params[k] === "string" && (params[k] as string).trim() && p[k] === undefined) p[k] = (params[k] as string).trim();
  if (acao === "consultar" && !p.termo && typeof params.texto === "string") p.termo = params.texto.trim();
  if (acao === "agenda_equipe" && !p.consultor && typeof params.texto === "string" && !params.texto.includes(":")) p.consultor = params.texto.trim();
  if (acao === "agendar_visita" && !p.client_id && !p.lead_id) {
    const alvo = typeof p.termo === "string" ? p.termo : typeof p.empresa === "string" ? p.empresa : null;
    if (alvo) {
      const busca = await TEAM_TOOLS.consultar_cliente_ou_lead({ chat_id: params.chat_id, termo: alvo });
      const res: any[] = (busca.data as any)?.resultados ?? [];
      if (res.length === 1) { if (res[0].tipo === "cliente") p.client_id = res[0].id; else p.lead_id = res[0].id; }
      else if (res.length > 1) { const msg = `Achei mais de um: ${res.slice(0, 3).map((x: any) => x.nome ?? x.empresa).join(", ")}. Qual deles?`; return { success: false, message: msg, data: { equipe: true, mensagem_para_equipe: msg } }; }
    }
  }
  const faltam = Array.from(new Set((OBRIGATORIOS[acao] ?? []).filter((k) => p[k] === undefined || p[k] === null || p[k] === "" || (typeof p[k] === "number" && !Number.isFinite(p[k] as number))).map((k) => NOME_CAMPO[k] ?? k)));
  if (faltam.length) { const msg = `Preciso de: ${faltam.join(", ")}.`; return { success: false, message: msg, data: { equipe: true, faltam, mensagem_para_equipe: msg } }; }
  const r = await TEAM_TOOLS[tool](p);
  const data = r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data as Record<string, unknown> : { resultado: r.data };
  return { ...r, data: { ...data, equipe: true, acao, mensagem_para_equipe: mensagemEquipe(acao, r) },
    next_action_hint: "Envie mensagem_para_equipe literalmente ao usuário." };
}

const TEAM_TOOLS: Record<string, (p: Record<string, unknown>) => Promise<McpResponse>> = {
  anexar_coleta_ocorrencia: anexarColetaOcorrencia, pendencias_ocorrencia: pendenciasOcorrencia, confirmar_coleta_ocorrencia: confirmarColetaOcorrencia,
  identificar_usuario: identificarUsuario, minha_agenda: minhaAgenda, agenda_equipe: agendaEquipe, listar_pendencias: listarPendencias,
  consultar_cliente_ou_lead: consultarClienteOuLead, criar_lead_equipe: criarLeadEquipe, agendar_visita_equipe: agendarVisitaEquipe,
  registrar_localizacao_checkin: registrarLocalizacaoCheckin, registrar_nota_visita: registrarNotaVisita,
  assumir_atendimento: assumirAtendimento, resolver_atendimento: resolverAtendimento, contexto_aviso: contextoAviso,
  marcar_material_separado: marcarMaterialSeparado, flora_equipe: floraEquipe, indicadores,
};

const CHAT = { chat_id: { type: "string", description: "chat_id da conversa atual (identifica o usuário da equipe pelo telefone)" } };
const TEAM_MANIFEST = [
  { name: "flora_equipe", description: "EQUIPE (use esta): ferramenta única da equipe. Identifica o usuário pelo telefone do chat_id no servidor e roteia pela acao. Sempre envie data.mensagem_para_equipe literalmente.", parameters: { type: "object", required: ["chat_id", "acao"], properties: { ...CHAT,
    acao: { type: "string", enum: Object.keys(FLORA_EQUIPE_ACOES) }, codigo: { type: "string", description: "#OC-…, #V-…, #T-… ou #A-…" }, texto: { type: "string", description: "Fala/transcrição ou campos livres (ex.: 'empresa: X; cidade: Y; contato: Z')" },
    data: { type: "string", description: "AAAA-MM-DD" }, confirmar: { type: "boolean" }, codigo_confirmacao: { type: "string" },
    empresa: { type: "string", description: "anexar_coleta/registrar_nota sem visita aberta: nome do estabelecimento visitado" },
    cidade: { type: "string", description: "anexar_coleta/registrar_nota sem visita aberta: cidade do estabelecimento" }, dados: { type: "object", description: "Opcional: campos livres (nome, cidade, endereco, contato, telefone, tipo, horario, latitude, longitude...)" } } } },
  { name: "identificar_usuario", description: "EQUIPE: identifica o usuário do Fera pelo telefone do chat (nome, papéis, últimos avisos com código). Telefone desconhecido = não autorizado.", parameters: { type: "object", required: ["chat_id"], properties: { ...CHAT } } },
  { name: "minha_agenda", description: "EQUIPE: visitas do dia do próprio usuário (status, prontidão, código e link).", parameters: { type: "object", required: ["chat_id"], properties: { ...CHAT, data: { type: "string", description: "AAAA-MM-DD (padrão hoje)" } } } },
  { name: "agenda_equipe", description: "EQUIPE (só gestor/admin): visitas do dia de toda a equipe agrupadas por consultor.", parameters: { type: "object", required: ["chat_id"], properties: { ...CHAT, data: { type: "string" }, consultor: { type: "string", description: "Opcional: parte do nome" } } } },
  { name: "listar_pendencias", description: "EQUIPE: atendimentos abertos, visitas de hoje e (faturamento/gestor) tarefas de nota. Consultor vê só as suas.", parameters: { type: "object", required: ["chat_id"], properties: { ...CHAT } } },
  { name: "consultar_cliente_ou_lead", description: "EQUIPE: resumo de cliente/lead (contatos, último histórico, pontos instalados, próxima visita, link). Vendedor/consultor vê só a própria carteira.", parameters: { type: "object", required: ["chat_id", "termo"], properties: { ...CHAT, termo: { type: "string", description: "Nome da empresa" } } } },
  { name: "criar_lead_equipe", description: "EQUIPE: cria lead (empresa + cidade + 1 contato) em nome do usuário.", parameters: { type: "object", required: ["chat_id", "empresa", "cidade", "contato_nome"], properties: { ...CHAT, empresa: { type: "string" }, cidade: { type: "string" }, endereco: { type: "string" }, cnpj: { type: "string" }, contato_nome: { type: "string" }, contato_telefone: { type: "string" }, cargo: { type: "string" } } } },
  { name: "agendar_visita_equipe", description: "EQUIPE: agenda visita com as mesmas validações do Fera (cliente obrigatório fora da comercial, CNPJ quando há nota, conflito, feriado, agenda Google). Vendedor só visita comercial.", parameters: { type: "object", required: ["chat_id", "tipo", "data", "horario"], properties: { ...CHAT, tipo: { type: "string", enum: TEAM_TYPES }, data: { type: "string" }, horario: { type: "string", description: "HH:MM" }, client_id: { type: "string" }, lead_id: { type: "string" }, operacao_material: { type: "string", enum: ["instalacao_teste", "instalacao_definitiva", "entrega", "substituicao", "manutencao_reposicao"] }, itens: { type: "array", items: { type: "object", properties: { descricao: { type: "string" }, quantidade: { type: "string" } } } }, consultor_id: { type: "string", description: "Só gestor" }, observacao: { type: "string" } } } },
  { name: "registrar_localizacao_checkin", description: "EQUIPE: plano B quando o GPS do app falha — grava a localização enviada no WhatsApp no check-in da visita em andamento do próprio usuário.", parameters: { type: "object", required: ["chat_id", "latitude", "longitude"], properties: { ...CHAT, latitude: { type: "number" }, longitude: { type: "number" } } } },
  { name: "registrar_nota_visita", description: "EQUIPE: nota da visita em andamento a partir da transcrição do áudio. 1ª chamada devolve resumo + codigo_confirmacao (NÃO grava); só depois do 'sim' chame com confirmar=true e o mesmo texto.", parameters: { type: "object", required: ["chat_id", "texto"], properties: { ...CHAT, texto: { type: "string" }, proximo_passo: { type: "string" }, confirmar: { type: "boolean" }, codigo_confirmacao: { type: "string" }, empresa: { type: "string", description: "Sem visita aberta: estabelecimento visitado" }, cidade: { type: "string", description: "Sem visita aberta: cidade" } } } },
  { name: "assumir_atendimento", description: "EQUIPE: assume um atendimento (código #A-…).", parameters: { type: "object", required: ["chat_id", "codigo"], properties: { ...CHAT, codigo: { type: "string" } } } },
  { name: "resolver_atendimento", description: "EQUIPE: resolve um atendimento com resolução e resultado.", parameters: { type: "object", required: ["chat_id", "codigo", "resolucao", "resultado"], properties: { ...CHAT, codigo: { type: "string" }, resolucao: { type: "string" }, resultado: { type: "string", enum: RESULTADOS_ATENDIMENTO } } } },
  { name: "contexto_aviso", description: "EQUIPE: quando o usuário responde a um aviso automático, resolve o código (#V-…, #T-…, #A-…) enviado a ele e devolve a visita/tarefa e ações possíveis.", parameters: { type: "object", required: ["chat_id", "codigo"], properties: { ...CHAT, codigo: { type: "string" } } } },
  { name: "anexar_coleta_ocorrencia", description: "EQUIPE: anexa texto/transcrição de áudio do vendedor à ocorrência aberta dele (ou pelo código #OC-…). Não confirma nada.", parameters: { type: "object", required: ["chat_id", "texto"], properties: { ...CHAT, texto: { type: "string" }, codigo: { type: "string", description: "Opcional: #OC-000123" } } } },
  { name: "pendencias_ocorrencia", description: "EQUIPE: o que ainda falta na coleta da ocorrência (inclui 'você ofereceu X — o que o cliente achou?' e próximos passos sem data).", parameters: { type: "object", required: ["chat_id"], properties: { ...CHAT, codigo: { type: "string" } } } },
  { name: "confirmar_coleta_ocorrencia", description: "EQUIPE: 1ª chamada transcreve/gera o rascunho e devolve resumo + pendências + codigo_confirmacao (NÃO grava); depois do 'sim', chame com confirmar=true e o código: cria pontos previstos, histórico do lead e próximos agendamentos.", parameters: { type: "object", required: ["chat_id"], properties: { ...CHAT, codigo: { type: "string" }, confirmar: { type: "boolean" }, codigo_confirmacao: { type: "string" } } } },
  { name: "marcar_material_separado", description: "EQUIPE: marca o material da visita (#V-…) como separado (responsável, operacional ou gestor).", parameters: { type: "object", required: ["chat_id", "codigo"], properties: { ...CHAT, codigo: { type: "string" } } } },
];

const TOOLS_MANIFEST = [...TOOLS_MANIFEST_CLIENTE, ...TEAM_MANIFEST];

// ─────────────────────────────────────────────────────────────────────────────
// TOOL ROUTER
// ─────────────────────────────────────────────────────────────────────────────

async function routeTool(method: string, params: Record<string, unknown>): Promise<McpResponse> {
  // Preserve the original received params in request auditing; normalize only
  // the copy dispatched to tools, including nested strings and array entries.
  params = normalizeParamValue(params) as Record<string, unknown>;
  params = applyChatChannel(method, params);
  if (Object.prototype.hasOwnProperty.call(TEAM_TOOLS, method)) return TEAM_TOOLS[method](params);
  const teamRefusal = await refuseTeamInClientFlow(method, params);
  if (teamRefusal) return teamRefusal;
  switch (method) {
    // Block 1
    case "localizar_estabelecimento":    return withKnownContact(await localizarEstabelecimento(params), params.chat_id);
    case "buscar_contato": {
      // Team is resolved first: staff are usually not contacts, so Flora must learn it even when no contact exists.
      const equipe = params.chat_id ? await teamInfo(params.chat_id) : null;
      if (equipe) {
        return { success: true, message: `Usuário da equipe: ${equipe.nome}.`,
          data: { equipe, use_ferramentas_equipe: true },
          next_action_hint: "Modo equipe: use só as intenções equipe_*" };
      }
      const found = await buscarContato(params);
      if (!found.success || !params.chat_id) return found;
      return { ...found, data: { ...(found.data as Record<string, unknown>), contexto_anterior: await previousContext(getClient(), params.chat_id), equipe: null } };
    }
    case "verificar_cobertura_regiao":   return verificarCoberturaRegiao(params);
    case "consultar_rota_consultor":     return consultarRotaConsultor(params);
    case "obter_promocao_vigente":       return obterPromocaoVigente(params);
    case "consultar_produto":            return withKnownContact(await consultarProduto(params), params.chat_id);
    // Block 2
    case "criar_lead":                   return criarLead(params);
    case "atualizar_lead":               return atualizarLead(params);
    case "registrar_interacao":          return registrarInteracao(params);
    // Block 3
    case "listar_horarios_disponiveis":  return listarHorariosDisponiveis(params);
    case "agendar_visita":               return agendarVisita(params);
    case "agendar_visita_tecnica":       return agendarVisitaTecnica(params);
    case "agendar_reuniao_sede":         return agendarReuniaoSede(params);
    case "cancelar_reagendar_visita":    return cancelarReagendarVisita(params);
    case "responder_confirmacao_visita": return responderConfirmacaoVisita(params);
    // Block 4
    case "mover_lead_estagio":           return moverLeadEstagio(params);
    case "atribuir_responsavel":         return atribuirResponsavel(params);
    case "adicionar_tag":                return adicionarTag(params);
    // Block 5
    case "solicitar_atendimento_humano": return solicitarAtendimentoHumano(params);
    case "registrar_fora_cobertura":     return registrarForaCobertura(params);
    // Block 6
    case "enviar_codigo_otp":            return enviarCodigoOtp(params);
    case "validar_codigo_otp":           return validarCodigoOtp(params);
    default:
      return fail(
        `Tool not found: ${method}`,
        `Tools disponíveis: ${TOOLS_MANIFEST.map((t) => t.name).join(", ")}`
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const startedAt = performance.now();
  type AuditDetails = {
    method?: string | null;
    params?: unknown;
    success: boolean;
    error_code?: number | null;
    error_message?: string | null;
  };
  const finish = (response: Response, details: AuditDetails): Response => {
    // Snapshot duration before background work; never await the audit insert.
    const duration_ms = Math.round(performance.now() - startedAt);
    try {
      const copy = response.clone();
      const task = (async () => {
        try {
          const text = await copy.text();
          const storedResponse = text.length > 4000
            ? text.slice(0, 4000)
            : text ? JSON.parse(text) : null;
          const { error } = await getClient().from("mcp_request_log").insert({
            method: details.method ?? null,
            params: details.params ?? null,
            success: details.success,
            error_code: details.error_code ?? null,
            error_message: details.error_message ?? null,
            response: storedResponse,
            duration_ms,
          });
          if (error) console.error("[MCP AUDIT] Insert failed");
        } catch {
          console.error("[MCP AUDIT] Background logging failed");
        }
      })();
      const runtime = (globalThis as unknown as {
        EdgeRuntime?: { waitUntil: (task: Promise<void>) => void };
      }).EdgeRuntime;
      runtime?.waitUntil(task);
    } catch {
      console.error("[MCP AUDIT] Could not schedule logging");
    }
    return response;
  };
  // CORS preflight
  if (req.method === "OPTIONS") {
    return finish(new Response(null, { status: 204, headers: CORS_HEADERS }), { success: true });
  }

  // Auth
  if (!authenticate(req)) {
    return finish(jsonRpcError(null, -32001, "Unauthorized"), {
      success: false, error_code: -32001, error_message: "Unauthorized",
    });
  }

  // Health check
  const url = new URL(req.url);
  if (url.pathname.endsWith("/health")) {
    return finish(new Response(
      JSON.stringify({ status: "ok", version: "3.0.0", tools: TOOLS_MANIFEST.length }),
      { headers: CORS_HEADERS }
    ), { success: true });
  }

  // Tools discovery (GET /tools)
  if (req.method === "GET" && url.pathname.endsWith("/tools")) {
    return finish(new Response(
      JSON.stringify({ tools: TOOLS_MANIFEST }),
      { headers: CORS_HEADERS }
    ), { success: true });
  }

  // Parse JSON-RPC
  let rpc: JsonRpcRequest;
  let rawBody = "";
  try {
    rawBody = await req.text();
    rpc = JSON.parse(rawBody);
  } catch {
    return finish(jsonRpcError(null, -32700, "Parse error"), {
      params: rawBody.slice(0, 2000), success: false,
      error_code: -32700, error_message: "Parse error",
    });
  }

  if (!rpc || rpc.jsonrpc !== "2.0" || !rpc.method) {
    return finish(jsonRpcError(rpc?.id ?? null, -32600, "Invalid Request"), {
      params: rawBody.slice(0, 2000), success: false,
      error_code: -32600, error_message: "Invalid Request",
    });
  }

  try {
    const result = await routeTool(rpc.method, rpc.params ?? {});
    return finish(jsonRpcResult(rpc.id, result), {
      method: rpc.method, params: rpc.params, success: result.success,
      error_message: result.success ? null : result.message,
    });
  } catch (err) {
    console.error(`[MCP] Error in ${rpc.method}`, err instanceof Error ? err.name : "unknown");
    const detail = `Internal error: ${err instanceof Error ? err.message : String(err)}`;
    return finish(jsonRpcError(rpc.id, -32603, "Erro interno ao processar a solicitação"), {
      method: rpc.method, params: rpc.params, success: false,
      error_code: -32603, error_message: detail,
    });
  }
});
