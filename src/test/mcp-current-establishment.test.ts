import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
// Handoff behaviour depends on human-service hours: pin a weekday 11h (America/Sao_Paulo).
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-02T14:00:00Z"));

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const chat = "3DF9D839DDCF463A3A350ADF91C40B89-5521979047667";
const company = "Médico da dor - Dr. André Carmo";
const address = "R. Raul Veiga, 15 - Sl 304 - Centro, Cabo Frio";
const maps = "https://maps.google.com/?cid=1805549597522206352";
function harness(existingB = false, options: { leadProduct?: string; known?: boolean; audit?: any[] } = {}) {
  const person = { id: "person", nome: "Paulo Henrique", whatsapp: "5521979047667", chat_ids: [chat] };
  const leads: any[] = [{ id: "A", pessoa_id: "person", empresa_nome: "Belisquê Restaurante", city: "Araruama", category: "Suma Grill D9", endereco: "Rua Belisquê", stage: "novo" }];
  if (existingB) leads.push({ id: "B", pessoa_id: "person", empresa_nome: company, city: "Cabo Frio", stage: "novo", category: options.leadProduct });
  const audit = options.audit ?? [];
  const queries: any[] = [];
  const writes: any[] = [], tasks: Promise<void>[] = [];
  const fetch = vi.fn(async (_url: string, _options: any) => new Response("{}"));
  const client = { from(table: string) {
    let operation = "read", value: any; const filters: any[] = [];
    const extra: any[] = [];
    const result = (single = false) => {
      let data: any = null;
      if (operation !== "read") writes.push({ table, operation, value });
      queries.push({ table, filters, extra });
      if (table === "pessoas") data = options.known === false ? null : person;
      if (table === "products") data = [{ id: "soft", name: "SOFT CARE DES-E", brand: "DIVERSEY", disponibilidade: "sob_encomenda" }];
      if (table === "mcp_request_log" && filters.some(([k, v]) => k === "method" && v === "consultar_produto")) {
        data = audit.filter(row => filters.every(([k, v]) => row[k] === v) && extra.every(([op, k, v]) =>
          op === "contains" ? (k === "params" ? row.params.chat_id === v.chat_id : row.response.result.data.encontrado === true)
          : op === "gte" ? row[k] >= v : op === "lte" ? row[k] <= v : true))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
      } else if (table === "mcp_request_log") data = { response: { result: { data: { candidatos: [
        { nome: company, cidade: "Cabo Frio", endereco: address, bairro: "Centro", cep: "28907090", maps_url: maps, regiao: "Cabo Frio", place_id: "clinic" },
        { nome: "Outra clínica", cidade: "Cabo Frio", endereco: "Rua errada" },
      ] } } } };
      if (table === "leads") {
        if (operation === "insert") { data = { id: "B", ...value }; leads.push(data); }
        else { const found = leads.filter(l => filters.every(([k, v]) => k === "organization_id" || l[k] === v)); data = single ? found[0] ?? null : found; }
      }
      if (table === "holidays" || table === "notification_logs") data = [];
      if (table === "ekkoa_coverage_areas") data = [{ city: "Cabo Frio", dia_semana: "2ª feira", horario_inicio: "13:30", horario_fim: "16:30", consultant_user_id: "consultant" }];
      if (table === "schedules") data = { id: "schedule", ...value };
      if (table === "notification_recipients") data = [{ id: "recipient", nome: "Equipe", whatsapp: "5521999999999" }];
      return { data, error: null };
    };
    const chain: any = { select: () => chain, eq: (k: string, v: any) => { filters.push([k, v]); return chain; },
      contains: (k: string, v: any) => { extra.push(["contains", k, v]); return chain; },
      gte: (k: string, v: any) => { extra.push(["gte", k, v]); return chain; }, lte: (k: string, v: any) => { extra.push(["lte", k, v]); return chain; }, order: () => chain, limit: () => chain, or: () => chain, in: () => chain, ilike: () => chain, neq: () => chain,
      insert: (v: any) => { operation = "insert"; value = v; return chain; }, update: (v: any) => { operation = "update"; value = v; return chain; },
      maybeSingle: async () => result(true), single: async () => result(true), then: (resolve: any) => Promise.resolve(result()).then(resolve) };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: (k: string) => ["GPTMAKER_API_TOKEN", "GPTMAKER_WHATSAPP_CHANNEL_ID"].includes(k) ? "mock" : undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: (t: Promise<void>) => tasks.push(t) }, fetch, AbortSignal: { timeout: () => undefined }, Response, Request, URL, performance, crypto, console, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { writes, leads, fetch, queries, async route(method: string, params: any) {
    context.method = method; context.params = params;
    const result = await vm.runInContext("routeTool(method, params)", context); await Promise.all(tasks);
    if (method === "consultar_produto") audit.push({ method, params, success: result.success, response: { result }, created_at: new Date().toISOString() });
    return result;
  } };
}
const visit = { chat_id: chat, lead_id: "A", nome_contato: "PH", empresa: company, cidade: "Cabo Frio", produto_interesse: "Oxivir TB Pronto Uso", email: "ph@example.com", data_visita: "2026-11-09", horario: "14:00" };
describe("Current establishment integrity", () => {
  it("A then B with A ID books and notifies B, linked to the same person", async () => {
    const h = harness(); const result = await h.route("agendar_visita_tecnica", visit);
    expect(result.success).toBe(true); expect(result.data.lead_id).toBe("B");
    expect(h.writes.find(w => w.table === "leads" && w.operation === "insert").value).toMatchObject({ pessoa_id: "person", empresa_nome: company, endereco: address, city: "Cabo Frio", category: "Oxivir TB Pronto Uso", contact_email: "ph@example.com" });
    const schedule = h.writes.find(w => w.table === "schedules").value;
    expect(schedule).toMatchObject({ lead_id: "B", location: address, zip_code: "28907090" });
    expect(schedule.title).toBe(`Visita Comercial — ${company} — Cabo Frio [Oxivir TB Pronto Uso]`);
    expect(h.fetch.mock.calls, JSON.stringify(h.writes)).not.toHaveLength(0);
    const message = JSON.parse(h.fetch.mock.calls[0]?.[1]?.body ?? "{}").message;
    expect(message).toContain(address); expect(message).toContain(maps); expect(message).toContain("Oxivir TB Pronto Uso"); expect(message).not.toContain("Belisquê"); expect(message).not.toContain("Araruama");
    expect(result.data.mensagem_para_lead).toContain("Oxivir TB Pronto Uso");
    expect(h.leads[0].empresa_nome).toBe("Belisquê Restaurante");
  });
  it("same establishment rebooking reuses its open lead", async () => {
    const h = harness(true); const result = await h.route("agendar_visita_tecnica", visit);
    expect(result.data.lead_id).toBe("B"); expect(h.writes.filter(w => w.table === "leads" && w.operation === "insert")).toHaveLength(0);
    const again = await h.route("agendar_visita_tecnica", { ...visit, lead_id: "B" });
    expect(again.data.lead_id).toBe("B"); expect(h.writes.filter(w => w.table === "leads" && w.operation === "insert")).toHaveLength(0);
  });
  it.each(["PH", "não informado"])("prefers Paulo Henrique over %s", async nome_contato => {
    const h = harness(); await h.route("agendar_visita_tecnica", { ...visit, nome_contato });
    expect(h.writes.find(w => w.table === "schedules").value.notes).toContain("Contato: Paulo Henrique");
    expect(JSON.parse(h.fetch.mock.calls[0]?.[1]?.body ?? "{}").message).toContain("Paulo Henrique");
  });
  it("keeps a real single name like Carla instead of the registered person name", async () => {
    const h = harness(); await h.route("solicitar_atendimento_humano", { ...visit, nome_contato: "Carla", motivo: "Pedido de preço" });
    const message = h.writes.find(w => w.table === "notification_logs").value.payload.message;
    expect(message).toContain("Carla"); expect(message).not.toContain("Paulo Henrique");
    expect(h.writes.find(w => w.table === "leads" && w.operation === "insert").value.contact_name).toBe("Carla");
    const visit2 = harness(); const r2 = await visit2.route("agendar_visita_tecnica", { ...visit, nome_contato: "Carla" });
    expect(r2.success).toBe(true);
    expect(visit2.writes.find(w => w.table === "schedules").value.notes).toContain("Contato: Carla");
    expect(JSON.parse(visit2.fetch.mock.calls[0]?.[1]?.body ?? "{}").message).toContain("Carla");
  });
  it("handoff with stale A ID resolves B and keeps transfer event", async () => {
    const h = harness(); const r = await h.route("solicitar_atendimento_humano", { ...visit, motivo: "Pedido de preço" });
    expect(r.data.lead_id).toBe("B"); expect(r.data.lead_criado).toBe(true);
    const log = h.writes.find(w => w.table === "notification_logs").value;
    expect(log.event_type).toBe("transferencia"); expect(log.payload.message).toContain(company); expect(log.payload.message).toContain("Paulo Henrique"); expect(log.payload.message).toContain("Oxivir TB Pronto Uso"); expect(log.payload.message).not.toContain("Suma Grill");
    expect(h.writes.find(w => w.table === "leads" && w.operation === "update").value.precisa_humano).toBe(true);
  });
  it("handoff found by phone cannot reuse A for B", async () => {
    const h = harness(); const r = await h.route("solicitar_atendimento_humano", { ...visit, lead_id: undefined, telefone: "5521979047667", motivo: "Preço" });
    expect(r.data.lead_id).toBe("B");
    expect(h.leads.find(l => l.id === "B").pessoa_id).toBe("person");
    expect(h.writes.filter(w => w.table === "leads" && w.operation === "insert")).toHaveLength(1);
  });
  it("explicit current address/maps wins over the lookup candidate", async () => {
    const h = harness(true); await h.route("agendar_visita_tecnica", { ...visit, endereco: "Rua Atual, 42", maps_url: "https://maps.google.com/current" });
    expect(h.writes.find(w => w.table === "schedules").value.location).toBe("Rua Atual, 42");
    const message = JSON.parse(h.fetch.mock.calls[0]?.[1]?.body ?? "{}").message;
    expect(message).toContain("https://maps.google.com/current"); expect(message).not.toContain(address);
  });
  it("transfer without company/city completes the alert from the resolved lead", async () => {
    const h = harness();
    const r = await h.route("solicitar_atendimento_humano", { ...visit, empresa: undefined, cidade: undefined, motivo: "Pedido de preço" });
    expect(r.data.lead_id).toBe("A"); expect(r.data.lead_criado).toBe(false);
    const log = h.writes.find(w => w.table === "notification_logs").value;
    expect(log.payload.message).toContain("Cliente: Belisquê Restaurante — Paulo Henrique");
    expect(log.payload.message).toContain("Cidade: Araruama");
  });
  it("missing product/address never falls back to another company's A", async () => {
    const h = harness(); await h.route("agendar_visita_tecnica", { ...visit, chat_id: undefined, produto_interesse: undefined });
    const s = h.writes.find(w => w.table === "schedules").value;
    expect(s.title).not.toContain("Suma Grill"); expect(s.location).toBe("Cabo Frio");
  });
});

const history = (product: string, age = 1000, id = chat, encontrado = true, success = true) => ({
  method: "consultar_produto", params: { chat_id: id }, success,
  created_at: new Date(Date.now() - age).toISOString(),
  response: { result: { data: { encontrado, produtos: [{ nome: product }], produto_citado: product } } },
});
describe("Current chat product and minimal known contact", () => {
  it("Soft Care consultation then booking without product fills title and commercial alert", async () => {
    const h = harness();
    await h.route("consultar_produto", { termo: "Soft Care Des-E", chat_id: chat });
    const r = await h.route("agendar_visita_tecnica", { ...visit, produto_interesse: undefined });
    expect(r.success).toBe(true);
    expect(h.writes.find(w => w.table === "schedules").value.title).toBe(`Visita Comercial — ${company} — Cabo Frio [SOFT CARE DES-E]`);
    const log = h.writes.find(w => w.table === "notification_logs").value;
    expect(log.event_type).toBe("agendamento_comercial");
    expect(log.payload.message).toContain("Produto: SOFT CARE DES-E");
    expect(log.payload.message).not.toContain("Suma Grill D9");
  });
  it("explicit product wins over same-company lead and chat history", async () => {
    const h = harness(true, { leadProduct: "Lead product", audit: [history("Chat product")] });
    await h.route("agendar_visita_tecnica", visit);
    expect(h.writes.find(w => w.table === "schedules").value.title).toContain("[Oxivir TB Pronto Uso]");
  });
  it.each([undefined, "não informado", ""])("same-company lead wins over chat for missing product %s", async produto_interesse => {
    const h = harness(true, { leadProduct: "Lead product", audit: [history("Chat product")] });
    await h.route("agendar_visita_tecnica", { ...visit, produto_interesse });
    expect(h.writes.find(w => w.table === "schedules").value.title).toContain("[Lead product]");
  });
  it("handoff uses the most recent found product, skipping failed, unmatched and other-chat calls", async () => {
    const h = harness(false, { audit: [history("Old", 8000), history("SOFT CARE DES-E", 5000), history("Wrong chat", 1000, "other"), history("Not found", 500, chat, false), history("Failed", 100, chat, true, false)] });
    await h.route("solicitar_atendimento_humano", { ...visit, produto_interesse: undefined, motivo: "Preço" });
    expect(h.writes.find(w => w.table === "notification_logs").value.payload.message).toContain("Produto: SOFT CARE DES-E");
    expect(h.leads.find(l => l.id === "B").category).toBe("SOFT CARE DES-E");
  });
  it("history older than 24h cannot fill product", async () => {
    const h = harness(false, { audit: [history("Expired", 86400001)] });
    await h.route("agendar_visita_tecnica", { ...visit, produto_interesse: undefined });
    expect(h.writes.find(w => w.table === "schedules").value.title).not.toContain("[");
  });
  it.each(["consultar_produto", "localizar_estabelecimento"])("%s reveals only Paulo Henrique for the trusted phone", async method => {
    const h = harness();
    const r = await h.route(method, { chat_id: chat, termo: "Soft Care Des-E", nome: "OWN Búzios Beach Hotel" });
    expect(r.data.contato_conhecido).toEqual({ nome: "Paulo Henrique" });
    const q = h.queries.find(q => q.table === "pessoas");
    expect(q.filters).toContainEqual(["organization_id", "7fd8333b-578a-4db8-b1be-fdcb8339d4e8"]);
    expect(q.filters).toContainEqual(["whatsapp", "5521979047667"]);
    expect(h.writes.filter(w => w.table === "pessoas")).toHaveLength(0);
  });
  it.each(["consultar_produto", "localizar_estabelecimento"])("%s returns null for an unknown phone", async method => {
    const h = harness(false, { known: false });
    const r = await h.route(method, { chat_id: "3DF9D839DDCF463A3A350ADF91C40B89-5521999999999", termo: "Soft Care Des-E", nome: "Hotel" });
    expect(r.data.contato_conhecido).toBeNull();
  });
});
