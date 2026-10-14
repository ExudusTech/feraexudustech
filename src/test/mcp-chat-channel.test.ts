import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const whatsapp = "3DF9D839DDCF463A3A350ADF91C40B89-5521979047667";
type Query = { table: string; operation: string; value?: any; filters: any[] };

function harness(options: { person?: any; openLeads?: any[]; phoneMatch?: boolean; channelMatch?: boolean; personError?: boolean } = {}) {
  const queries: Query[] = [];
  const tasks: Promise<void>[] = [];
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const contact = { id: "contact", name: "PH", client_id: "client", clients: { name: "Empresa" } };
  const client = { from(table: string) {
    const query: Query = { table, operation: "read", filters: [] };
    const result = () => {
      queries.push(query);
      if (query.operation !== "read") return { error: null, data: { id: table === "pessoas" ? "person" : "new-lead", ...query.value } };
      if (table === "pessoas") return { error: options.personError ? { message: "lookup failed" } : null, data: options.person ?? null };
      if (table === "client_contacts") return { error: null, data:
        (options.phoneMatch && query.filters.some(f => f[0] === "in")) || options.channelMatch ? [contact] : [] };
      const isPersonLeads = table === "leads" && query.filters.some(f => f[1] === "pessoa_id");
      return { data: isPersonLeads ? options.openLeads ?? [] : null, error: null };
    };
    const chain: any = {
      select: () => chain,
      eq: (...args: any[]) => { query.filters.push(["eq", ...args]); return chain; },
      in: (...args: any[]) => { query.filters.push(["in", ...args]); return chain; },
      ilike: (...args: any[]) => { query.filters.push(["ilike", ...args]); return chain; },
      gte: (...args: any[]) => { query.filters.push(["gte", ...args]); return chain; },
      order: (...args: any[]) => { query.filters.push(["order", ...args]); return chain; },
      limit: (...args: any[]) => { query.filters.push(["limit", ...args]); return chain; },
      insert: (value: any) => { query.operation = "insert"; query.value = value; return chain; },
      update: (value: any) => { query.operation = "update"; query.value = value; return chain; },
      upsert: (value: any) => { query.operation = "upsert"; query.value = value; return chain; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client,
    Deno: { env: { get: (key: string) => key === "MCP_BEARER_TOKEN" ? "test-token" : undefined },
      serve: (fn: typeof handler) => { handler = fn; } },
    EdgeRuntime: { waitUntil: (task: Promise<void>) => tasks.push(task) },
    console, Response, Request, URL, performance, TextEncoder, crypto,
  });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, context);
  return { queries, tasks,
    resolve: (id: unknown) => { context.chatId = id; return vm.runInContext("resolveChannelFromChatId(chatId)", context); },
    enrich: (params: any, method = "criar_lead") => { context.input = params; context.method = method;
      return vm.runInContext("applyChatChannel(method, input)", context); },
    route: (method: string, params: any) => { context.input = params; context.method = method;
      return vm.runInContext("routeTool(method, input)", context); },
    handler: (req: Request) => handler(req),
  };
}

describe("trusted GPT Maker chat channel", () => {
  it.each([
    [whatsapp, "WHATSAPP", "5521979047667"],
    ["3E081F8C517E26FF46107A02E12740D2-psid-123", "INSTAGRAM", "psid-123"],
    ["3E082145442EE648F743C673F12AF2BE-123", "MESSENGER", "123"],
    ["3E08E0CA2B9116C7F54E966EEA33054D-site-session", "WIDGET", "site-session"],
    ["3E0F16F36DFEF0E420EC0EFA190C3F41-dev", "WIDGET", "dev"],
    ["public-api-test-session", "WIDGET", "test-session"],
  ])("resolves %s preserving the contact suffix", (id, canal, identificador) => {
    expect(harness().resolve(id)).toEqual({ canal, identificador });
  });
  it.each([undefined, null, "", "unknown-contact", "invalid", "3DF9D839DDCF463A3A350ADF91C40B89-"])
  ("leaves unresolved ID %s unchanged", (chat_id) => {
    const h = harness();
    const params = { chat_id, canal: "WIDGET", canal_id: "legacy" };
    expect(h.resolve(chat_id)).toBeNull();
    expect(h.enrich(params)).toEqual(params);
  });
  it("overrides the real erroneous WIDGET input without mutating it", () => {
    const params = { chat_id: whatsapp, canal_tipo: "WIDGET", canal_id: "webchat", canal: "WIDGET", canal_origem: "WIDGET" };
    expect(harness().enrich(params, "buscar_contato")).toMatchObject({
      canal_tipo: "WHATSAPP", canal_id: "5521979047667", canal: "WHATSAPP", canal_origem: "WHATSAPP", telefone: "5521979047667",
    });
    expect(params.canal_tipo).toBe("WIDGET");
  });
  it("uses Instagram UID for lookup, not a handle", async () => {
    const h = harness();
    await h.route("buscar_contato", { chat_id: "3E081F8C517E26FF46107A02E12740D2-123", canal_tipo: "WIDGET" });
    expect(h.queries[0].filters).toContainEqual(["eq", "instagram_user_id", "123"]);
  });
  it("finds WhatsApp contact by phone after channel lookup misses", async () => {
    const h = harness({ phoneMatch: true });
    const result = await h.route("buscar_contato", { chat_id: whatsapp, canal_tipo: "WIDGET" });
    expect(result.data.encontrado).toBe(true);
    const contactQueries = h.queries.filter(q => q.table === "client_contacts");
    expect(contactQueries[0].filters).toContainEqual(["eq", "whatsapp_id", "5521979047667"]);
    expect(contactQueries[1].filters).toContainEqual(["in", "phone", ["5521979047667", "+5521979047667"]]);
    for (const query of h.queries) expect(query.filters).toContainEqual(["eq", "organization_id", org]);
  });
  it.each(["3E08E0CA2B9116C7F54E966EEA33054D-site", "public-api-test"])
  ("webchat stays unidentified without querying contacts", async (chat_id) => {
    const h = harness();
    expect((await h.route("buscar_contato", { chat_id, canal_tipo: "WHATSAPP" })).data.encontrado).toBe(false);
    expect(h.queries).toHaveLength(0);
  });
  it.each(["criar_lead", "registrar_fora_cobertura"])("%s uses WhatsApp channel and missing phone", async (method) => {
    const h = harness();
    const result = await h.route(method, { nome: "PH", cidade: "Cidade", telefone: "nao informado",
      canal: "WIDGET", canal_origem: "WIDGET", chat_id: whatsapp });
    expect(result.success).toBe(true);
    const write = h.queries.find(q => q.table === "leads" && q.operation !== "read");
    expect(write?.value).toMatchObject({ canal_origem: "WHATSAPP", source: "whatsapp", contact_phone: "5521979047667" });
    if (method === "criar_lead") expect(write?.value.gptmaker_chat_id).toBe(whatsapp);
  });
  it("preserves an explicitly supplied phone", async () => {
    const h = harness();
    await h.route("criar_lead", { nome: "PH", telefone: "21999999999", chat_id: whatsapp });
    expect(h.queries.find(q => q.table === "leads" && q.operation === "insert")?.value.contact_phone).toBe("21999999999");
  });
  it("reuses an open lead only for the same person and place", async () => {
    const person = { id: "person", nome: "PH", whatsapp: "5521979047667", chat_ids: [whatsapp] };
    const existing = { id: "recent", contact_name: "PH", stage: "novo", place_id: "place-1" };
    const h = harness({ person, openLeads: [existing] });
    const result = await h.route("criar_lead", { nome: "PH", empresa_nome: "Hotel A", cidade: "Cabo Frio", place_id: "place-1", chat_id: whatsapp, interaction_id: "different" });
    expect(result.data.criado).toBe(false);
    expect(result.data.lead.id).toBe("recent");
    expect(h.queries.some(q => q.table === "leads" && q.operation === "insert")).toBe(false);
  });
  it("creates two leads for the same person at different establishments", async () => {
    const person = { id: "person", nome: "PH", whatsapp: "5521979047667", chat_ids: [whatsapp] };
    const h = harness({ person, openLeads: [{ id: "hotel-a", stage: "novo", place_id: "place-a" }] });
    const result = await h.route("criar_lead", { nome: "PH", empresa_nome: "Hotel B", cidade: "Búzios", place_id: "place-b", chat_id: whatsapp });
    expect(result.data.criado).toBe(true);
    expect(h.queries.find(q => q.table === "leads" && q.operation === "insert")?.value.pessoa_id).toBe("person");
  });
  it("does not create a lead if person lookup fails", async () => {
    const h = harness({ personError: true });
    expect((await h.route("criar_lead", { nome: "PH", chat_id: whatsapp })).success).toBe(false);
    expect(h.queries.every(q => q.operation === "read")).toBe(true);
  });
  it("absent chat_id preserves legacy channel and skips chat lookup", async () => {
    const h = harness();
    await h.route("criar_lead", { nome: "PH", canal: "INSTAGRAM", interaction_id: "legacy" });
    expect(h.queries.some(q => q.filters.some(f => f[1] === "gptmaker_chat_id"))).toBe(false);
    expect(h.queries.find(q => q.table === "leads" && q.operation === "insert")?.value).toMatchObject({ canal_origem: "INSTAGRAM", gptmaker_chat_id: null });
  });
  it("unknown chat ID is saved but does not override legacy channel", async () => {
    const h = harness();
    await h.route("criar_lead", { nome: "PH", chat_id: "unknown-123", canal: "MESSENGER" });
    expect(h.queries.find(q => q.table === "leads" && q.operation === "insert")?.value).toMatchObject({ canal_origem: "MESSENGER", gptmaker_chat_id: "unknown-123" });
  });
  it("links WhatsApp and Instagram conversations to the same person through email", async () => {
    const person = { id: "person", nome: "PH", email: "ph@example.com", whatsapp: "5521979047667", chat_ids: [whatsapp] };
    const h = harness({ person });
    await h.route("criar_lead", { nome: "PH", email: "PH@example.com", empresa_nome: "Hotel", cidade: "Búzios",
      chat_id: "3E081F8C517E26FF46107A02E12740D2-instagram-1" });
    const personQueries = h.queries.filter(q => q.table === "pessoas" && q.operation === "read");
    expect(personQueries.some(q => q.filters.some(f => f[0] === "ilike" && f[1] === "email"))).toBe(true);
    expect(h.queries.find(q => q.table === "leads" && q.operation === "insert")?.value.pessoa_id).toBe("person");
  });
  it("buscar_contato returns the person and up to five linked leads", async () => {
    const person = { id: "person", nome: "PH", whatsapp: "5521979047667", chat_ids: [whatsapp] };
    const leads = [{ id: "lead-1", empresa_nome: "Hotel A", city: "Búzios", stage: "novo", category: "Higiene" }];
    const result = await harness({ person, openLeads: leads }).route("buscar_contato", { chat_id: whatsapp });
    expect(result.data.pessoa).toEqual({ id: "person", nome: "PH" });
    expect(result.data.leads_da_pessoa).toEqual([{ id: "lead-1", empresa: "Hotel A", cidade: "Búzios", estagio: "novo", produto: "Higiene" }]);
  });
  it("audits original wrong channel while the tool receives trusted channel", async () => {
    const h = harness();
    const params = { nome: "PH", chat_id: whatsapp, canal: "WIDGET", telefone: "nao informado" };
    const response = await h.handler(new Request("http://localhost/mcp", { method: "POST",
      headers: { Authorization: "Bearer test-token" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "criar_lead", params }) }));
    expect((await response.json()).result.success).toBe(true);
    await Promise.all(h.tasks);
    const audit = h.queries.filter(q => q.table === "mcp_request_log");
    expect(audit).toHaveLength(1);
    expect(audit[0].value.params).toEqual(params);
  });
});