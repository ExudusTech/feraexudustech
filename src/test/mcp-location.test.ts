import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const areas = [
  { name: "Cabo Frio", city: "Cabo Frio", zip_code_start: "28900-001", zip_code_end: "28924-999", dia_semana: "2ª feira e 6ª feira", horario_inicio: "13:30:00", horario_fim: "16:30:00" },
  { name: "Cabo Frio 2º Distrito", city: "Cabo Frio 2º Distrito", zip_code_start: "28925-001", zip_code_end: "28929-999", dia_semana: "3ª feira e 5ª feira", horario_inicio: "15:00:00", horario_fim: "17:00:00" },
  { name: "Saquarema", city: "Saquarema", zip_code_start: "28990-001", zip_code_end: "28999-999", dia_semana: "4ª feira", horario_inicio: "15:00:00", horario_fim: "17:00:00" },
  { name: "Bacaxá (Saquarema)", city: "Bacaxá (Saquarema)", zip_code_start: "28994-001", zip_code_end: "28994-999", dia_semana: "4ª feira", horario_inicio: "15:00:00", horario_fim: "17:00:00" },
  { name: "Sampaio Correia", city: "Sampaio Correia", zip_code_start: "28999-200", zip_code_end: "28999-999", dia_semana: "4ª feira", horario_inicio: "15:00:00", horario_fim: "17:00:00" },
];
const place = (cep?: string) => ({ id: "place-1", displayName: { text: "Restaurante Teste" }, formattedAddress: "Rua Teste, 20, Centro, Cabo Frio RJ",
  nationalPhoneNumber: "(22) 1234-5678", googleMapsUri: "https://maps.google.com/?cid=1", location: { latitude: -22.88, longitude: -42.02 },
  addressComponents: [{ types: ["sublocality_level_1"], longText: "Centro" }, { types: ["administrative_area_level_2"], longText: "Cabo Frio" },
    ...(cep ? [{ types: ["postal_code"], longText: cep }] : [])] });

function harness(options: { places?: any[]; googleStatus?: number; reverseCep?: string; reverseStatus?: string; noKey?: boolean; viaError?: boolean; holidays?: any[] } = {}) {
  const queries: any[] = [], requests: any[] = [];
  const client = { from(table: string) {
    const query: any = { table, operation: "read", filters: [] };
    const result = () => {
      queries.push(query);
      let data: any = null;
      if (table === "ekkoa_coverage_areas") data = areas.filter(area => query.filters.every((f: any[]) => {
        if (f[0] === "eq" && f[1] === "name") return area.name === f[2];
        if (f[0] === "ilike") return f[2].includes("%") ? area.city.includes(f[2].replaceAll("%", "")) : area.city === f[2];
        return true;
      }));
      if (table === "holidays") data = options.holidays ?? [];
      if (query.operation !== "read") data = { id: "created", ...query.value };
      return { data, error: null };
    };
    const chain: any = {};
    for (const op of ["eq", "ilike", "gte", "lte", "or", "order", "limit"]) chain[op] = (...args: any[]) => { query.filters.push([op, ...args]); return chain; };
    chain.select = () => chain;
    chain.insert = (value: any) => { query.operation = "insert"; query.value = value; return chain; };
    chain.update = (value: any) => { query.operation = "update"; query.value = value; return chain; };
    chain.single = chain.maybeSingle = async () => result();
    chain.then = (resolve: any) => Promise.resolve(result()).then(resolve);
    return chain;
  } };
  const fetch = vi.fn(async (url: string, init: any = {}) => {
    requests.push({ url, init });
    if (url.includes("viacep")) return new Response(JSON.stringify(options.viaError ? { erro: true } : { logradouro: "Rua Teste", bairro: "Centro", localidade: "Cabo Frio", uf: "RJ", cep: "28926-001" }));
    if (url.includes("geocode")) return new Response(JSON.stringify({ status: options.reverseStatus ?? "OK", results: [{ address_components: [{ types: ["postal_code"], long_name: options.reverseCep ?? "28900-100" }] }] }));
    return new Response(JSON.stringify(options.googleStatus ? { error: { status: "PERMISSION_DENIED", details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } } : { places: options.places ?? [place("28900-100")] }), { status: options.googleStatus ?? 200 });
  });
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: (key: string) => key === "GOOGLE_MAPS_API_KEY" && !options.noKey ? "test-only-key" : undefined }, serve: () => {} },
    console: { ...console, error: vi.fn() }, fetch, Response, Request, URL, AbortSignal: { timeout: () => undefined }, performance, TextEncoder, crypto, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { queries, requests, route(method: string, params: any) { context.method = method; context.params = params; return vm.runInContext("routeTool(method, params)", context); },
    manifest() { return vm.runInContext("TOOLS_MANIFEST", context); } };
}
afterEach(() => vi.useRealTimers());
const input = { nome: "Restaurante Teste", cidade: "Cabo Frio" };
const visit = { nome_contato: "PH", cidade: "Cabo Frio", data_visita: "2026-10-13", horario: "15:00", produto_interesse: "Produto" };

