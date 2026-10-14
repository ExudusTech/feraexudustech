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
  for (const key of ["whatsapp", "instagram_user_id", "messenger_id"] as const) {
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
    if (error) return { pessoa: null, error: error.message };
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
    if (error) return { pessoa: null, error: error.message };
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
    if (error) return { pessoa: null, error: error.message };
    pessoa = data as PessoaRecord;
  }
  return { pessoa };
}

async function pessoaWithLeads(supabase: ReturnType<typeof getClient>, pessoa: PessoaRecord): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("leads")
    .select("id, empresa_nome, company, title, city, stage, category")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("pessoa_id", pessoa.id)
    .order("created_at", { ascending: false }).limit(5);
  if (error) throw new Error(`Erro ao consultar leads da pessoa: ${error.message}`);
  return {
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
  if (error) throw new Error(`Erro ao consultar produto do lead: ${error.message}`);
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
  if (error) throw new Error(`Erro ao consultar feriados: ${error.message}`);
  return data ?? [];
}

function holidayForDate(holidays: Holiday[], date: string, city?: string | null): Holiday | undefined {
  const cityKey = (value: string) => value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return holidays.find(holiday => holiday.date === date &&
    (holiday.city === null || (typeof city === "string" && cityKey(holiday.city) === cityKey(city))));
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

// ─── Team notifications: isolated background work, tenant/event subscriptions ───

type TeamEvent = "agendamento" | "transferencia" | "lead_matriz";
const FERA_NOTIFICATION_URL = "https://fera.exudustech.com.br";

function notificationText(event: TeamEvent, params: Record<string, unknown>, lead: Record<string, unknown> | null,
  leadId?: string, scheduleId?: string): string {
  const text = (value: unknown) => typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim().slice(0, 240) : "";
  const company = text(params.empresa) || text(lead?.empresa_nome) || text(lead?.company);
  const contact = text(params.nome_contato) || text(params.nome) || text(lead?.contact_name);
  const client = [company, contact].filter(Boolean).join(" — ") || "Não informado";
  const city = text(params.cidade) || text(lead?.regiao);
  const link = scheduleId ? `${FERA_NOTIFICATION_URL}/agenda?agendamento=${encodeURIComponent(scheduleId)}`
    : leadId ? `${FERA_NOTIFICATION_URL}/leads?lead=${encodeURIComponent(leadId)}` : `${FERA_NOTIFICATION_URL}/leads`;
  const lines: string[] = [];
  if (event === "agendamento") {
    lines.push("📅 Nova visita agendada pela Flora", `Cliente: ${client}`);
    const street = (text(params.endereco) || text(lead?.endereco)).split(/\s[-–]\s/)[0].split(",").slice(0, 2).map(part => part.trim()).join(", ");
    const neighborhood = text(params.bairro) || text(lead?.bairro);
    const region = text(params.regiao) || text(lead?.regiao) || city;
    const where = [street, neighborhood].filter(Boolean).join(", ");
    if (where || region) lines.push(`Onde: ${where}${region ? `${where ? " " : ""}(${region})` : ""}`);
    const dateString = text(params.data_visita);
    const date = new Date(`${dateString}T12:00:00Z`);
    const dateLabel = Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR", {
      timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit",
    }) : dateString;
    lines.push(`Quando: ${dateLabel} às ${text(params.horario).slice(0, 5)}`);
    const product = text(params.produto_interesse) || text(lead?.category);
    if (product) lines.push(`Produto: ${product}`);
  } else {
    const heading = event === "lead_matriz" ? "🏢 Lead recebido da Matriz" : "👤 Atendimento transferido pela Flora";
    lines.push(heading, `Cliente: ${client}`);
    const reason = text(params.motivo) || "Atendimento humano solicitado";
    lines.push(`Motivo: ${reason}`);
    if (city) lines.push(`Cidade: ${city}`);
    const phone = text(params.telefone) || text(lead?.contact_phone);
    if (phone) lines.push(`Telefone: ${phone}`);
  }
  return [...lines, `Ver no Fera: ${link}`, "", "(Mensagem automática — não responda aqui; abra o link.)"].join("\n");
}

