import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const whatsapp = "3DF9D839DDCF463A3A350ADF91C40B89-5521979047667";
type Query = { table: string; operation: string; value?: any; filters: any[] };

function harness(options: { existing?: any; phoneMatch?: boolean; channelMatch?: boolean; chatError?: boolean } = {}) {
  const queries: Query[] = [];
  const tasks: Promise<void>[] = [];
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const contact = { id: "contact", name: "PH", client_id: "client", clients: { name: "Empresa" } };
  const client = { from(table: string) {
    const query: Query = { table, operation: "read", filters: [] };
    const result = () => {
      queries.push(query);
      if (query.operation !== "read") return { error: null, data: { id: "new-lead", ...query.value } };
      if (table === "client_contacts") return { error: null, data:
        (options.phoneMatch && query.filters.some(f => f[0] === "in")) || options.channelMatch ? [contact] : [] };
      const isChat = query.filters.some(f => f[1] === "gptmaker_chat_id");
      return { data: isChat ? options.existing ?? null : null,
        error: isChat && options.chatError ? { message: "lookup failed" } : null };
    };
    const chain: any = {
      select: () => chain,
      eq: (...args: any[]) => { query.filters.push(["eq", ...args]); return chain; },
      in: (...args: any[]) => { query.filters.push(["in", ...args]); return chain; },
      gte: (...args: any[]) => { query.filters.push(["gte", ...args]); return chain; },
      order: (...args: any[]) => { query.filters.push(["order", ...args]); return chain; },
      limit: (...args: any[]) => { query.filters.push(["limit", ...args]); return chain; },
      insert: (value: any) => { query.operation = "insert"; query.value = value; return chain; },
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
    expect(h.queries[0].filters).toContainEqual(["eq", "whatsapp_id", "5521979047667"]);
    expect(h.queries[1].filters).toContainEqual(["in", "phone", ["5521979047667", "+5521979047667"]]);
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
    expect(h.queries.find(q => q.operation === "insert")?.value.contact_phone).toBe("21999999999");
  });
  it("reuses a same-tenant recent chat lead without writes", async () => {
    const existing = { id: "recent", contact_name: "PH", stage: "novo" };
    const h = harness({ existing });
    const before = Date.now();
    const result = await h.route("criar_lead", { nome: "PH", chat_id: whatsapp, interaction_id: "different" });
    expect(result.data).toEqual({ lead: existing, criado: false });
    expect(h.queries).toHaveLength(1);
    expect(h.queries[0].filters).toContainEqual(["eq", "organization_id", org]);
    expect(h.queries[0].filters).toContainEqual(["eq", "gptmaker_chat_id", whatsapp]);
    const cutoff = h.queries[0].filters.find(f => f[0] === "gte");
    expect(cutoff?.[1]).toBe("created_at");
    expect(Math.abs(Date.parse(cutoff?.[2]) - (before - 86400000))).toBeLessThan(1000);
  });
  it("creates when no lead meets the 24-hour query", async () => {
    const h = harness();
    expect((await h.route("criar_lead", { nome: "PH", chat_id: whatsapp })).data.criado).toBe(true);
    expect(h.queries.some(q => q.operation === "insert" && q.table === "leads")).toBe(true);
  });
  it("does not create a duplicate if chat lookup fails", async () => {
    const h = harness({ chatError: true });
    expect((await h.route("criar_lead", { nome: "PH", chat_id: whatsapp })).success).toBe(false);
    expect(h.queries.every(q => q.operation === "read")).toBe(true);
  });
  it("absent chat_id preserves legacy channel and skips chat lookup", async () => {
    const h = harness();
    await h.route("criar_lead", { nome: "PH", canal: "INSTAGRAM", interaction_id: "legacy" });
    expect(h.queries.some(q => q.filters.some(f => f[1] === "gptmaker_chat_id"))).toBe(false);
    expect(h.queries.find(q => q.operation === "insert")?.value).toMatchObject({ canal_origem: "INSTAGRAM", gptmaker_chat_id: null });
  });
  it("unknown chat ID is saved but does not override legacy channel", async () => {
    const h = harness();
    await h.route("criar_lead", { nome: "PH", chat_id: "unknown-123", canal: "MESSENGER" });
    expect(h.queries.find(q => q.operation === "insert")?.value).toMatchObject({ canal_origem: "MESSENGER", gptmaker_chat_id: "unknown-123" });
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