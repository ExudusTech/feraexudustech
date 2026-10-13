import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const areas = [
  { name: "Búzios", city: "Búzios", zip_code_start: "28950-000", zip_code_end: "28959-999", dia_semana: "3ª feira", horario_inicio: "14:00", horario_fim: "17:00" },
  { name: "Cabo Frio", city: "Cabo Frio", zip_code_start: "28900-000", zip_code_end: "28924-999", dia_semana: "2ª feira", horario_inicio: "14:00", horario_fim: "17:00" },
];
function harness(options: { existing?: string; readError?: boolean; writeError?: boolean } = {}) {
  const queries: any[] = [];
  const client = { from(table: string) {
    const query: any = { table, operation: "read", filters: [] };
    const result = () => {
      queries.push(query);
      if (options.readError && query.operation === "read") return { data: null, error: { message: "read failed" } };
      if (table === "ekkoa_coverage_areas") return { data: areas, error: null };
      if (query.operation === "read") return { data: options.existing ? { id: options.existing } : null, error: null };
      if (options.writeError) return { data: null, error: { message: "write failed" } };
      // Match the real database enum; the old 'perdido' must not pass.
      if (query.value.stage !== "fechado_perdido") return { data: null, error: { message: "invalid lead_stage" } };
      return { data: { id: options.existing ?? "inserted", ...query.value }, error: null };
    };
    const chain: any = { select: () => chain,
      insert: (value: any) => { query.operation = "insert"; query.value = value; return chain; },
      update: (value: any) => { query.operation = "update"; query.value = value; return chain; },
      upsert: () => { throw new Error("ON CONFLICT is unsupported"); },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    for (const key of ["eq", "gte", "order", "limit"]) chain[key] = (...args: any[]) => { query.filters.push([key, ...args]); return chain; };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client,
    Deno: { env: { get: () => undefined }, serve: () => {} },
    console, Response, Request, URL, performance, TextEncoder, crypto,
  });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, context);
  return { queries, route(method: string, params: any) {
    context.method = method; context.params = params;
    return vm.runInContext("routeTool(method, params)", context);
  } };
}
describe("coverage bindings", () => {
  it.each([
    { cidade: "Armação dos Búzios" }, { cidade: "ARMAÇÃO DOS BUZIOS" },
    { cidade: "búzios" }, { cidade: "city from Google", regiao: "Búzios" },
    { cidade: "city from Google", cep: "28950-100" }, { regiao: "Búzios" },
  ])("returns DISTRIBUIDORA for %j", async params => {
    const h = harness();
    const result = await h.route("verificar_cobertura_regiao", params);
    expect(result).toMatchObject({ success: true, data: { coberto: true, vinculo: "DISTRIBUIDORA", cobertura: [{ regiao: "Búzios" }] } });
    expect(result.data.mensagem_para_lead).toContain("Distribuidora");
    expect(result.next_action_hint).toContain("consultar_rota_consultor");
    expect(h.queries[0].filters).toContainEqual(["eq", "organization_id", org]);
    expect(h.queries[0].filters).toContainEqual(["eq", "is_active", true]);
  });
  it.each([
    { cidade: "Niterói", estado: "RJ" }, { cidade: "Niterói", estado: "Rio de Janeiro" },
    { cidade: "Niterói", estado: "não informado" }, { cidade: "Maricá" },
    { cep: "20000-000" }, { cep: "28999-999" },
    { cidade: "desconhecida", estado: "RJ", regiao: "missing" },
  ])("routes uncovered RJ to MATRIZ for %j", async params => {
    const result = await harness().route("verificar_cobertura_regiao", params);
    expect(result.data).toMatchObject({ coberto: false, vinculo: "MATRIZ" });
    expect(result.data.mensagem_para_lead).toContain("Matriz");
    expect(result.next_action_hint).toContain("solicitar_atendimento_humano com motivo contendo MATRIZ");
  });
  it.each([{ cidade: "São Paulo", estado: "SP" }, { cidade: "Vitória", estado: "Espírito Santo" }])("routes known outside state for %j", async params => {
    const result = await harness().route("verificar_cobertura_regiao", params);
    expect(result.data).toMatchObject({ coberto: false, vinculo: "SEM_COBERTURA" });
    expect(result.next_action_hint).toContain("Use registrar_fora_cobertura");
  });
  it.each([{ cidade: "Cidade desconhecida", estado: "não informado" }, { cep: "19999-999" }, { cep: "29000-000" }])("does not guess non-RJ from %j", async params => {
    const result = await harness().route("verificar_cobertura_regiao", params);
    expect(result.data).toMatchObject({ vinculo: null, precisa_confirmar: true });
  });
  it("matches containment in the reverse direction", async () => {
    expect((await harness().route("verificar_cobertura_regiao", { cidade: "Cabo" })).data.vinculo).toBe("DISTRIBUIDORA");
  });
  it.each([{ cep: "bad" }, { cidade: {} }, { estado: [] }, { regiao: 123 }])("rejects invalid input %j", async params => {
    const h = harness();
    expect((await h.route("verificar_cobertura_regiao", params)).success).toBe(false);
    expect(h.queries).toHaveLength(0);
  });
  it("does not turn a query failure into outside coverage", async () => {
    expect((await harness({ readError: true }).route("verificar_cobertura_regiao", { cidade: "Niterói", estado: "RJ" })).success).toBe(false);
  });
});
describe("outside-coverage registration", () => {
  const params = { nome: "Teste cobertura", cidade: "São Paulo", estado: "SP", produto_interesse: "Higiene",
    chat_id: "3DF9D839DDCF463A3A350ADF91C40B89-5521999990000" };
  it("registers the real WhatsApp input shape without ON CONFLICT or notification", async () => {
    const h = harness();
    const original = { ...params };
    const result = await h.route("registrar_fora_cobertura", params);
    expect(result).toMatchObject({ success: true, data: { registrado: true, lead_id: "inserted", vinculo: "SEM_COBERTURA" } });
    const write = h.queries.find(q => q.operation === "insert");
    expect(write.value).toMatchObject({ organization_id: org, contact_name: params.nome, contact_phone: "5521999990000",
      category: "Higiene", gptmaker_chat_id: params.chat_id, stage: "fechado_perdido", canal_origem: "WHATSAPP", fora_cobertura: true });
    expect(write.value.description).toContain("São Paulo — SP");
    expect(h.queries.every(q => q.table === "leads")).toBe(true);
    expect(params).toEqual(original);
  });
  it("updates a recent same-tenant chat lead instead of inserting again", async () => {
    const h = harness({ existing: "recent" });
    expect((await h.route("registrar_fora_cobertura", params)).success).toBe(true);
    expect(h.queries[0].filters).toContainEqual(["eq", "organization_id", org]);
    expect(h.queries[0].filters).toContainEqual(["eq", "gptmaker_chat_id", params.chat_id]);
    expect(h.queries[0].filters.some((f: any[]) => f[0] === "gte" && f[1] === "created_at")).toBe(true);
    const write = h.queries.find(q => q.operation === "update");
    expect(write.filters).toContainEqual(["eq", "id", "recent"]);
    expect(write.filters).toContainEqual(["eq", "organization_id", org]);
    expect(h.queries.some(q => q.operation === "insert")).toBe(false);
  });
  it("selects legacy interaction only within its tenant", async () => {
    const h = harness({ existing: "legacy" });
    await h.route("registrar_fora_cobertura", { cidade: "São Paulo", interaction_id: "legacy-input" });
    expect(h.queries[0].filters).toContainEqual(["eq", "interaction_id", "legacy-input"]);
    expect(h.queries[0].filters).toContainEqual(["eq", "organization_id", org]);
  });
  it.each([{ readError: true }, { writeError: true }])("reports failures rather than pretending success %j", async options => {
    expect((await harness(options).route("registrar_fora_cobertura", params)).success).toBe(false);
  });
});