async function dispatchTeamNotification(supabase: ReturnType<typeof getClient>, event: TeamEvent,
  params: Record<string, unknown>, leadId?: string, scheduleId?: string): Promise<void> {
  const { data: recipients, error } = await supabase.from("notification_recipients")
    .select("id, nome, whatsapp").eq("organization_id", NITSCLEAN_ORG_ID).eq("ativo", true)
    .contains("eventos", [event]);
  if (error) throw new Error("Recipient lookup failed");
  if (!recipients?.length) return;
  let lead: Record<string, unknown> | null = null;
  if (leadId || params.interaction_id) {
    let query = supabase.from("leads").select("id, empresa_nome, company, contact_name, contact_phone, endereco, bairro, regiao, category")
      .eq("organization_id", NITSCLEAN_ORG_ID);
    query = leadId ? query.eq("id", leadId) : query.eq("interaction_id", params.interaction_id);
    const result = await query.maybeSingle();
    if (!result.error && result.data) { lead = result.data; leadId = result.data.id; }
  }
  const message = notificationText(event, params, lead, leadId, scheduleId);
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
        channel: "WHATSAPP", destination: recipient.whatsapp, payload: { lead_id: leadId ?? null, schedule_id: scheduleId ?? null, message },
        status, error_message: errorMessage,
      });
      if (logError) console.error("[team_notifications] Delivery log failed");
    } catch { console.error("[team_notifications] Delivery log failed"); }
  }
}

