/**
 * Fera MCP Server — Supabase Edge Function
 * Flora (GPT Maker) ↔ Fera integration via Model Context Protocol (JSON-RPC 2.0)
 *
 * Deploy: supabase/functions/mcp/index.ts
 * Auth: Bearer Token (MCP_BEARER_TOKEN secret)
 * verify_jwt: false (custom auth below)
 *
 * 15 Tools in 5 Blocks:
 *   Block 1 — Identification (READ):  buscar_contato, verificar_cobertura_regiao, obter_promocao_vigente, consultar_produto
 *   Block 2 — Lead Capture (WRITE):   criar_lead, atualizar_lead, registrar_interacao
 *   Block 3 — Scheduling (R+W):       listar_horarios_disponiveis, agendar_visita, cancelar_reagendar_visita
 *   Block 4 — CRM Pipeline (WRITE):   mover_lead_estagio, atribuir_responsavel, adicionar_tag
 *   Block 5 — Routing/Exceptions:     solicitar_atendimento_humano, registrar_fora_cobertura
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_BEARER_TOKEN = Deno.env.get("MCP_BEARER_TOKEN")!;

// NitsClean organization ID — set as a secret or hardcode after first lookup
const NITSCLEAN_ORG_ID = Deno.env.get("NITSCLEAN_ORG_ID")!;

// CORS headers
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
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, result }),
    { headers: CORS_HEADERS }
  );
}

function jsonRpcError(id: string | number | null, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { headers: CORS_HEADERS }
  );
}

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

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

// ─── BLOCK 1 — IDENTIFICATION ─────────────────────────────────────────────────

async function buscarContato(params: Record<string, unknown>): Promise<McpResponse> {
  const { telefone, instagram_handle } = params as { telefone?: string; instagram_handle?: string };
  if (!telefone && !instagram_handle) {
    return fail("Forneça telefone ou instagram_handle", "Pergunte ao usuário seu telefone ou @ do Instagram");
  }
  const supabase = getClient();
  let clientQuery = supabase
    .from("clients")
    .select("id, name, company, email, phone, city, status, created_at")
    .eq("organization_id", NITSCLEAN_ORG_ID);
  if (telefone) clientQuery = clientQuery.ilike("phone", `%${telefone.replace(/\D/g, "").slice(-8)}%`);
  const { data: clients } = await clientQuery.limit(1);
  if (clients && clients.length > 0) {
    const client = clients[0];
    const { data: visits } = await supabase
      .from("client_visits")
      .select("visit_date, outcome, notes")
      .eq("client_id", client.id)
      .order("visit_date", { ascending: false })
      .limit(1);
    return ok({ tipo: "cliente_existente", cliente: client, ultima_visita: visits?.[0] ?? null }, `Cliente encontrado: ${client.name}`, "Use atualizar_lead ou agendar_visita para continuar o atendimento");
  }
  let leadQuery = supabase
    .from("leads")
    .select("id, contact_name, contact_phone, contact_email, stage, canal_origem, created_at, instagram_handle")
    .eq("organization_id", NITSCLEAN_ORG_ID);
  if (telefone) leadQuery = leadQuery.ilike("contact_phone", `%${telefone.replace(/\D/g, "").slice(-8)}%`);
  else if (instagram_handle) leadQuery = leadQuery.ilike("instagram_handle", `%${instagram_handle}%`);
  const { data: leads } = await leadQuery.limit(1);
  if (leads && leads.length > 0) {
    return ok({ tipo: "lead_existente", lead: leads[0] }, `Lead encontrado: ${leads[0].contact_name}`, "Use atualizar_lead para enriquecer os dados ou agendar_visita para continuar");
  }
  return ok({ tipo: "novo_contato" }, "Contato não encontrado na base", "Use criar_lead para registrar este novo contato");
}

async function verificarCoberturaRegiao(params: Record<string, unknown>): Promise<McpResponse> {
  const { cidade, cep } = params as { cidade?: string; cep?: string };
  if (!cidade && !cep) return fail("Forneça cidade ou CEP", "Pergunte ao cliente em qual cidade/bairro ele está localizado");
  const supabase = getClient();
  let query = supabase
    .from("ekkoa_coverage_areas")
    .select("id, name, city, dia_semana, horario_inicio, horario_fim, radius_km")
    .eq("organization_id", NITSCLEAN_ORG_ID)
    .eq("is_active", true);
  if (cidade) query = query.ilike("city", `%${cidade}%`);
  const { data: areas } = await query;
  if (!areas || areas.length === 0) {
    return ok({ coberto: false, cidade }, `${cidade ?? cep} não está na área de cobertura atual`, "Use registrar_fora_cobertura para não perder este lead");
  }
  const diasMap: Record<string, string> = { "1": "Segunda-feira", "2": "Terça-feira", "3": "Quarta-feira", "4": "Quinta-feira", "5": "Sexta-feira", monday: "Segunda-feira", tuesday: "Terça-feira", wednesday: "Quarta-feira", thursday: "Quinta-feira", friday: "Sexta-feira" };
  const cobertura = areas.map((a) => ({ regiao: a.name, cidade: a.city, dia_visita: diasMap[a.dia_semana?.toLowerCase?.()] ?? a.dia_semana, horario: `${a.horario_inicio ?? "08:00"} às ${a.horario_fim ?? "18:00"}` }));
  return ok({ coberto: true, cobertura }, `${cidade ?? cep} está coberta! Visitas ${cobertura[0].dia_visita}`, "Use agendar_visita para marcar uma visita nesta região");
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

// ─── BLOCK 2 — LEAD CAPTURE ───────────────────────────────────────────────────

async function criarLead(params: Record<string, unknown>): Promise<McpResponse> {
  const { nome, telefone, email, empresa, canal, origem_especifica, interaction_id, instagram_handle, produto_interesse, cidade, mensagem_inicial } = params as { nome: string; telefone?: string; email?: string; empresa?: string; canal: string; origem_especifica?: string; interaction_id: string; instagram_handle?: string; produto_interesse?: string; cidade?: string; mensagem_inicial?: string };
  if (!nome) return fail("Nome do contato é obrigatório");
  if (!canal) return fail("Canal de origem é obrigatório");
  if (!interaction_id) return fail("interaction_id é obrigatório para idempotência");
  if (!telefone && !instagram_handle) return fail("Forneça telefone ou instagram_handle", "Pergunte ao usuário seu WhatsApp ou @ do Instagram");
  const supabase = getClient();
  const { data: existing } = await supabase.from("leads").select("id, contact_name, stage").eq("interaction_id", interaction_id).single();
  if (existing) return ok({ lead: existing, criado: false }, `Lead já existe para esta interação: ${existing.contact_name}`, "Lead já registrado — use atualizar_lead ou agendar_visita");
  const { data: lead, error } = await supabase.from("leads").insert({ organization_id: NITSCLEAN_ORG_ID, contact_name: nome, contact_phone: telefone ?? null, contact_email: email ?? null, title: empresa ? `${nome} — ${empresa}` : nome, stage: "novo", source: canal.toLowerCase(), canal_origem: canal, origem_especifica: origem_especifica ?? null, interaction_id, instagram_handle: instagram_handle ?? null, description: mensagem_inicial ?? produto_interesse ?? null, category: produto_interesse ?? null, position: 0 }).select("id, contact_name, stage").single();
  if (error) return fail(`Erro ao criar lead: ${error.message}`, "Tente novamente ou registre manualmente no Fera");
  await logInteraction(supabase, "criar_lead", params, ok(lead), lead!.id, canal, interaction_id);
  return ok({ lead, criado: true }, `Lead criado: ${nome}`, "Pergunte sobre a necessidade e use verificar_cobertura_regiao ou agendar_visita");
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
  const allowedFields: Record<string, string> = { nome: "contact_name", telefone: "contact_phone", email: "contact_email", empresa: "title", produto_interesse: "category", notas: "description", valor_estimado: "value" };
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(updates)) { updatePayload[allowedFields[key] ?? key] = value; }
  const { data: lead, error } = await supabase.from("leads").update(updatePayload).eq("id", leadId).eq("organization_id", NITSCLEAN_ORG_ID).select("id, contact_name, stage").single();
  if (error) return fail(`Erro ao atualizar lead: ${error.message}`);
  return ok({ lead }, `Lead atualizado: ${lead!.contact_name}`, "Continue o atendimento ou agende uma visita");
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
  return ok({ registrado: true, lead_id: leadId }, "Interação registrada", "Continue o fluxo de atendimento");
}

// ─── BLOCK 3 — SCHEDULING ─────────────────────────────────────────────────────

async function listarHorariosDisponiveis(params: Record<string, unknown>): Promise<McpResponse> {
  const { cidade, data_preferida } = params as { cidade?: string; data_preferida?: string };
  const supabase = getClient();
  let dia_semana: string | null = null;
  if (cidade) {
    const { data: areas } = await supabase.from("ekkoa_coverage_areas").select("dia_semana").eq("organization_id", NITSCLEAN_ORG_ID).eq("is_active", true).ilike("city", `%${cidade}%`).limit(1);
    if (areas && areas.length > 0) dia_semana = areas[0].dia_semana;
  }
  const diasNomes: Record<string, number> = { monday: 1, segunda: 1, "1": 1, tuesday: 2, terca: 2, "2": 2, wednesday: 3, quarta: 3, "3": 3, thursday: 4, quinta: 4, "4": 4, friday: 5, sexta: 5, "5": 5 };
  const today = new Date();
  const targetDow = dia_semana ? (diasNomes[dia_semana.toLowerCase()] ?? null) : null;
  let nextDate = new Date(today);
  if (targetDow !== null) {
    const currentDow = today.getDay();
    let daysUntil = targetDow - currentDow;
    if (daysUntil <= 0) daysUntil += 7;
    nextDate = new Date(today.getTime() + daysUntil * 86400000);
  } else if (data_preferida) {
    nextDate = new Date(data_preferida);
  }
  const dateStr = nextDate.toISOString().split("T")[0];
  const { data: existingSchedules } = await supabase.from("schedules").select("start_time").eq("organization_id", NITSCLEAN_ORG_ID).eq("scheduled_date", dateStr).in("status", ["agendado", "confirmado"]);
  const allSlots = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
  const occupiedTimes = (existingSchedules ?? []).map((s) => s.start_time?.substring(0, 5));
  const available = allSlots.filter((t) => !occupiedTimes.includes(t));
  const diasPtbr: Record<number, string> = { 0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado" };
  const dowName = diasPtbr[nextDate.getDay()] ?? "";
  return ok({ data: dateStr, dia_semana: dowName, horarios_disponiveis: available, total_disponivel: available.length }, `${available.length} horários disponíveis para ${dowName} ${dateStr}`, available.length > 0 ? "Apresente os horários ao cliente e use agendar_visita quando ele confirmar" : "Nenhum horário disponível nesta data — sugira a próxima semana");
}

async function agendarVisita(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, nome_contato, empresa, telefone, data_visita, horario, cidade, produto_interesse, notas } = params as { lead_id?: string; interaction_id?: string; nome_contato: string; empresa?: string; telefone?: string; data_visita: string; horario: string; cidade?: string; produto_interesse?: string; notas?: string };
  if (!data_visita || !horario) return fail("data_visita e horario são obrigatórios", "Confirme data e horário com o cliente antes de agendar");
  if (!nome_contato) return fail("nome_contato é obrigatório");
  const supabase = getClient();
  let leadId = lead_id;
  let clientId: string | null = null;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id, client_id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
    clientId = data?.client_id;
  }
  const title = empresa ? `Visita NitsClean — ${empresa} [${produto_interesse ?? "Ekkoa"}]` : `Visita NitsClean — ${nome_contato} [${produto_interesse ?? "Ekkoa"}]`;
  const startTime = `${horario}:00`;
  const endHour = parseInt(horario.split(":")[0]) + 1;
  const endTime = `${String(endHour).padStart(2, "0")}:00:00`;
  const { data: schedule, error } = await supabase.from("schedules").insert({ organization_id: NITSCLEAN_ORG_ID, title, scheduled_date: data_visita, start_time: startTime, end_time: endTime, schedule_type: "visita_comercial", status: "agendado", location: cidade ?? null, notes: [notas, telefone ? `Tel: ${telefone}` : null, produto_interesse ? `Produto: ${produto_interesse}` : null, interaction_id ? `Flora interaction_id: ${interaction_id}` : null].filter(Boolean).join(" | "), client_id: clientId ?? null }).select("id, title, scheduled_date, start_time, status").single();
  if (error) return fail(`Erro ao criar agendamento: ${error.message}`);
  if (leadId) await supabase.from("leads").update({ stage: "agendado", updated_at: new Date().toISOString() }).eq("id", leadId);
  await logInteraction(supabase, "agendar_visita", params, ok(schedule), leadId, undefined, interaction_id);
  const dataFormatada = new Date(data_visita + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return ok({ agendamento: schedule, lead_id: leadId }, `Visita agendada para ${dataFormatada} às ${horario}h`, `Confirme com o cliente: "${title} em ${dataFormatada} às ${horario}h. Nosso consultor entrará em contato."`);
}

async function cancelarReagendarVisita(params: Record<string, unknown>): Promise<McpResponse> {
  const { schedule_id, interaction_id, acao, nova_data, novo_horario, motivo } = params as { schedule_id?: string; interaction_id?: string; acao: "cancelar" | "reagendar"; nova_data?: string; novo_horario?: string; motivo?: string };
  const supabase = getClient();
  let schedId = schedule_id;
  if (!schedId && interaction_id) {
    const { data } = await supabase.from("schedules").select("id").ilike("notes", `%${interaction_id}%`).limit(1).single();
    schedId = data?.id;
  }
  if (!schedId) return fail("Agendamento não encontrado", "Consulte o Fera para encontrar o agendamento");
  if (acao === "cancelar") {
    const { error } = await supabase.from("schedules").update({ status: "cancelado", notes: motivo ? `Cancelado: ${motivo}` : "Cancelado via Flora" }).eq("id", schedId);
    if (error) return fail(`Erro ao cancelar: ${error.message}`);
    return ok({ cancelado: true }, "Agendamento cancelado", "Ofereça uma nova data ao cliente se quiser reagendar");
  }
  if (acao === "reagendar") {
    if (!nova_data || !novo_horario) return fail("Forneça nova_data e novo_horario para reagendar");
    const endHour = parseInt(novo_horario.split(":")[0]) + 1;
    const { data: updated, error } = await supabase.from("schedules").update({ scheduled_date: nova_data, start_time: `${novo_horario}:00`, end_time: `${String(endHour).padStart(2, "0")}:00:00`, status: "agendado", notes: motivo ? `Reagendado: ${motivo}` : "Reagendado via Flora" }).eq("id", schedId).select("id, scheduled_date, start_time").single();
    if (error) return fail(`Erro ao reagendar: ${error.message}`);
    return ok({ reagendado: true, agendamento: updated }, `Reagendado para ${nova_data} às ${novo_horario}h`);
  }
  return fail(`Ação inválida: ${acao}. Use "cancelar" ou "reagendar"`);
}

// ─── BLOCK 4 — CRM PIPELINE ───────────────────────────────────────────────────

const VALID_STAGES = ["novo", "qualificado", "proposta", "agendado", "ganho", "perdido"];

async function moverLeadEstagio(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, novo_estagio, motivo } = params as { lead_id?: string; interaction_id?: string; novo_estagio: string; motivo?: string };
  if (!VALID_STAGES.includes(novo_estagio)) return fail(`Estágio inválido: ${novo_estagio}`, `Estágios válidos: ${VALID_STAGES.join(", ")}`);
  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
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
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
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
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
  if (!leadId) return fail("Lead não encontrado");
  const { data: current } = await supabase.from("leads").select("flora_tags").eq("id", leadId).single();
  const existingTags: string[] = current?.flora_tags ?? [];
  const newTags = [...new Set([...existingTags, ...tags])];
  const { error } = await supabase.from("leads").update({ flora_tags: newTags, updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) return fail(`Erro: ${error.message}`);
  return ok({ tags: newTags }, `Tags adicionadas: ${tags.join(", ")}`);
}

// ─── BLOCK 5 — ROUTING ────────────────────────────────────────────────────────

async function solicitarAtendimentoHumano(params: Record<string, unknown>): Promise<McpResponse> {
  const { lead_id, interaction_id, motivo, urgencia } = params as { lead_id?: string; interaction_id?: string; motivo?: string; urgencia?: "baixa" | "media" | "alta" };
  const supabase = getClient();
  let leadId = lead_id;
  if (!leadId && interaction_id) {
    const { data } = await supabase.from("leads").select("id").eq("interaction_id", interaction_id).single();
    leadId = data?.id;
  }
  if (leadId) await supabase.from("leads").update({ precisa_humano: true, description: motivo ? `⚠️ HUMANO: ${motivo}` : "⚠️ Solicitou atendimento humano", updated_at: new Date().toISOString() }).eq("id", leadId);
  await logInteraction(supabase, "solicitar_atendimento_humano", params, ok({ solicitado: true }), leadId, undefined, interaction_id);
  return ok({ solicitado: true, urgencia: urgencia ?? "media" }, "Atendimento humano solicitado — Arilson será notificado", "Informe ao cliente: 'Vou chamar um especialista da NitsClean para te atender. Ele entrará em contato em breve!'");
}

async function registrarForaCobertura(params: Record<string, unknown>): Promise<McpResponse> {
  const { nome, telefone, instagram_handle, cidade, interaction_id, canal, produto_interesse } = params as { nome?: string; telefone?: string; instagram_handle?: string; cidade: string; interaction_id?: string; canal?: string; produto_interesse?: string };
  if (!cidade) return fail("Cidade é obrigatória para registrar fora da cobertura");
  const supabase = getClient();
  const { error } = await supabase.from("leads").upsert({ organization_id: NITSCLEAN_ORG_ID, contact_name: nome ?? "Contato Anônimo", contact_phone: telefone ?? null, instagram_handle: instagram_handle ?? null, title: `Fora de cobertura — ${cidade}`, stage: "perdido", source: canal?.toLowerCase() ?? "whatsapp", canal_origem: (canal ?? "WHATSAPP") as string, interaction_id: interaction_id ?? null, fora_cobertura: true, category: produto_interesse ?? null, description: `Lead fora da área de cobertura. Cidade: ${cidade}` }, { onConflict: "interaction_id" });
  if (error && !error.message.includes("duplicate")) return fail(`Erro ao registrar: ${error.message}`);
  return ok({ registrado: true, cidade }, `Lead em ${cidade} registrado — fora da cobertura atual`, "Informe ao cliente: 'No momento não atendemos sua região, mas já registramos seu interesse. Quando expandirmos, entraremos em contato!'");
}

// ─── TOOL MANIFEST ────────────────────────────────────────────────────────────

const TOOLS_MANIFEST = [
  { name: "buscar_contato", description: "Busca cliente ou lead existente por telefone ou @instagram", parameters: { type: "object", properties: { telefone: { type: "string" }, instagram_handle: { type: "string" } } } },
  { name: "verificar_cobertura_regiao", description: "Verifica se a cidade/CEP está na área de cobertura e retorna o dia de visita", parameters: { type: "object", properties: { cidade: { type: "string" }, cep: { type: "string" } } } },
  { name: "obter_promocao_vigente", description: "Retorna promoções e destaques de produtos ativos da NitsClean", parameters: { type: "object", properties: {} } },
  { name: "consultar_produto", description: "Busca informações de produto por nome ou categoria", parameters: { type: "object", properties: { nome: { type: "string" }, categoria: { type: "string" } } } },
  { name: "criar_lead", description: "Registra um novo lead no CRM do Fera. Idempotente via interaction_id.", parameters: { type: "object", required: ["nome", "canal", "interaction_id"], properties: { nome: { type: "string" }, telefone: { type: "string" }, email: { type: "string" }, empresa: { type: "string" }, canal: { type: "string", enum: ["WIDGET", "WHATSAPP", "MESSENGER", "INSTAGRAM", "TELEGRAM"] }, origem_especifica: { type: "string", enum: ["DM", "COMMENT", "QR_PRODUTO", "ANUNCIO_PAGO", "WIDGET_DIRECT"] }, interaction_id: { type: "string" }, instagram_handle: { type: "string" }, produto_interesse: { type: "string" }, cidade: { type: "string" }, mensagem_inicial: { type: "string" } } } },
  { name: "atualizar_lead", description: "Atualiza dados de um lead existente", parameters: { type: "object", properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, nome: { type: "string" }, telefone: { type: "string" }, email: { type: "string" }, empresa: { type: "string" }, produto_interesse: { type: "string" }, notas: { type: "string" }, valor_estimado: { type: "number" } } } },
  { name: "registrar_interacao", description: "Registra um evento/interação no histórico do lead", parameters: { type: "object", required: ["tipo", "notas"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, tipo: { type: "string", enum: ["mensagem", "ligacao", "email", "reuniao", "demo", "outro"] }, notas: { type: "string" }, canal: { type: "string" } } } },
  { name: "listar_horarios_disponiveis", description: "Lista horários disponíveis para agendamento na cidade do cliente", parameters: { type: "object", properties: { cidade: { type: "string" }, data_preferida: { type: "string" } } } },
  { name: "agendar_visita", description: "Cria um agendamento de visita no Fera", parameters: { type: "object", required: ["nome_contato", "data_visita", "horario"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, nome_contato: { type: "string" }, empresa: { type: "string" }, telefone: { type: "string" }, data_visita: { type: "string" }, horario: { type: "string" }, cidade: { type: "string" }, produto_interesse: { type: "string" }, notas: { type: "string" } } } },
  { name: "cancelar_reagendar_visita", description: "Cancela ou reagenda uma visita existente", parameters: { type: "object", required: ["acao"], properties: { schedule_id: { type: "string" }, interaction_id: { type: "string" }, acao: { type: "string", enum: ["cancelar", "reagendar"] }, nova_data: { type: "string" }, novo_horario: { type: "string" }, motivo: { type: "string" } } } },
  { name: "mover_lead_estagio", description: "Move um lead para outro estágio do funil CRM", parameters: { type: "object", required: ["novo_estagio"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, novo_estagio: { type: "string", enum: ["novo", "qualificado", "proposta", "agendado", "ganho", "perdido"] }, motivo: { type: "string" } } } },
  { name: "atribuir_responsavel", description: "Atribui um lead a um consultor/vendedor pelo nome", parameters: { type: "object", required: ["responsavel_nome"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, responsavel_nome: { type: "string" } } } },
  { name: "adicionar_tag", description: "Adiciona tags/labels a um lead para segmentação", parameters: { type: "object", required: ["tags"], properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, tags: { type: "array", items: { type: "string" } } } } },
  { name: "solicitar_atendimento_humano", description: "Sinaliza que o lead precisa de atendimento humano e notifica Arilson", parameters: { type: "object", properties: { lead_id: { type: "string" }, interaction_id: { type: "string" }, motivo: { type: "string" }, urgencia: { type: "string", enum: ["baixa", "media", "alta"] } } } },
  { name: "registrar_fora_cobertura", description: "Registra um lead de cidade não coberta para expansão futura", parameters: { type: "object", required: ["cidade"], properties: { nome: { type: "string" }, telefone: { type: "string" }, instagram_handle: { type: "string" }, cidade: { type: "string" }, interaction_id: { type: "string" }, canal: { type: "string" }, produto_interesse: { type: "string" } } } },
];

// ─── ROUTER ───────────────────────────────────────────────────────────────────

async function routeTool(method: string, params: Record<string, unknown>): Promise<McpResponse> {
  switch (method) {
    case "buscar_contato": return buscarContato(params);
    case "verificar_cobertura_regiao": return verificarCoberturaRegiao(params);
    case "obter_promocao_vigente": return obterPromocaoVigente(params);
    case "consultar_produto": return consultarProduto(params);
    case "criar_lead": return criarLead(params);
    case "atualizar_lead": return atualizarLead(params);
    case "registrar_interacao": return registrarInteracao(params);
    case "listar_horarios_disponiveis": return listarHorariosDisponiveis(params);
    case "agendar_visita": return agendarVisita(params);
    case "cancelar_reagendar_visita": return cancelarReagendarVisita(params);
    case "mover_lead_estagio": return moverLeadEstagio(params);
    case "atribuir_responsavel": return atribuirResponsavel(params);
    case "adicionar_tag": return adicionarTag(params);
    case "solicitar_atendimento_humano": return solicitarAtendimentoHumano(params);
    case "registrar_fora_cobertura": return registrarForaCobertura(params);
    default: return fail(`Tool not found: ${method}`, `Tools disponíveis: ${TOOLS_MANIFEST.map((t) => t.name).join(", ")}`);
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (!authenticate(req)) return jsonRpcError(null, -32001, "Unauthorized");
  const url = new URL(req.url);
  if (url.pathname.endsWith("/health")) return new Response(JSON.stringify({ status: "ok", tools: TOOLS_MANIFEST.length }), { headers: CORS_HEADERS });
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