describe("MCP establishment location", () => {
  it.each([["28900-100", "Cabo Frio"], ["28926-100", "Cabo Frio 2º Distrito"], ["28994-100", "Bacaxá (Saquarema)"], ["28999-300", "Sampaio Correia"]])("resolves %s to %s", async (cep, regiao) => {
    const h = harness({ places: [place(cep)] });
    const result = await h.route("localizar_estabelecimento", input);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ encontrado: true, precisa_confirmar: true, candidatos: [{ regiao, cep, nome: "Restaurante Teste", bairro: "Centro", latitude: -22.88, longitude: -42.02, place_id: "place-1" }] });
    expect(result.data.mensagem_para_lead).toContain("É o Restaurante Teste");
    expect(h.requests).toHaveLength(1);
    expect(JSON.parse(h.requests[0].init.body)).toMatchObject({ languageCode: "pt-BR", regionCode: "BR", maxResultCount: 3 });
    expect(h.queries[0].filters).toContainEqual(["eq", "organization_id", org]);
  });
  it.each([{ places: [] }, { googleStatus: 403 }, { googleStatus: 429 }, { noKey: true }])("returns controlled fallback for %j", async options => {
    const result = await harness(options).route("localizar_estabelecimento", input);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ encontrado: false, candidatos: [], precisa_confirmar: true, mensagem_para_lead: "Não encontrei pelo nome. Pode me passar o CEP ou o bairro do estabelecimento?" });
  });
  it("CEP uses only ViaCEP even without a Google key", async () => {
    const h = harness({ noKey: true });
    const result = await h.route("localizar_estabelecimento", { ...input, cep: "28926-001" });
    expect(result.data.candidatos[0]).toMatchObject({ regiao: "Cabo Frio 2º Distrito", place_id: null, maps_url: null });
    expect(h.requests).toHaveLength(1); expect(h.requests[0].url).toContain("viacep");
  });
  it("ViaCEP not found does not trigger Google", async () => {
    const h = harness({ viaError: true });
    expect((await h.route("localizar_estabelecimento", { ...input, cep: "28926-001" })).data.encontrado).toBe(false);
    expect(h.requests).toHaveLength(1);
  });
  it("reverse geocodes a missing CEP", async () => {
    const h = harness({ places: [place()], reverseCep: "28994-100" });
    expect((await h.route("localizar_estabelecimento", input)).data.candidatos[0].regiao).toBe("Bacaxá (Saquarema)");
    expect(h.requests).toHaveLength(2);
  });
  it("missing reverse CEP retains candidate with null region", async () => {
    const result = await harness({ places: [place()], reverseStatus: "ZERO_RESULTS" }).route("localizar_estabelecimento", input);
    expect(result.data.candidatos[0]).toMatchObject({ cep: null, regiao: null });
  });
  it("numbers two candidates for confirmation", async () => {
    const h = harness({ places: [place("28900-100"), place("28926-100")] });
    const result = await h.route("localizar_estabelecimento", input);
    expect(result.data.mensagem_para_lead).toContain("1."); expect(result.data.mensagem_para_lead).toContain("2.");
  });
  it("caches repeated Google searches", async () => {
    const h = harness(); await h.route("localizar_estabelecimento", input); await h.route("localizar_estabelecimento", input);
    expect(h.requests).toHaveLength(1);
  });
  it.each([{ nome: null }, { cidade: null }, { cep: "invalid" }, { nome: {} }])("validates input %j before requests", async invalid => {
    const h = harness(); expect((await h.route("localizar_estabelecimento", { ...input, ...invalid })).success).toBe(false);
    expect(h.requests).toHaveLength(0);
  });
  it("exposes the new tool and optional selectors", () => {
    const manifest = harness().manifest();
    expect(manifest.find((t: any) => t.name === "localizar_estabelecimento").parameters.required).toEqual(["nome", "cidade"]);
    for (const name of ["consultar_rota_consultor", "agendar_visita_tecnica"]) {
      expect(manifest.find((t: any) => t.name === name).parameters.properties).toHaveProperty("regiao");
      expect(manifest.find((t: any) => t.name === name).parameters.properties).toHaveProperty("cep");
    }
  });
});