function queueTeamNotification(supabase: ReturnType<typeof getClient>, event: TeamEvent,
  params: Record<string, unknown>, leadId?: string, scheduleId?: string): void {
  try {
    const task = Promise.resolve().then(() => dispatchTeamNotification(supabase, event, params, leadId, scheduleId))
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
  if (personResult.error) return fail(`Erro ao consultar pessoa: ${personResult.error}`);
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
  const matchesCity = (areaCity: string | null) => {
    const requested = normalizeLocation(cidade ?? "");
    const candidate = normalizeLocation(areaCity ?? "");
    return !!requested && !!candidate && (requested.includes(candidate) || candidate.includes(requested));
  };
  const { data, error } = await getClient()
    .from("ekkoa_coverage_areas")
    .select("id, name, city, dia_semana, horario_inicio, horario_fim, zip_code_start, zip_code_end")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("is_active", true);
  if (error) return fail(`Erro ao consultar cobertura: ${error.message}`);
  const allAreas: CoverageRegion[] = data ?? [];
  const postalMatch = cep ? narrowestCoverage(allAreas, cep) : null;
  const areas = regiao ? allAreas.filter(area => area.name === regiao.trim())
    : cep ? (postalMatch ? [postalMatch] : []) : allAreas.filter(area => matchesCity(area.city));
  if (areas.length === 0) {
    const state = normalizeLocation(estado ?? "");
    const postal = validCep(cep);
    const knownRjCities = "Rio de Janeiro|Niterói|São Gonçalo|Duque de Caxias|Nova Iguaçu|Belford Roxo|São João de Meriti|Mesquita|Nilópolis|Queimados|Itaboraí|Maricá|Magé|Guapimirim|Petrópolis|Teresópolis|Nova Friburgo|Cachoeiras de Macacu|Rio Bonito|Tanguá|Silva Jardim|Casimiro de Abreu|Rio das Ostras|Macaé|Campos dos Goytacazes|São João da Barra|São Francisco de Itabapoana|Quissamã|Carapebus|Conceição de Macabu|Araruama|Iguaba Grande|São Pedro da Aldeia|Arraial do Cabo|Cabo Frio|Armação dos Búzios|Búzios|Saquarema|Angra dos Reis|Paraty|Mangaratiba|Itaguaí|Seropédica|Volta Redonda|Barra Mansa|Resende|Itatiaia|Porto Real|Quatis|Barra do Piraí|Piraí|Pinheiral|Rio Claro|Valença|Vassouras|Miguel Pereira|Paty do Alferes|Paraíba do Sul|Três Rios|Areal|Comendador Levy Gasparian|Sapucaia|Sumidouro|Carmo|Cantagalo|Cordeiro|Duas Barras|Bom Jardim|Santa Maria Madalena|São Sebastião do Alto|Trajano de Moraes|São Fidélis|Itaocara|Aperibé|Santo Antônio de Pádua|Miracema|Laje do Muriaé|Itaperuna|Bom Jesus do Itabapoana|Natividade|Porciúncula|Varre-Sai|Cambuci|Cardoso Moreira|São José de Ubá|São José do Vale do Rio Preto|Engenheiro Paulo de Frontin|Mendes|Paracambi|Japeri|Rio das Flores|Comendador Levy Gasparian";
    const inferredRj = !!postal && postal >= "20000000" && postal <= "28999999" ||
      knownRjCities.split("|").some(city => normalizeLocation(city) === normalizeLocation(cidade ?? "")) ||
      allAreas.some(area => matchesCity(area.city));
    const isRj = state ? ["rj", "rio de janeiro", "estado do rio de janeiro"].includes(state) : inferredRj;
    if (!state && !isRj) {
      const mensagem = "Você pode me confirmar o estado ou o CEP do estabelecimento?";
      return ok({ coberto: false, vinculo: null, precisa_confirmar: true, cidade: cidade ?? null,
        mensagem_para_lead: mensagem }, mensagem, "Pergunte o estado ou CEP antes de definir o vínculo; não registre fora de cobertura ainda");
    }
    const vinculo = isRj ? "MATRIZ" : "SEM_COBERTURA";
    const mensagem = isRj
      ? "Sua região é atendida pela Matriz da NitsClean. Vou chamar um especialista para continuar seu atendimento."
      : "No momento não atendemos seu estado, mas podemos registrar seu interesse. Obrigado pelo contato!";
    return ok(
      { coberto: false, vinculo, cidade: cidade ?? null, mensagem_para_lead: mensagem }, mensagem,
      isRj ? "Use solicitar_atendimento_humano com motivo contendo MATRIZ; não use registrar_fora_cobertura"
        : "Use registrar_fora_cobertura para registrar o interesse e encerrar gentilmente"
    );
  }

  const cobertura = areas.map((a) => {
    const dows = parseDiaSemana(a.dia_semana ?? "");
    return {
      regiao:     a.name,
      cidade:     a.city,
      dia_visita: dows.length > 0
        ? dows.map(diaSemanaLabel).join(" e ")
        : (a.dia_semana ?? "A confirmar"),
      horario: `${a.horario_inicio ?? "08:00"} às ${a.horario_fim ?? "18:00"}`,
    };
  });

  return ok(
    { coberto: true, vinculo: "DISTRIBUIDORA", cobertura },
    `${cidade ?? cep} está coberta! Visitas: ${cobertura.map((c) => c.dia_visita).join(", ")}`,
    "Cobertura confirmada. Chame consultar_rota_consultor, consulte a agenda e ofereça 3 opções com dia e horário livres."
  );
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
  else if (!params.cep && city) query = query.ilike("city", exactCity ? city : `%${city}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Erro ao consultar regiões: ${error.message}`);
  if (!region && params.cep) {
    const match = narrowestCoverage(data ?? [], params.cep);
    return match ? [match] : [];
  }
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

async function localizarEstabelecimento(params: Record<string, unknown>): Promise<McpResponse> {
  const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max ? value.trim() : null;
  const nome = text(params.nome, 200), cidade = text(params.cidade, 120), bairro = text(params.bairro, 120);
  if (!nome) return fail("nome é obrigatório (até 200 caracteres)");
  if (params.cidade != null && !cidade) return fail("cidade inválida (até 120 caracteres)");
  if (params.bairro != null && !bairro) return fail("bairro inválido");
  if (params.cep != null && !validCep(params.cep)) return fail("CEP deve conter oito dígitos");
  const fallback = () => ok({ encontrado: false, candidatos: [], precisa_confirmar: true,
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
        body: JSON.stringify({ textQuery, languageCode: "pt-BR", regionCode: "BR", maxResultCount: 3,
          ...(!cidade ? { locationBias: { circle: { center: { latitude: -22.88, longitude: -42.02 }, radius: 50000 } } } : {}) }),
      }, `places:${cidade ? "city" : "lagos-bias"}:${textQuery}`);
      places = Array.isArray(result.places) ? result.places.slice(0, 3) : [];
    }
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
    return ok({ encontrado: true, candidatos, precisa_confirmar: true, correspondencia_exata: correspondenciaExata, mensagem_para_lead: mensagem });
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

  const areas = await selectCoverage(supabase, params);

  if (!areas || areas.length === 0) {
    return ok(
      { coberto: false, cidade: regiao ?? cidade ?? cep, proximas_datas: [] },
      `${regiao ?? cidade ?? cep} não está coberta`,
      "Use registrar_fora_cobertura para registrar o lead mesmo assim"
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

  return ok(
    {
      coberto:         true,
      cidade:          regiao ?? cidade ?? cep,
      dias_de_visita:  diasSemana,
      proximas_datas:  proximasFormatadas,
    },
    `Consultor visita ${regiao ?? cidade ?? cep} às ${diasSemana}. Próximas: ${proximasFormatadas.map((p) => p.data_ptbr).join(", ")}`,
    "Antes de responder, consulte os horários livres na agenda para estas datas e ofereça 3 opções prontas (dia + horário livre dentro da faixa). Não peça ao lead para sugerir horário."
  );
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

async function consultarProduto(params: Record<string, unknown>): Promise<McpResponse> {
  const { nome, categoria } = params as { nome?: string; categoria?: string };

  const supabase = getClient();

  let query = supabase
    .from("products")
    .select("id, name, category, description, price, brand, unit, specifications")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("is_active", true);

  if (nome)      query = query.ilike("name", `%${nome}%`);
  if (categoria) query = query.ilike("category", `%${categoria}%`);

  const { data: products } = await query.limit(10);

  if (!products || products.length === 0) {
    return ok(
      { produtos: [] },
      `Nenhum produto encontrado para "${nome ?? categoria}"`,
      "Ofereça o catálogo completo ou sugira agendar uma demonstração"
    );
  }

  return ok(
    { produtos: products },
    `${products.length} produto(s) encontrado(s)`,
    "Apresente os produtos e pergunte qual atende melhor a necessidade do cliente"
  );
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
    return fail(`Erro ao resolver pessoa: ${personResult.error ?? "pessoa não identificada"}`);
  }

  const { data: openLeads, error: openLeadError } = await supabase.from("leads")
    .select("id, contact_name, stage, place_id, empresa_nome, company, city")
    .eq("organization_id", NITSCLEAN_ORG_ID).eq("pessoa_id", personResult.pessoa.id)
    .order("created_at", { ascending: false }).limit(20);
  if (openLeadError) return fail(`Erro ao consultar leads da pessoa: ${openLeadError.message}`);
  const requestedPlaceId = typeof params.place_id === "string" ? params.place_id.trim() : "";
  const companyKey = normalizedEstablishment(empresaFinal);
  const cityKey = normalizedEstablishment(cidade);
  const matchingLead = (openLeads ?? []).find((lead: Record<string, unknown>) => {
    if (["fechado_ganho", "fechado_perdido"].includes(String(lead.stage))) return false;
    if (requestedPlaceId) return lead.place_id === requestedPlaceId;
    if (!companyKey || !cityKey || lead.place_id) return false;
    return normalizedEstablishment(lead.empresa_nome ?? lead.company) === companyKey
      && normalizedEstablishment(lead.city) === cityKey;
  });
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
    })
    .select("id, contact_name, stage")
    .single();

  if (error) {
    return fail(`Erro ao criar lead: ${error.message}`, "Tente novamente ou registre manualmente no Fera");
  }

  await logInteraction(supabase, "criar_lead", params, ok(lead), lead?.id, canalFinal, interactionFinal);

  return ok(
    { lead, criado: true, pessoa: { id: personResult.pessoa.id, nome: personResult.pessoa.nome } },
    `Lead criado: ${nome}`,
    "Use consultar_rota_consultor para verificar cobertura e propor visita técnica"
  );
}

async function atualizarLead(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, ...updates } = params as {
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
    .select("id, contact_name, stage")
    .single();

  if (error) return fail(`Erro ao atualizar lead: ${error.message}`);

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
    const { data: areas } = await supabase
      .from("ekkoa_coverage_areas")
      .select("dia_semana, horario_inicio, horario_fim")
      .eq("organization_id", NITSCLEAN_ORG_ID)
      .eq("is_active", true)
      .ilike("city", `%${cidade}%`);

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

async function agendarVisita(params: Record<string, unknown>): Promise<McpResponse> {
  const {
    lead_id, interaction_id, nome_contato, empresa, telefone,
    data_visita, horario, cidade, produto_interesse, notas,
  } = params as {
    lead_id?: string; interaction_id?: string; nome_contato: string;
    empresa?: string; telefone?: string; data_visita: string; horario: string;
    cidade?: string; produto_interesse?: string; notas?: string;
  };

  if (!data_visita || !horario) return fail("data_visita e horario são obrigatórios");
  if (!nome_contato) return fail("nome_contato é obrigatório");

  const supabase = getClient();
  const holidayRejection = await rejectHolidayVisit(supabase, data_visita, cidade);
  if (holidayRejection) return holidayRejection;
  let leadId = lead_id;
  let clientId: string | null = null;
  if (!leadId && interaction_id) {
    const { data } = await supabase
      .from("leads").select("id, client_id").eq("interaction_id", interaction_id).single();
    leadId   = data?.id;
    clientId = data?.client_id;
  }

  const product = await resolveVisitProduct(supabase, leadId, produto_interesse);
  const title = `Visita NitsClean — ${empresa || nome_contato}${product ? ` [${product}]` : ""}`;
  const area = bookingArea(await selectCoverage(supabase, params, true), data_visita, horario);
  const startTime = `${horario}:00`;
  const endHour   = parseInt(horario.split(":")[0], 10) + 1;
  const endTime   = `${String(endHour).padStart(2, "0")}:00:00`;

  const { data: schedule, error } = await supabase
    .from("schedules")
    .insert({
      organization_id: NITSCLEAN_ORG_ID, title,
      source: "flora", assigned_to: area?.consultant_user_id ?? null,
      scheduled_date:  data_visita, start_time: startTime, end_time: endTime,
      schedule_type:   "visita_comercial", status: "agendado", location: cidade ?? null,
      notes: [
        notas,
        telefone          ? `Tel: ${telefone}`          : null,
        product           ? `Produto: ${product}`      : null,
        interaction_id    ? `Flora: ${interaction_id}`  : null,
      ].filter(Boolean).join(" | "),
      client_id: clientId ?? null,
    })
    .select("id, title, scheduled_date, start_time, status")
    .single();

  if (error) return fail(`Erro ao criar agendamento: ${error.message}`);

  if (leadId) {
    await supabase.from("leads")
      .update({ stage: "agendado", updated_at: new Date().toISOString() })
      .eq("id", leadId);
  }

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
  if (!nome_contato) return fail("nome_contato é obrigatório");
  if (!cidade) return fail("cidade é obrigatória para validar a rota do consultor");

  const supabase = getClient();
  let validatedLead: { id: string; client_id?: string | null } | null = null;
  if (lead_id) {
    const { data, error } = await supabase.from("leads").select("id, client_id")
      .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", lead_id).maybeSingle();
    if (error) return fail(`Erro ao validar lead: ${error.message}`);
    if (!data) return fail("lead_id não encontrado nesta organização");
    validatedLead = data;
  }
  const holidayRejection = await rejectHolidayVisit(supabase, data_visita, cidade);
  if (holidayRejection) return holidayRejection;
  const validEmail = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? email.trim() : null;

  // Explicit selectors cannot fall back to a broader city or an unrestricted booking.
  const areas = await selectCoverage(supabase, params, true);
  if ((params.regiao || params.cep) && areas.length === 0) return fail("Região ou CEP sem cobertura ativa");

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

  // Resolver lead
  let leadId = lead_id;
  let clientId: string | null = validatedLead?.client_id ?? null;
  if (!leadId && interaction_id) {
    const { data } = await supabase
      .from("leads").select("id, client_id").eq("organization_id", NITSCLEAN_ORG_ID).eq("interaction_id", interaction_id).single();
    leadId   = data?.id;
    clientId = data?.client_id ?? null;
  }

  const product = await resolveVisitProduct(supabase, leadId, produto_interesse);
  const empresaLabel = empresa ?? "empresa";
  const title        = `Visita Técnica — ${empresaLabel} — ${cidade}${product ? ` [${product}]` : ""}`;
  const startTime    = `${horario}:00`;
  const endHour      = parseInt(horario.split(":")[0], 10) + 1;
  const endTime      = `${String(endHour).padStart(2, "0")}:00:00`;

  const notesArr = [
    `Contato: ${nome_contato}${cargo ? ` (${cargo})` : ""}`,
    telefone          ? `Tel: ${telefone}`               : null,
    validEmail        ? `E-mail: ${validEmail}`          : null,
    product           ? `Produto: ${product}`           : null,
    contato_id        ? `contato_id: ${contato_id}`      : null,
    interaction_id    ? `Flora: ${interaction_id}`       : null,
    notas             ? notas                            : null,
  ].filter(Boolean).join(" | ");

  const { data: schedule, error } = await supabase
    .from("schedules")
    .insert({
      organization_id: NITSCLEAN_ORG_ID,
      title, scheduled_date: data_visita, start_time: startTime, end_time: endTime,
      schedule_type: "visita_tecnica", schedule_subtype: "PROSPECCAO",
      source: "flora", assigned_to: bookingArea(areas, data_visita, horario)?.consultant_user_id ?? null,
      status: "agendado",
      location: cidade, notes: notesArr,
      client_id: clientId ?? null,
      lead_id: leadId ?? null,
    })
    .select("id, title, scheduled_date, start_time, status")
    .single();

  if (error) return fail(`Erro ao criar agendamento: ${error.message}`);

  if (leadId) {
    await supabase.from("leads")
      .update({ stage: "agendado", updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (validEmail) {
      const { error: emailError } = await supabase.from("leads")
        .update({ contact_email: validEmail })
        .eq("organization_id", NITSCLEAN_ORG_ID).eq("id", leadId)
        .or("contact_email.is.null,contact_email.eq.");
      if (emailError) throw new Error(`Erro ao atualizar e-mail do lead: ${emailError.message}`);
    }
  }

  await logInteraction(supabase, "agendar_visita_tecnica", params, ok(schedule), leadId, undefined, interaction_id);

  const dataFmt = visitDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  queueTeamNotification(supabase, "agendamento", { ...params, produto_interesse: product }, leadId, schedule?.id);

  const mensagemParaLead =
    `Perfeito! Sua visita técnica está confirmada para ${dataFmt} às ${horario}h em ${cidade}. ` +
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
    if (error) return fail(`Erro ao cancelar: ${error.message}`);
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
    if (error) return fail(`Erro ao reagendar: ${error.message}`);
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

  if (error) return fail(`Erro: ${error.message}`);
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

  if (error) return fail(`Erro: ${error.message}`);
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

  if (error) return fail(`Erro: ${error.message}`);
  return ok({ tags: newTags }, `Tags adicionadas: ${tags.join(", ")}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5 — ROUTING / EXCEPTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function solicitarAtendimentoHumano(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, contato_id, interaction_id, motivo, urgencia } = params as {
    lead_id?: string; contato_id?: string; interaction_id?: string; motivo?: string; urgencia?: string;
  };

  const supabase = getClient();
  // Tratar string vazia como não fornecido
  let leadId = lead_id && lead_id.trim() !== "" ? lead_id : undefined;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }

  if (leadId) {
    await supabase.from("leads").update({
      precisa_humano: true,
      description:    motivo ? `⚠️ HUMANO: ${motivo}` : "⚠️ Solicitou atendimento humano",
      updated_at:     new Date().toISOString(),
    }).eq("id", leadId);
  }

  await logInteraction(supabase, "solicitar_atendimento_humano", params, ok({ solicitado: true }), leadId, undefined, interaction_id);

  queueTeamNotification(supabase, typeof motivo === "string" && /MATRIZ/i.test(motivo) ? "lead_matriz" : "transferencia", params, leadId);

  return ok(
    { solicitado: true, urgencia: urgencia ?? "media" },
    "Atendimento humano solicitado — Arilson será notificado",
    "Informe ao cliente: 'Vou chamar um especialista da NitsClean para te atender. Ele entrará em contato em breve!'"
  );
}

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
  let existingId: string | undefined;
  if (interaction_id || chat_id) {
    let lookup = supabase.from("leads").select("id").eq("organization_id", NITSCLEAN_ORG_ID);
    if (chat_id) lookup = lookup.eq("gptmaker_chat_id", chat_id)
      .gte("created_at", new Date(Date.now() - 86400000).toISOString());
    else lookup = lookup.eq("interaction_id", interaction_id);
    const { data, error } = await lookup.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return fail(`Erro ao consultar lead: ${error.message}`);
    existingId = data?.id;
  }
  const values = {
        organization_id:  NITSCLEAN_ORG_ID,
        contact_name:     nome ?? "Contato Anônimo",
        contact_phone:    telefone          ?? null,
        instagram_handle: instagram_handle  ?? null,
        title:            `Fora de cobertura — ${cidade}`,
        stage:            "fechado_perdido",
        source:           canal?.toLowerCase() ?? "whatsapp",
        canal_origem:     (canal ?? "WHATSAPP") as string,
        interaction_id:   interaction_id   ?? null,
        gptmaker_chat_id:  chat_id ?? null,
        fora_cobertura:   true,
        vinculo:          "SEM_COBERTURA",
        category:         produto_interesse ?? null,
        description:      `Lead fora da área de cobertura. Cidade: ${cidade}${estado ? ` — ${estado}` : ""}`,
        created_by_flora: true,
      };
  const write = existingId
    ? supabase.from("leads").update(values).eq("organization_id", NITSCLEAN_ORG_ID).eq("id", existingId)
    : supabase.from("leads").insert(values);
  const { data: lead, error } = await write.select("id").single();
  if (error) {
    return fail(`Erro ao registrar: ${error.message}`);
  }

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

  if (error) return fail(`Erro ao gerar OTP: ${error.message}`);

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

const TOOLS_MANIFEST = [
  {
    name: "localizar_estabelecimento",
    description: "Localiza estabelecimento por nome, com cidade opcional, ou pelo CEP via ViaCEP. Sem cidade, prioriza a Região dos Lagos. Retorna somente a correspondência única de nome ou até três candidatos; sempre confirme com o lead.",
    parameters: { type: "object", required: ["nome"], properties: {
      nome: { type: "string", maxLength: 200 }, cidade: { type: "string", maxLength: 120 },
      bairro: { type: "string", maxLength: 120 }, cep: { type: "string" },
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
    description: "Busca informações de produto por nome ou categoria",
    parameters: {
      type: "object",
      properties: {
        nome:      { type: "string" },
        categoria: { type: "string" },
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
        nome:              { type: "string" },
        telefone:          { type: "string" },
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
        cidade:            { type: "string" }, produto_interesse: { type: "string" }, notas: { type: "string" },
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
    name: "solicitar_atendimento_humano",
    description: "Sinaliza que o lead precisa de atendimento humano e notifica Arilson",
    parameters: {
      type: "object",
      properties: {
        lead_id:        { type: "string" },
        interaction_id: { type: "string" },
        motivo:         { type: "string" },
        urgencia:       { type: "string", enum: ["baixa", "media", "alta"] },
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
for (const tool of TOOLS_MANIFEST) {
  Object.assign(tool.parameters.properties, {
    chat_id: { type: "string", description: "ID real do chat GPT Maker: canal-contato. Prevalece sobre campos de canal preenchidos pelo modelo." },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL ROUTER
// ─────────────────────────────────────────────────────────────────────────────

async function routeTool(method: string, params: Record<string, unknown>): Promise<McpResponse> {
  // Preserve the original received params in request auditing; normalize only
  // the copy dispatched to tools, including nested strings and array entries.
  params = normalizeParamValue(params) as Record<string, unknown>;
  params = applyChatChannel(method, params);
  switch (method) {
    // Block 1
    case "localizar_estabelecimento":    return localizarEstabelecimento(params);
    case "buscar_contato":               return buscarContato(params);
    case "verificar_cobertura_regiao":   return verificarCoberturaRegiao(params);
    case "consultar_rota_consultor":     return consultarRotaConsultor(params);
    case "obter_promocao_vigente":       return obterPromocaoVigente(params);
    case "consultar_produto":            return consultarProduto(params);
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
    console.error(`[MCP] Error in ${rpc.method}:`, err);
    const message = `Internal error: ${err instanceof Error ? err.message : String(err)}`;
    return finish(jsonRpcError(rpc.id, -32603, message), {
      method: rpc.method, params: rpc.params, success: false,
      error_code: -32603, error_message: message,
    });
  }
});
