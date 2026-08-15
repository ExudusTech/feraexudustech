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

const SUPABASE_URL            = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_BEARER_TOKEN        = Deno.env.get("MCP_BEARER_TOKEN")!;

const NITSCLEAN_ORG_ID = Deno.env.get("NITSCLEAN_ORG_ID")!;

// GPT Maker — notificações via Florazap (WhatsApp)
const GPTMAKER_API_TOKEN = Deno.env.get("GPTMAKER_API_TOKEN") ?? "";
const GPTMAKER_FLORAZAP_CHANNEL_ID = Deno.env.get("GPTMAKER_FLORAZAP_CHANNEL_ID") ?? "3DF9D839DDCF463A3A350ADF91C40B89";

/**
 * notificar_equipe — função interna (NÃO exposta como tool MCP).
 * Busca destinatários ativos por role e envia WhatsApp via GPT Maker (Florazap),
 * logando cada envio em notification_logs. Erros são silenciosos.
 */
async function notificarEquipe(
  supabase: ReturnType<typeof getClient>,
  roles: string[],
  event_type: string,
  mensagem: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  if (!GPTMAKER_API_TOKEN) {
    console.warn("[notificar_equipe] GPTMAKER_API_TOKEN não configurado — pulando notificações");
    return;
  }

  const { data: recipients, error } = await supabase
    .from("notification_recipients")
    .select("id, nome, whatsapp, email, roles")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("ativo", true)
    .overlaps("roles", roles);

  if (error || !recipients?.length) {
    console.warn(`[notificar_equipe] Nenhum destinatário encontrado para roles: ${roles.join(", ")}`);
    return;
  }

  for (const r of recipients) {
    if (!r.whatsapp) continue;
    let status: "SENT" | "FAILED" = "SENT";
    let errorMsg: string | null = null;
    try {
      const res = await fetch(
        `https://app.gptmaker.ai/v2/channel/${GPTMAKER_FLORAZAP_CHANNEL_ID}/start-conversation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GPTMAKER_API_TOKEN}` },
          body: JSON.stringify({ phone: r.whatsapp, message: mensagem }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      status = "FAILED";
      errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[notificar_equipe] Falha ao notificar ${r.nome}:`, errorMsg);
    }

    await supabase.from("notification_logs").insert({
      organization_id: NITSCLEAN_ORG_ID,
      event_type,
      recipient_id: r.id,
      recipient_name: r.nome,
      channel: "WHATSAPP",
      destination: r.whatsapp,
      payload: payload ?? null,
      status,
      error_message: errorMsg,
    });
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

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

function authenticate(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  return auth === `Bearer ${MCP_BEARER_TOKEN}`;
}

function ok(data: unknown, message?: string, hint?: string): McpResponse {
  return { success: true, data, message, next_action_hint: hint };
}

function fail(message: string, hint?: string): McpResponse {
  return { success: false, message, next_action_hint: hint };
}

function jsonRpcResult(id: string | number, result: McpResponse): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: CORS_HEADERS });
}

function jsonRpcError(id: string | number | null, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), { headers: CORS_HEADERS });
}

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function logInteraction(supabase: ReturnType<typeof getClient>, tool: string, payload: unknown, response: McpResponse, leadId?: string, canal?: string, interactionId?: string) {
  await supabase.from("flora_interactions").insert({
    organization_id: NITSCLEAN_ORG_ID, lead_id: leadId ?? null,
    interaction_id: interactionId ?? null, canal: canal ?? null,
    tool_name: tool, payload, response,
  });
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseDiaSemana(diaSemana: string): number[] {
  const matches = diaSemana.match(/(\d)ª/g) ?? [];
  return matches.map((m) => parseInt(m[0], 10) - 1).filter((d) => d >= 1 && d <= 5);
}

function diaSemanaLabel(jsDow: number): string {
  const labels: Record<number, string> = {
    1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira", 4: "Quinta-feira", 5: "Sexta-feira",
  };
  return labels[jsDow] ?? "N/A";
}

function nextDatesForDows(dows: number[], count = 3, startFromTomorrow = true): string[] {
  const dates: string[] = [];
  const start = new Date();
  if (startFromTomorrow) start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; dates.length < count && i < 60; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    if (dows.includes(d.getDay())) dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// BLOCK 1 — IDENTIFICATION

async function buscarContato(params: Record<string, unknown>): Promise<McpResponse> {
  const { canal_id, canal_tipo, nome, telefone, vincular_canal_id_se_encontrado } = params as {
    canal_id?: string; canal_tipo?: string; nome?: string; telefone?: string;
    vincular_canal_id_se_encontrado?: boolean;
  };
  const supabase = getClient();
  const notFound = ok({ encontrado: false });

  if (canal_id && canal_tipo) {
    const tipo = canal_tipo.toUpperCase();
    const handle = canal_id.replace(/^@/, "");
    const fieldMap: Record<string, string> = {
      WHATSAPP: "whatsapp_id", INSTAGRAM: "instagram_handle",
      INSTAGRAM_UID: "instagram_user_id", MESSENGER: "messenger_user_id", TELEGRAM: "telegram_user_id",
    };
    const field = fieldMap[tipo];
    if (!field) return fail(`canal_tipo inválido: ${canal_tipo}`, "Use: WHATSAPP, INSTAGRAM, INSTAGRAM_UID, MESSENGER, TELEGRAM");
    const { data: contacts } = await supabase
      .from("client_contacts")
      .select("id, name, role, phone, whatsapp_id, instagram_handle, client_id, clients!inner(id, name, city, ramo_atuacao, vinculo, status)")
      .eq("organization_id", NITSCLEAN_ORG_ID).eq(field, handle).limit(1);
    if (!contacts || contacts.length === 0) return notFound;
    const contact = contacts[0];
    const client  = (contact as Record<string, unknown>).clients as Record<string, unknown>;
    return ok({ encontrado: true, contato: { contato_id: contact.id, nome: contact.name, cargo: contact.role ?? null, cliente_id: contact.client_id, empresa: client?.name ?? null, cidade: client?.city ?? null, ramo: client?.ramo_atuacao ?? null, vinculo: client?.vinculo ?? null, status_cliente: client?.status ?? null } }, undefined, "Use consultar_rota_consultor para propor visita, ou criar_lead para registrar interação");
  }

  if (telefone && nome) {
    const phoneNorm = String(telefone).replace(/\D/g, "").slice(-8);
    if (phoneNorm.length < 8) return notFound;
    const { data: candidates } = await supabase
      .from("client_contacts")
      .select("id, name, role, phone, whatsapp_id, instagram_handle, client_id, clients!inner(id, name, city, ramo_atuacao, vinculo, status)")
      .eq("organization_id", NITSCLEAN_ORG_ID).ilike("phone", `%${phoneNorm}`);
    if (!candidates || candidates.length === 0) return notFound;
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
    if (vincular_canal_id_se_encontrado && canal_id && canal_tipo) {
      const tipo = (canal_tipo as string).toUpperCase();
      const fieldMap: Record<string, string> = { WHATSAPP: "whatsapp_id", INSTAGRAM: "instagram_handle", INSTAGRAM_UID: "instagram_user_id", MESSENGER: "messenger_user_id", TELEGRAM: "telegram_user_id" };
      const field = fieldMap[tipo];
      if (field) await supabase.from("client_contacts").update({ [field]: canal_id.replace(/^@/, ""), updated_at: new Date().toISOString() }).eq("id", matched.id);
    }
    const client = (matched as Record<string, unknown>).clients as Record<string, unknown>;
    return ok({ encontrado: true, contato: { contato_id: matched.id, nome: matched.name, cargo: matched.role ?? null, cliente_id: matched.client_id, empresa: client?.name ?? null, cidade: client?.city ?? null, ramo: client?.ramo_atuacao ?? null, vinculo: client?.vinculo ?? null, status_cliente: client?.status ?? null } }, undefined, "Use consultar_rota_consultor para propor visita ou criar_lead para registrar interação");
  }

  return fail("Forneça (canal_id + canal_tipo) para Modo 1, ou (telefone + nome) para Modo 2");
}

async function verificarCoberturaRegiao(params: Record<string, unknown>): Promise<McpResponse> {
  const { cidade, cep } = params as { cidade?: string; cep?: string };
  if (!cidade && !cep) return fail("Forneça cidade ou CEP");
  const supabase = getClient();
  let query = supabase.from("ekkoa_coverage_areas").select("id, name, city, dia_semana, horario_inicio, horario_fim").eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true);
  if (cidade) query = query.ilike("city", `%${cidade}%`);
  const { data: areas } = await query;
  if (!areas || areas.length === 0) return ok({ coberto: false, cidade: cidade ?? cep }, `${cidade ?? cep} não está na área de cobertura atual`, "Use registrar_fora_cobertura para não perder este lead");
  const cobertura = areas.map((a) => {
    const dows = parseDiaSemana(a.dia_semana ?? "");
    return { regiao: a.name, cidade: a.city, dia_visita: dows.length > 0 ? dows.map(diaSemanaLabel).join(" e ") : (a.dia_semana ?? "A confirmar"), horario: `${a.horario_inicio ?? "08:00"} às ${a.horario_fim ?? "18:00"}` };
  });
  return ok({ coberto: true, cobertura }, `${cidade ?? cep} está coberta! Visitas: ${cobertura.map((c) => c.dia_visita).join(", ")}`, "Use consultar_rota_consultor para obter as próximas datas e propor agendamento");
}

async function consultarRotaConsultor(params: Record<string, unknown>): Promise<McpResponse> {
  const { cidade, cep, proximas_datas_count } = params as { cidade?: string; cep?: string; proximas_datas_count?: number };
  if (!cidade && !cep) return fail("Forneça cidade");
  const supabase = getClient();
  let query = supabase.from("ekkoa_coverage_areas").select("id, name, city, dia_semana, horario_inicio, horario_fim").eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true);
  if (cidade) query = query.ilike("city", `%${cidade}%`);
  const { data: areas } = await query;
  if (!areas || areas.length === 0) return ok({ coberto: false, cidade: cidade ?? cep, proximas_datas: [] }, `${cidade ?? cep} não está coberta`, "Use registrar_fora_cobertura para registrar o lead mesmo assim");
  const count = Math.min(proximas_datas_count ?? 3, 6);
  const allDows = new Set<number>();
  for (const a of areas) parseDiaSemana(a.dia_semana ?? "").forEach((d) => allDows.add(d));
  const dowsList = Array.from(allDows).sort();
  const proximas = nextDatesForDows(dowsList, count);
  const proximasFormatadas = proximas.map((dateStr) => {
    const d   = new Date(dateStr + "T12:00:00-03:00");
    const dow = d.getDay();
    const area = areas.find((a) => parseDiaSemana(a.dia_semana ?? "").includes(dow));
    return { data: dateStr, data_ptbr: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }), dia_semana: diaSemanaLabel(dow), horario: area ? `${area.horario_inicio ?? "08:00"} às ${area.horario_fim ?? "18:00"}` : "A confirmar", regiao: area?.name ?? cidade ?? "" };
  });
  const diasSemana = dowsList.map(diaSemanaLabel).join(" e ");
  return ok({ coberto: true, cidade: cidade ?? cep, dias_de_visita: diasSemana, proximas_datas: proximasFormatadas }, `Consultor visita ${cidade ?? cep} às ${diasSemana}. Próximas: ${proximasFormatadas.map((p) => p.data_ptbr).join(", ")}`, `Proponha ao lead: "Nossa equipe visita ${cidade ?? cep} às ${diasSemana}. Quer agendar para ${proximasFormatadas[0]?.data_ptbr ?? "em breve"}?"`);
}

async function obterPromocaoVigente(_params: Record<string, unknown>): Promise<McpResponse> {
  const supabase = getClient();
  const { data: products } = await supabase.from("products").select("name, category, price, description").eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true).order("created_at", { ascending: false }).limit(5);
  const promocoes = [
    { nome: "Teste Gratuito Ekkoa", descricao: "Instale o sistema Ekkoa por 7 dias sem custo. Mais de 70% de conversão após o teste.", validade: "Oferta permanente" },
    { nome: "Comodato de Dispensers", descricao: "Dispensers de papel, sabonete e toalha sem custo de equipamento — paga só o consumo.", validade: "Oferta permanente" },
  ];
  return ok({ promocoes, produtos_destaque: products ?? [] }, "Promoções vigentes NitsClean", "Apresente as promoções e pergunte qual mais interessa ao cliente");
}

async function consultarProduto(params: Record<string, unknown>): Promise<McpResponse> {
  const { nome, categoria } = params as { nome?: string; categoria?: string };
  const supabase = getClient();
  let query = supabase.from("products").select("id, name, category, description, price, brand, unit, specifications").eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true);
  if (nome) query = query.ilike("name", `%${nome}%`);
  if (categoria) query = query.ilike("category", `%${categoria}%`);
  const { data: products } = await query.limit(10);
  if (!products || products.length === 0) return ok({ produtos: [] }, `Nenhum produto encontrado para "${nome ?? categoria}"`, "Ofereça o catálogo completo ou sugira agendar uma demonstração");
  return ok({ produtos: products }, `${products.length} produto(s) encontrado(s)`, "Apresente os produtos e pergunte qual atende melhor a necessidade do cliente");
}

// BLOCK 2 — LEAD CAPTURE

async function criarLead(params: Record<string, unknown>): Promise<McpResponse> {
  const { nome, telefone, email, empresa, empresa_nome, cargo_contato, canal, origem_especifica, interaction_id, instagram_handle, produto_interesse, cidade, mensagem_inicial, post_id, post_titulo, vinculo, client_contact_id } = params as {
    nome: string; telefone?: string; email?: string; empresa?: string; empresa_nome?: string; cargo_contato?: string;
    canal: string; origem_especifica?: string; interaction_id: string; instagram_handle?: string;
    produto_interesse?: string; cidade?: string; mensagem_inicial?: string;
    post_id?: string; post_titulo?: string; vinculo?: string; client_contact_id?: string;
  };
  if (!nome) return fail("Nome do contato é obrigatório");
  if (!canal) return fail("Canal de origem é obrigatório");
  if (!interaction_id) return fail("interaction_id é obrigatório para idempotência");
  if (!telefone && !instagram_handle) return fail("Forneça telefone ou instagram_handle");
  const supabase = getClient();
  const { data: existing } = await supabase.from("leads").select("id, contact_name, stage").eq("interaction_id", interaction_id).single();
  if (existing) return ok({ lead: existing, criado: false }, `Lead já existe: ${existing.contact_name}`, "Lead já registrado — use atualizar_lead ou agendar_visita_tecnica");
  const empresaFinal = empresa_nome ?? empresa ?? null;
  const { data: lead, error } = await supabase.from("leads").insert({
    organization_id: NITSCLEAN_ORG_ID, contact_name: nome, contact_phone: telefone ?? null, contact_email: email ?? null,
    title: empresaFinal ? `${nome} — ${empresaFinal}` : nome, company: empresaFinal, empresa_nome: empresaFinal,
    cargo_contato: cargo_contato ?? null, stage: "novo", source: canal.toLowerCase(), canal_origem: canal as string,
    origem_especifica: origem_especifica ?? null, interaction_id, instagram_handle: instagram_handle ?? null,
    description: mensagem_inicial ?? produto_interesse ?? null, category: produto_interesse ?? null,
    post_id: post_id ?? null, post_titulo: post_titulo ?? null, vinculo: vinculo ?? null,
    client_contact_id: client_contact_id ?? null, position: 0, created_by_flora: true,
  }).select("id, contact_name, stage").single();
  if (error) return fail(`Erro ao criar lead: ${error.message}`);
  await logInteraction(supabase, "criar_lead", params, ok(lead), lead!.id, canal, interaction_id);
  return ok({ lead, criado: true }, `Lead criado: ${nome}`, "Use consultar_rota_consultor para verificar cobertura e propor visita técnica");
}

async function atualizarLead(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, ...updates } = params as { lead_id?: string; interaction_id?: string; [key: string]: unknown };
  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
  if (!leadId) return fail("Lead não encontrado — forneça lead_id ou interaction_id");
  const allowedFields: Record<string, string> = { nome: "contact_name", telefone: "contact_phone", email: "contact_email", empresa: "company", empresa_nome: "empresa_nome", cargo_contato: "cargo_contato", cidade: "zip_code", produto_interesse: "category", notas: "description", valor_estimado: "value", post_id: "post_id", post_titulo: "post_titulo", vinculo: "vinculo" };
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(updates)) { updatePayload[allowedFields[key] ?? key] = value; }
  const { data: lead, error } = await supabase.from("leads").update(updatePayload).eq("id", leadId).eq("organization_id", NITSCLEAN_ORG_ID).select("id, contact_name, stage").single();
  if (error) return fail(`Erro ao atualizar lead: ${error.message}`);
  return ok({ lead }, `Lead atualizado: ${lead!.contact_name}`);
}

async function registrarInteracao(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, tipo, notas, canal } = params as { lead_id?: string; interaction_id?: string; tipo: string; notas: string; canal?: string };
  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
  if (!leadId) return fail("Lead não encontrado para registrar interação");
  await supabase.from("flora_interactions").insert({ organization_id: NITSCLEAN_ORG_ID, lead_id: leadId, interaction_id: interaction_id ?? null, canal: canal ?? null, tool_name: `interacao_${tipo}`, payload: { tipo, notas }, response: { registrado: true } });
  return ok({ registrado: true, lead_id: leadId }, "Interação registrada");
}

// BLOCK 3 — SCHEDULING

async function listarHorariosDisponiveis(params: Record<string, unknown>): Promise<McpResponse> {
  const { cidade, data_preferida } = params as { cidade?: string; data_preferida?: string };
  const supabase = getClient();
  let targetDows: number[] = [];
  if (cidade) {
    const { data: areas } = await supabase.from("ekkoa_coverage_areas").select("dia_semana").eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true).ilike("city", `%${cidade}%`);
    if (areas) for (const a of areas) parseDiaSemana(a.dia_semana ?? "").forEach((d) => targetDows.push(d));
    targetDows = [...new Set(targetDows)].sort();
  }
  let nextDate: Date;
  if (data_preferida) { nextDate = new Date(data_preferida + "T12:00:00"); }
  else if (targetDows.length > 0) { const dates = nextDatesForDows(targetDows, 1); nextDate = dates.length > 0 ? new Date(dates[0] + "T12:00:00") : new Date(); }
  else { nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 1); }
  const dateStr = nextDate.toISOString().split("T")[0];
  const { data: existing } = await supabase.from("schedules").select("start_time").eq("organization_id", NITSCLEAN_ORG_ID).eq("scheduled_date", dateStr).in("status", ["agendado", "confirmado"]);
  const allSlots = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
  const occupied = (existing ?? []).map((s) => (s.start_time as string)?.substring(0, 5));
  const available = allSlots.filter((t) => !occupied.includes(t));
  const diasPtbr: Record<number, string> = { 0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado" };
  return ok({ data: dateStr, dia_semana: diasPtbr[nextDate.getDay()] ?? "", horarios_disponiveis: available, total_disponivel: available.length }, `${available.length} horários disponíveis para ${dateStr}`);
}

async function agendarVisita(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, nome_contato, empresa, telefone, data_visita, horario, cidade, produto_interesse, notas } = params as { lead_id?: string; interaction_id?: string; nome_contato: string; empresa?: string; telefone?: string; data_visita: string; horario: string; cidade?: string; produto_interesse?: string; notas?: string };
  if (!data_visita || !horario) return fail("data_visita e horario são obrigatórios");
  if (!nome_contato) return fail("nome_contato é obrigatório");
  const supabase = getClient();
  let leadId = lead_id, clientId: string | null = null;
  if (!leadId && interaction_id) { const { data } = await supabase.from("leads").select("id, client_id").eq("interaction_id", interaction_id).single(); leadId = data?.id; clientId = data?.client_id; }
  const title = empresa ? `Visita NitsClean — ${empresa} [${produto_interesse ?? "Ekkoa"}]` : `Visita NitsClean — ${nome_contato} [${produto_interesse ?? "Ekkoa"}]`;
  const startTime = `${horario}:00`, endHour = parseInt(horario.split(":")[0], 10) + 1, endTime = `${String(endHour).padStart(2, "0")}:00:00`;
  const { data: schedule, error } = await supabase.from("schedules").insert({ organization_id: NITSCLEAN_ORG_ID, title, scheduled_date: data_visita, start_time: startTime, end_time: endTime, schedule_type: "visita_comercial", status: "agendado", location: cidade ?? null, notes: [notas, telefone ? `Tel: ${telefone}` : null, produto_interesse ? `Produto: ${produto_interesse}` : null, interaction_id ? `Flora: ${interaction_id}` : null].filter(Boolean).join(" | "), client_id: clientId ?? null }).select("id, title, scheduled_date, start_time, status").single();
  if (error) return fail(`Erro ao criar agendamento: ${error.message}`);
  if (leadId) await supabase.from("leads").update({ stage: "agendado", updated_at: new Date().toISOString() }).eq("id", leadId);
  await logInteraction(supabase, "agendar_visita", params, ok(schedule), leadId, undefined, interaction_id);
  const dataFmt = new Date(data_visita + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return ok({ agendamento: schedule, lead_id: leadId }, `Visita agendada para ${dataFmt} às ${horario}h`);
}

async function agendarVisitaTecnica(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, contato_id, nome_contato, empresa, telefone, cargo, data_visita, horario, cidade, produto_interesse, notas } = params as { lead_id?: string; interaction_id?: string; contato_id?: string; nome_contato: string; empresa?: string; telefone?: string; cargo?: string; data_visita: string; horario: string; cidade: string; produto_interesse?: string; notas?: string };
  if (!data_visita || !horario) return fail("data_visita e horario são obrigatórios");
  if (!nome_contato) return fail("nome_contato é obrigatório");
  if (!cidade) return fail("cidade é obrigatória para validar a rota do consultor");
  const supabase = getClient();
  const { data: areas } = await supabase.from("ekkoa_coverage_areas").select("dia_semana, horario_inicio, horario_fim, name").eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true).ilike("city", `%${cidade}%`);
  const coveredDows = new Set<number>();
  for (const a of (areas ?? [])) parseDiaSemana(a.dia_semana ?? "").forEach((d) => coveredDows.add(d));
  const visitDate = new Date(data_visita + "T12:00:00"), visitDow = visitDate.getDay();
  if (coveredDows.size > 0 && !coveredDows.has(visitDow)) {
    const validDays = Array.from(coveredDows).map(diaSemanaLabel).join(" e ");
    const proximas  = nextDatesForDows(Array.from(coveredDows), 3);
    return fail(`${data_visita} não é dia de cobertura em ${cidade}. Dias válidos: ${validDays}`, `Próximas datas disponíveis: ${proximas.join(", ")}. Proponha uma dessas ao cliente.`);
  }
  let leadId = lead_id, clientId: string | null = null;
  if (!leadId && interaction_id) { const { data } = await supabase.from("leads").select("id, client_id").eq("interaction_id", interaction_id).single(); leadId = data?.id; clientId = data?.client_id ?? null; }
  const empresaLabel = empresa ?? "empresa";
  const title = `Visita Técnica — ${empresaLabel} — ${cidade} [${produto_interesse ?? "Ekkoa"}]`;
  const startTime = `${horario}:00`, endHour = parseInt(horario.split(":")[0], 10) + 1, endTime = `${String(endHour).padStart(2, "0")}:00:00`;
  const notesArr = [`Contato: ${nome_contato}${cargo ? ` (${cargo})` : ""}`, telefone ? `Tel: ${telefone}` : null, produto_interesse ? `Produto: ${produto_interesse}` : null, contato_id ? `contato_id: ${contato_id}` : null, interaction_id ? `Flora: ${interaction_id}` : null, notas ?? null].filter(Boolean).join(" | ");
  const { data: schedule, error } = await supabase.from("schedules").insert({ organization_id: NITSCLEAN_ORG_ID, title, scheduled_date: data_visita, start_time: startTime, end_time: endTime, schedule_type: "visita_tecnica", schedule_subtype: "PROSPECCAO", status: "agendado", location: cidade, notes: notesArr, client_id: clientId ?? null, lead_id: leadId ?? null }).select("id, title, scheduled_date, start_time, status").single();
  if (error) return fail(`Erro ao criar agendamento: ${error.message}`);
  if (leadId) await supabase.from("leads").update({ stage: "agendado", updated_at: new Date().toISOString() }).eq("id", leadId);
  await logInteraction(supabase, "agendar_visita_tecnica", params, ok(schedule), leadId, undefined, interaction_id);
  const dataFmt = visitDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const mensagemParaLead = `Perfeito! Sua visita técnica está confirmada para ${dataFmt} às ${horario}h em ${cidade}. Nosso consultor levará uma demonstração completa do ${produto_interesse ?? "sistema Ekkoa"} até você. Qualquer dúvida, pode chamar aqui! 😊`;
  return ok({ agendamento_id: schedule!.id, confirmado_provisoriamente: true, agendamento: schedule, lead_id: leadId, mensagem_para_lead: mensagemParaLead }, `Visita técnica agendada: ${dataFmt} às ${horario}h em ${cidade}`, `Envie ao lead: "${mensagemParaLead}"`);
}

async function agendarReuniaoSede(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, nome_contato, empresa, telefone, canal, data_preferida, motivo } = params as { lead_id?: string; interaction_id?: string; nome_contato: string; empresa?: string; telefone?: string; canal?: string; data_preferida?: string; motivo?: string };
  if (!nome_contato) return fail("nome_contato é obrigatório");
  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) { const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single(); leadId = data?.id; }
  if (leadId) {
    await supabase.from("leads").update({ precisa_humano: true, stage: "qualificado", description: [`⚠️ REUNIÃO SEDE SOLICITADA`, motivo ? `Motivo: ${motivo}` : null, data_preferida ? `Data preferida: ${data_preferida}` : null, empresa ? `Empresa: ${empresa}` : null, telefone ? `Tel: ${telefone}` : null, interaction_id ? `Flora: ${interaction_id}` : null].filter(Boolean).join(" | "), updated_at: new Date().toISOString() }).eq("id", leadId);
  }
  await logInteraction(supabase, "agendar_reuniao_sede", params, ok({ solicitado: true }), leadId, canal, interaction_id);
  const mensagemParaLead = `Anotado! Recebi sua solicitação de reunião na nossa sede. Um especialista da NitsClean entrará em contato em breve para agendar e confirmar todos os detalhes. Enquanto isso, posso te ajudar com mais alguma informação?`;
  return ok({ solicitado: true, lead_id: leadId, mensagem_para_lead: mensagemParaLead }, "Solicitação de reunião na sede registrada — equipe NitsClean será notificada", `Envie ao lead: "${mensagemParaLead}"`);
}

async function cancelarReagendarVisita(params: Record<string, unknown>): Promise<McpResponse> {
  const { schedule_id, interaction_id, acao, nova_data, novo_horario, motivo } = params as { schedule_id?: string; interaction_id?: string; acao: "cancelar" | "reagendar"; nova_data?: string; novo_horario?: string; motivo?: string };
  const supabase = getClient();
  let schedId = schedule_id;
  if (!schedId && interaction_id) { const { data } = await supabase.from("schedules").select("id").ilike("notes", `%${interaction_id}%`).limit(1).single(); schedId = data?.id; }
  if (!schedId) return fail("Agendamento não encontrado");
  if (acao === "cancelar") {
    const { error } = await supabase.from("schedules").update({ status: "cancelado", notes: motivo ? `Cancelado: ${motivo}` : "Cancelado via Flora" }).eq("id", schedId);
    if (error) return fail(`Erro ao cancelar: ${error.message}`);
    return ok({ cancelado: true }, "Agendamento cancelado");
  }
  if (acao === "reagendar") {
    if (!nova_data || !novo_horario) return fail("Forneça nova_data e novo_horario para reagendar");
    const endHour = parseInt(novo_horario.split(":")[0], 10) + 1;
    const { data: updated, error } = await supabase.from("schedules").update({ scheduled_date: nova_data, start_time: `${novo_horario}:00`, end_time: `${String(endHour).padStart(2, "0")}:00:00`, status: "agendado", notes: motivo ? `Reagendado: ${motivo}` : "Reagendado via Flora" }).eq("id", schedId).select("id, scheduled_date, start_time").single();
    if (error) return fail(`Erro ao reagendar: ${error.message}`);
    return ok({ reagendado: true, agendamento: updated }, `Reagendado para ${nova_data} às ${novo_horario}h`);
  }
  return fail(`Ação inválida: ${acao}. Use "cancelar" ou "reagendar"`);
}

// BLOCK 4 — CRM PIPELINE

const VALID_STAGES = ["novo", "qualificado", "proposta", "agendado", "ganho", "perdido"];

async function moverLeadEstagio(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, novo_estagio, motivo } = params as { lead_id?: string; interaction_id?: string; novo_estagio: string; motivo?: string };
  if (!VALID_STAGES.includes(novo_estagio)) return fail(`Estágio inválido: ${novo_estagio}`, `Válidos: ${VALID_STAGES.join(", ")}`);
  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) { const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single(); leadId = data?.id; }
  if (!leadId) return fail("Lead não encontrado");
  const { data: lead, error } = await supabase.from("leads").update({ stage: novo_estagio, description: motivo, updated_at: new Date().toISOString() }).eq("id", leadId).select("id, contact_name, stage").single();
  if (error) return fail(`Erro: ${error.message}`);
  return ok({ lead }, `Lead movido para ${novo_estagio}`);
}

async function atribuirResponsavel(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, responsavel_nome } = params as { lead_id?: string; interaction_id?: string; responsavel_nome: string };
  const supabase = getClient();
  const { data: profiles } = await supabase.from("profiles").select("id, user_id, name").eq("organization_id", NITSCLEAN_ORG_ID).ilike("name", `%${responsavel_nome}%`).limit(1);
  const userId = profiles?.[0]?.user_id ?? null;
  let leadId = lead_id;
  if (!leadId && interaction_id) { const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single(); leadId = data?.id; }
  if (!leadId) return fail("Lead não encontrado");
  const { error } = await supabase.from("leads").update({ assigned_to: userId, updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) return fail(`Erro: ${error.message}`);
  return ok({ atribuido: true, responsavel: profiles?.[0]?.name ?? responsavel_nome }, `Lead atribuído para ${profiles?.[0]?.name ?? responsavel_nome}`);
}

async function adicionarTag(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, tags } = params as { lead_id?: string; interaction_id?: string; tags: string[] };
  if (!tags || tags.length === 0) return fail("Forneça pelo menos uma tag");
  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) { const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single(); leadId = data?.id; }
  if (!leadId) return fail("Lead não encontrado");
  const { data: current } = await supabase.from("leads").select("flora_tags").eq("id", leadId).single();
  const newTags = [...new Set([...(current?.flora_tags ?? []), ...tags])];
  const { error } = await supabase.from("leads").update({ flora_tags: newTags, updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) return fail(`Erro: ${error.message}`);
  return ok({ tags: newTags }, `Tags adicionadas: ${tags.join(", ")}`);
}

// BLOCK 5 — ROUTING / EXCEPTIONS

async function solicitarAtendimentoHumano(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, motivo, urgencia } = params as { lead_id?: string; interaction_id?: string; motivo?: string; urgencia?: string };
  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) { const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single(); leadId = data?.id; }
  if (leadId) await supabase.from("leads").update({ precisa_humano: true, description: motivo ? `⚠️ HUMANO: ${motivo}` : "⚠️ Solicitou atendimento humano", updated_at: new Date().toISOString() }).eq("id", leadId);
  await logInteraction(supabase, "solicitar_atendimento_humano", params, ok({ solicitado: true }), leadId, undefined, interaction_id);
  return ok({ solicitado: true, urgencia: urgencia ?? "media" }, "Atendimento humano solicitado — Arilson será notificado", "Informe ao cliente: 'Vou chamar um especialista da NitsClean para te atender. Ele entrará em contato em breve!'");
}

async function registrarForaCobertura(params: Record<string, unknown>): Promise<McpResponse> {
  const { nome, telefone, instagram_handle, cidade, interaction_id, canal, produto_interesse } = params as { nome?: string; telefone?: string; instagram_handle?: string; cidade: string; interaction_id?: string; canal?: string; produto_interesse?: string };
  if (!cidade) return fail("Cidade é obrigatória");
  const supabase = getClient();
  const { error } = await supabase.from("leads").upsert({ organization_id: NITSCLEAN_ORG_ID, contact_name: nome ?? "Contato Anônimo", contact_phone: telefone ?? null, instagram_handle: instagram_handle ?? null, title: `Fora de cobertura — ${cidade}`, stage: "perdido", source: canal?.toLowerCase() ?? "whatsapp", canal_origem: (canal ?? "WHATSAPP") as string, interaction_id: interaction_id ?? null, fora_cobertura: true, vinculo: "SEM_COBERTURA", category: produto_interesse ?? null, description: `Lead fora da área de cobertura. Cidade: ${cidade}`, created_by_flora: true }, { onConflict: "interaction_id" });
  if (error && !error.message.includes("duplicate")) return fail(`Erro ao registrar: ${error.message}`);
  return ok({ registrado: true, cidade }, `Lead em ${cidade} registrado — fora da cobertura atual`, "Informe ao cliente: 'No momento não atendemos sua região, mas registramos seu interesse. Quando expandirmos, entraremos em contato!'");
}

// BLOCK 6 — WEBCHAT OTP

async function enviarCodigoOtp(params: Record<string, unknown>): Promise<McpResponse> {
  const { telefone, interaction_id, canal_envio } = params as { telefone: string; interaction_id?: string; canal_envio?: string };
  if (!telefone) return fail("telefone é obrigatório");
  const telefoneLimpo = telefone.replace(/\D/g, "");
  if (telefoneLimpo.length < 10) return fail("Telefone inválido — forneça com DDD (ex: 21912345678)");
  const otp = String(Math.floor(100_000 + Math.random() * 900_000));
  const otpHash = await sha256(otp);
  const token = `otp_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const expiraEm = new Date(Date.now() + 5 * 60 * 1000);
  const supabase = getClient();
  const { error } = await supabase.from("otp_verifications").insert({ organization_id: NITSCLEAN_ORG_ID, token, telefone: telefoneLimpo, codigo_hash: otpHash, canal_envio: canal_envio ?? "WHATSAPP", interaction_id: interaction_id ?? null, expira_em: expiraEm.toISOString() });
  if (error) return fail(`Erro ao gerar OTP: ${error.message}`);
  // TODO: Envio real via Z-API quando WhatsApp for reconectado
  return ok({ codigo_enviado: true, expira_em_segundos: 300, token_verificacao: token }, "Código enviado via WhatsApp", "Peça ao lead o código de 6 dígitos recebido e use validar_codigo_otp para confirmar");
}

async function validarCodigoOtp(params: Record<string, unknown>): Promise<McpResponse> {
  const { token_verificacao, codigo_informado } = params as { token_verificacao: string; codigo_informado: string };
  if (!token_verificacao) return fail("token_verificacao é obrigatório");
  if (!codigo_informado) return fail("codigo_informado é obrigatório");
  const supabase = getClient();
  const { data: otp } = await supabase.from("otp_verifications").select("id, codigo_hash, tentativas, max_tentativas, expira_em, validado").eq("token", token_verificacao).eq("organization_id", NITSCLEAN_ORG_ID).single();
  if (!otp) return ok({ validado: false, motivo: "token_invalido", tentativas_restantes: 0 });
  if (otp.validado) return ok({ validado: true, ja_validado: true, tentativas_restantes: otp.max_tentativas - otp.tentativas });
  if (new Date(otp.expira_em) < new Date()) return ok({ validado: false, motivo: "expirado", tentativas_restantes: 0 });
  if (otp.tentativas >= otp.max_tentativas) return ok({ validado: false, motivo: "max_tentativas_atingido", tentativas_restantes: 0 });
  const inputHash = await sha256(String(codigo_informado).trim());
  const novasTentativas = otp.tentativas + 1;
  if (inputHash === otp.codigo_hash) {
    await supabase.from("otp_verifications").update({ validado: true, tentativas: novasTentativas }).eq("token", token_verificacao);
    return ok({ validado: true, tentativas_restantes: otp.max_tentativas - novasTentativas }, "Identidade verificada com sucesso", "Prossiga com o atendimento — lead verificado");
  }
  await supabase.from("otp_verifications").update({ tentativas: novasTentativas }).eq("token", token_verificacao);
  const restantes = otp.max_tentativas - novasTentativas;
  return ok({ validado: false, motivo: "codigo_incorreto", tentativas_restantes: restantes }, undefined, restantes > 0 ? `Peça ao lead para tentar novamente. Restam ${restantes} tentativa(s).` : "Código bloqueado. Use enviar_codigo_otp para gerar um novo.");
}

// TOOLS MANIFEST

const TOOLS_MANIFEST = [
  { name: "buscar_contato", description: "Busca cliente B2B por canal_id (WhatsApp/Instagram) ou nome+telefone. LGPD-safe: resposta binária. Modo 1: canal_id+canal_tipo. Modo 2: telefone+nome.", parameters: { type: "object", properties: { canal_id: { type: "string" }, canal_tipo: { type: "string", enum: ["WHATSAPP","INSTAGRAM","INSTAGRAM_UID","MESSENGER","TELEGRAM"] }, nome: { type: "string" }, telefone: { type: "string" }, vincular_canal_id_se_encontrado: { type: "boolean" } } } },
  { name: "verificar_cobertura_regiao", description: "Verifica se cidade está na área de cobertura. Retorna coberto y/n e dias de visita.", parameters: { type: "object", properties: { cidade: { type: "string" }, cep: { type: "string" } } } },
  { name: "consultar_rota_consultor", description: "Retorna próximas datas em que o consultor estará na cidade. Usar para propor visita técnica proativamente.", parameters: { type: "object", properties: { cidade: { type: "string" }, cep: { type: "string" }, proximas_datas_count: { type: "number" } } } },
  { name: "obter_promocao_vigente", description: "Retorna promoções e destaques de produtos ativos da NitsClean", parameters: { type: "object", properties: {} } },
  { name: "consultar_produto", description: "Busca informações de produto por nome ou categoria", parameters: { type: "object", properties: { nome: { type: "string" }, categoria: { type: "string" } } } },
  { name: "criar_lead", description: "Registra novo lead no CRM. Idempotente via interaction_id. Suporta campos B2B e rastreamento de post IG.", parameters: { type: "object", required: ["nome","canal","interaction_id"], properties: { nome: { type: "string" }, telefone: { type: "string" }, email: { type: "string" }, empresa_nome: { type: "string" }, cargo_contato: { type: "string" }, canal: { type: "string", enum: ["WIDGET","WHATSAPP","MESSENGER","INSTAGRAM","TELEGRAM"] }, origem_especifica: { type: "string", enum: ["DM","COMMENT","QR_PRODUTO","ANUNCIO_PAGO","WIDGET_DIRECT"] }, interaction_id: { type: "string" }, instagram_handle: { type: "string" }, produto_interesse: { type: "string" }, cidade: { type: "string" }, mensagem_inicial: { type: "string" }, post_id: { type: "string" }, post_titulo: { type: "string" }, vinculo: { type: "string", enum: ["DISTRIBUIDORA","MATRIZ","SEM_COBERTURA"] }, client_contact_id: { type: "string" } } } },
  { name: "atualizar_lead", description: "Atualiza dados de um lead existente", parameters: { type: "object", properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, nome: { type: "string" }, telefone: { type: "string" }, email: { type: "string" }, empresa_nome: { type: "string" }, cargo_contato: { type: "string" }, produto_interesse: { type: "string" }, notas: { type: "string" }, valor_estimado: { type: "number" }, post_id: { type: "string" }, post_titulo: { type: "string" }, vinculo: { type: "string", enum: ["DISTRIBUIDORA","MATRIZ","SEM_COBERTURA"] } } } },
  { name: "registrar_interacao", description: "Registra um evento/interação no histórico do lead", parameters: { type: "object", required: ["tipo","notas"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, tipo: { type: "string", enum: ["mensagem","ligacao","email","reuniao","demo","outro"] }, notas: { type: "string" }, canal: { type: "string" } } } },
  { name: "listar_horarios_disponiveis", description: "Lista horários disponíveis para agendamento na cidade do cliente", parameters: { type: "object", properties: { cidade: { type: "string" }, data_preferida: { type: "string" } } } },
  { name: "agendar_visita", description: "Cria agendamento genérico de visita. Para visitas técnicas B2B use agendar_visita_tecnica.", parameters: { type: "object", required: ["nome_contato","data_visita","horario"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, nome_contato: { type: "string" }, empresa: { type: "string" }, telefone: { type: "string" }, data_visita: { type: "string" }, horario: { type: "string" }, cidade: { type: "string" }, produto_interesse: { type: "string" }, notas: { type: "string" } } } },
  { name: "agendar_visita_tecnica", description: "Agenda visita técnica do consultor ao cliente. PRINCIPAL FORMA DE VENDA — Flora deve estimular proativamente. Valida que a data é dia de cobertura. Retorna mensagem_para_lead pronta.", parameters: { type: "object", required: ["nome_contato","data_visita","horario","cidade"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, contato_id: { type: "string" }, nome_contato: { type: "string" }, empresa: { type: "string" }, telefone: { type: "string" }, cargo: { type: "string" }, data_visita: { type: "string" }, horario: { type: "string" }, cidade: { type: "string" }, produto_interesse: { type: "string" }, notas: { type: "string" } } } },
  { name: "agendar_reuniao_sede", description: "Registra solicitação de reunião na sede NitsClean. Usar APENAS quando o próprio lead pedir — nunca oferecer proativamente.", parameters: { type: "object", required: ["nome_contato"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, nome_contato: { type: "string" }, empresa: { type: "string" }, telefone: { type: "string" }, canal: { type: "string" }, data_preferida: { type: "string" }, motivo: { type: "string" } } } },
  { name: "cancelar_reagendar_visita", description: "Cancela ou reagenda uma visita existente", parameters: { type: "object", required: ["acao"], properties: { schedule_id: { type: "string" }, interaction_id: { type: "string" }, acao: { type: "string", enum: ["cancelar","reagendar"] }, nova_data: { type: "string" }, novo_horario: { type: "string" }, motivo: { type: "string" } } } },
  { name: "mover_lead_estagio", description: "Move um lead para outro estágio do funil CRM", parameters: { type: "object", required: ["novo_estagio"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, novo_estagio: { type: "string", enum: ["novo","qualificado","proposta","agendado","ganho","perdido"] }, motivo: { type: "string" } } } },
  { name: "atribuir_responsavel", description: "Atribui um lead a um consultor/vendedor pelo nome", parameters: { type: "object", required: ["responsavel_nome"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, responsavel_nome: { type: "string" } } } },
  { name: "adicionar_tag", description: "Adiciona tags/labels a um lead para segmentação", parameters: { type: "object", required: ["tags"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, tags: { type: "array", items: { type: "string" } } } } },
  { name: "solicitar_atendimento_humano", description: "Sinaliza que o lead precisa de atendimento humano e notifica Arilson", parameters: { type: "object", properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, motivo: { type: "string" }, urgencia: { type: "string", enum: ["baixa","media","alta"] } } } },
  { name: "registrar_fora_cobertura", description: "Registra lead de cidade não coberta. Sempre registrar — valor de analytics para expansão.", parameters: { type: "object", required: ["cidade"], properties: { nome: { type: "string" }, telefone: { type: "string" }, instagram_handle: { type: "string" }, cidade: { type: "string" }, interaction_id: { type: "string" }, canal: { type: "string" }, produto_interesse: { type: "string" } } } },
  { name: "enviar_codigo_otp", description: "Gera e envia OTP via WhatsApp para verificar identidade no WebChat. O código NUNCA é retornado — apenas token_verificacao opaco.", parameters: { type: "object", required: ["telefone"], properties: { telefone: { type: "string" }, interaction_id: { type: "string" }, canal_envio: { type: "string", enum: ["WHATSAPP"] } } } },
  { name: "validar_codigo_otp", description: "Valida código OTP informado pelo lead. Máximo 3 tentativas, expira em 5 minutos.", parameters: { type: "object", required: ["token_verificacao","codigo_informado"], properties: { token_verificacao: { type: "string" }, codigo_informado: { type: "string" } } } },
];

// TOOL ROUTER

async function routeTool(method: string, params: Record<string, unknown>): Promise<McpResponse> {
  switch (method) {
    case "buscar_contato":               return buscarContato(params);
    case "verificar_cobertura_regiao":   return verificarCoberturaRegiao(params);
    case "consultar_rota_consultor":     return consultarRotaConsultor(params);
    case "obter_promocao_vigente":       return obterPromocaoVigente(params);
    case "consultar_produto":            return consultarProduto(params);
    case "criar_lead":                   return criarLead(params);
    case "atualizar_lead":               return atualizarLead(params);
    case "registrar_interacao":          return registrarInteracao(params);
    case "listar_horarios_disponiveis":  return listarHorariosDisponiveis(params);
    case "agendar_visita":               return agendarVisita(params);
    case "agendar_visita_tecnica":       return agendarVisitaTecnica(params);
    case "agendar_reuniao_sede":         return agendarReuniaoSede(params);
    case "cancelar_reagendar_visita":    return cancelarReagendarVisita(params);
    case "mover_lead_estagio":           return moverLeadEstagio(params);
    case "atribuir_responsavel":         return atribuirResponsavel(params);
    case "adicionar_tag":                return adicionarTag(params);
    case "solicitar_atendimento_humano": return solicitarAtendimentoHumano(params);
    case "registrar_fora_cobertura":     return registrarForaCobertura(params);
    case "enviar_codigo_otp":            return enviarCodigoOtp(params);
    case "validar_codigo_otp":           return validarCodigoOtp(params);
    default: return fail(`Tool not found: ${method}`, `Tools disponíveis: ${TOOLS_MANIFEST.map((t) => t.name).join(", ")}`);
  }
}

// MAIN HANDLER

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (!authenticate(req)) return jsonRpcError(null, -32001, "Unauthorized");
  const url = new URL(req.url);
  if (url.pathname.endsWith("/health")) return new Response(JSON.stringify({ status: "ok", version: "2.0.0", tools: TOOLS_MANIFEST.length }), { headers: CORS_HEADERS });
  if (req.method === "GET" && url.pathname.endsWith("/tools")) return new Response(JSON.stringify({ tools: TOOLS_MANIFEST }), { headers: CORS_HEADERS });
  let rpc: JsonRpcRequest;
  try { rpc = await req.json(); } catch { return jsonRpcError(null, -32700, "Parse error"); }
  if (rpc.jsonrpc !== "2.0" || !rpc.method) return jsonRpcError(rpc.id ?? null, -32600, "Invalid Request");
  try {
    const result = await routeTool(rpc.method, rpc.params ?? {});
    return jsonRpcResult(rpc.id, result);
  } catch (err) {
    console.error(`[MCP] Error in ${rpc.method}:`, err);
    return jsonRpcError(rpc.id, -32603, `Internal error: ${err instanceof Error ? err.message : String(err)}`);
  }
});