describe("MCP exact coverage selectors", () => {
  it.each([{ regiao: "Cabo Frio 2º Distrito", cep: "28900-100" }, { cep: "28926-100" }])("consultation restricts dates with %j", async selector => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
    const result = await harness().route("consultar_rota_consultor", { cidade: "Cabo Frio", ...selector });
    expect(result.data.proximas_datas.map((d: any) => d.data)).toEqual(["2026-10-13", "2026-10-15", "2026-10-20"]);
    expect(result.data.proximas_datas.every((d: any) => d.regiao === "Cabo Frio 2º Distrito")).toBe(true);
  });
  it.each([{ regiao: "missing", cep: "28900-100" }, { cep: "00000-000" }])("unmatched selector %j never broadens coverage", async selector => {
    const h = harness();
    expect((await h.route("consultar_rota_consultor", { cidade: "Cabo Frio", ...selector })).data.coberto).toBe(false);
    expect((await h.route("agendar_visita_tecnica", { ...visit, ...selector })).success).toBe(false);
    expect(h.queries.every(q => q.operation === "read")).toBe(true);
  });
  it("technical booking uses district weekdays, not city weekdays", async () => {
    const h = harness();
    expect((await h.route("agendar_visita_tecnica", { ...visit, regiao: "Cabo Frio 2º Distrito", cep: "28900-100" })).success).toBe(true);
    const rejected = harness();
    expect((await rejected.route("agendar_visita_tecnica", { ...visit, regiao: "Cabo Frio 2º Distrito", data_visita: "2026-10-16" })).success).toBe(false);
    expect(rejected.queries.every(q => q.operation === "read")).toBe(true);
  });
  it("technical booking rejects district time outside its window", async () => {
    const h = harness();
    const result = await h.route("agendar_visita_tecnica", { ...visit, cep: "28926-100", horario: "13:30" });
    expect(result.success).toBe(false); expect(result.data.janelas).toEqual([{ inicio: "15:00", fim: "17:00" }]);
    expect(h.queries.every(q => q.operation === "read")).toBe(true);
  });
  it("legacy city consultation still consolidates districts", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
    expect((await harness().route("consultar_rota_consultor", { cidade: "Cabo Frio" })).data.dias_de_visita).toContain("Segunda");
  });
  it("stores optional address fields and canonical zip_code on a new lead", async () => {
    const h = harness();
    await h.route("criar_lead", { nome: "PH", endereco: "Rua Teste, 20", bairro: "Centro", cep: "28926-100", latitude: "-22.88", longitude: -42.02,
      maps_url: "https://maps.google.com/?cid=1", place_id: "place-1", regiao: "Cabo Frio 2º Distrito" });
    expect(h.queries.find(q => q.table === "leads" && q.operation === "insert").value).toMatchObject({ endereco: "Rua Teste, 20", bairro: "Centro", zip_code: "28926100", latitude: -22.88, longitude: -42.02, maps_url: "https://maps.google.com/?cid=1", place_id: "place-1", regiao: "Cabo Frio 2º Distrito" });
  });
  it.each([{ latitude: 91 }, { longitude: "invalid" }, { maps_url: "javascript:alert(1)" }, { cep: "bad" }])("rejects invalid optional lead fields %j", async invalid => {
    const h = harness(); expect((await h.route("criar_lead", { nome: "PH", ...invalid })).success).toBe(false);
    expect(h.queries.every(q => q.operation === "read")).toBe(true);
  });
});