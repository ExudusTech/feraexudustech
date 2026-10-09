import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");

function harness(category: string | null = "Diversey", areas = [
  { dia_semana: "2ª feira e 6ª feira", horario_inicio: "13:30:00", horario_fim: "16:30:00" },
]) {
  const writes: { table: string; operation: string; value: any }[] = [];
  const reads: { table: string; filters: any[] }[] = [];
  const tasks: Promise<void>[] = [];
  const client = { from(table: string) {
    let operation = "read";
    let value: any;
    const filters: any[] = [];
    const result = () => {
      if (operation === "read") reads.push({ table, filters });
      else writes.push({ table, operation, value });
      return { error: null, data: table === "ekkoa_coverage_areas" ? areas
        : table === "leads" ? { id: "lead", category, client_id: null }
        : table === "schedules" ? { id: "schedule", ...value } : null };
    };
    const chain: any = {
      select: () => chain,
      eq: (...args: any[]) => { filters.push(args); return chain; },
      ilike: (...args: any[]) => { filters.push(args); return chain; },
      insert: (data: any) => { operation = "insert"; value = data; return chain; },
      update: (data: any) => { operation = "update"; value = data; return chain; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  } };
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const context = vm.createContext({
    createClient: () => client,
    Deno: { env: { get: (key: string) => key === "MCP_BEARER_TOKEN" ? "test-token" : undefined },
      serve: (fn: typeof handler) => { handler = fn; } },
    EdgeRuntime: { waitUntil: (task: Promise<void>) => tasks.push(task) },
    console, Response, Request, URL, performance, TextEncoder, crypto,
  });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, context);
  return {
    writes, reads, tasks,
    route: (params: any, method = "agendar_visita_tecnica") => {
      context.testParams = params; context.testMethod = method;
      return vm.runInContext("routeTool(testMethod, testParams)", context);
    },
    normalize: (params: any) => { context.testParams = params; return vm.runInContext("normalizeParamValue(testParams)", context); },
    handler: (req: Request) => handler(req),
  };
}

const visit = { lead_id: "lead", nome_contato: "Contato", empresa: "Empresa",
  cidade: "Cabo Frio", data_visita: "2026-10-12", horario: "13:30", interaction_id: "test" };

describe("MCP visit scheduling", () => {
  it.each(["agendar_visita_tecnica", "agendar_visita"])("%s resolves lead product", async (method) => {
    const h = harness();
    const result = await h.route(visit, method);
    expect(result.success).toBe(true);
    expect(h.writes.find(w => w.table === "schedules")?.value.title).toContain("[Diversey]");
    expect(JSON.stringify(result)).not.toContain("Ekkoa");
  });
  it("explicit product takes precedence without category lookup", async () => {
    const h = harness();
    const result = await h.route({ ...visit, produto_interesse: "Outro produto" });
    expect(result.data.mensagem_para_lead).toContain("Outro produto");
    expect(h.reads.some(r => r.table === "leads")).toBe(false);
  });
  it.each([null, "não informado", "{{produto}}"])("missing category %s stays product-neutral", async (category) => {
    const h = harness(category);
    const result = await h.route({ ...visit, produto_interesse: "nao informado" });
    expect(result.data.agendamento.title).not.toContain("[");
    expect(result.data.mensagem_para_lead).toContain("soluções ideais");
    expect(JSON.stringify(h.writes)).not.toContain("Ekkoa");
  });
  it("resolves product after finding lead by interaction", async () => {
    const h = harness();
    const result = await h.route({ ...visit, lead_id: "{{lead}}" });
    expect(result.data.agendamento.title).toContain("[Diversey]");
  });
  it.each(["13:00", "16:31"])("rejects %s without operational writes", async (horario) => {
    const h = harness();
    const result = await h.route({ ...visit, horario });
    expect(result.success).toBe(false);
    expect(result.data.janelas).toEqual([{ inicio: "13:30", fim: "16:30" }]);
    expect(result.data.mensagem_para_lead).toContain("das 13h30 às 16h30");
    expect(h.writes).toEqual([]);
    expect(h.reads[0].filters).toContainEqual(["city", "Cabo Frio"]);
  });
  it.each(["13:30", "16:30"])("accepts boundary %s", async (horario) => {
    expect((await harness().route({ ...visit, horario })).success).toBe(true);
  });
  it("does not use another weekday's window", async () => {
    const h = harness("Diversey", [
      { dia_semana: "2ª feira", horario_inicio: "13:30:00", horario_fim: "16:30:00" },
      { dia_semana: "6ª feira", horario_inicio: "08:00:00", horario_fim: "18:00:00" },
    ]);
    expect((await h.route({ ...visit, horario: "09:00" })).success).toBe(false);
    expect(h.writes).toEqual([]);
  });
  it("rejects invalid weekday without operational writes", async () => {
    const h = harness();
    expect((await h.route({ ...visit, data_visita: "2026-10-13" })).success).toBe(false);
    expect(h.writes).toEqual([]);
  });
});

describe("MCP parameter normalization and audit preservation", () => {
  it.each([" nao informado ", "nao informada", "NÃO INFORMADO", "N/A", "na", "-", "nenhum", "nenhuma", "null", "undefined", "desconhecido", "sem", "", "{{algo}}"])("normalizes %s to null", (value) => {
    expect(harness().normalize({ field: value }).field).toBeNull();
  });
  it("normalizes nested strings without changing valid values or original params", () => {
    const h = harness();
    const input = { nested: { missing: "sem", name: "  Empresa  " }, list: ["n/a", 0, false] };
    expect(h.normalize(input)).toEqual({ nested: { missing: null, name: "  Empresa  " }, list: [null, 0, false] });
    expect(input.nested.missing).toBe("sem");
  });
  it("normalization applies to tools other than scheduling", async () => {
    const h = harness();
    expect((await h.route({ nome_contato: "{{nome}}" }, "agendar_reuniao_sede")).success).toBe(false);
    expect(h.writes).toEqual([]);
  });
  it("audits a rejected window exactly once with original params", async () => {
    const h = harness();
    const params = { ...visit, horario: "13:00", notas: "nao informado" };
    const response = await h.handler(new Request("http://localhost/mcp", { method: "POST",
      headers: { Authorization: "Bearer test-token" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "agendar_visita_tecnica", params }) }));
    expect((await response.json()).result.success).toBe(false);
    await Promise.all(h.tasks);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].table).toBe("mcp_request_log");
    expect(h.writes[0].value.params.notas).toBe("nao informado");
  });
  it("authentication rejection remains unchanged and never audits token", async () => {
    const h = harness();
    const response = await h.handler(new Request("http://localhost/mcp", { method: "POST",
      headers: { Authorization: "Bearer invalid-secret" }, body: "{}" }));
    expect((await response.json()).error.code).toBe(-32001);
    await Promise.all(h.tasks);
    expect(h.writes).toHaveLength(1);
    expect(JSON.stringify(h.writes)).not.toContain("invalid-secret");
  });
});