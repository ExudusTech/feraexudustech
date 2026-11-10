import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

// Coverage is checked before any establishment search, route option or booking.
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const FORA = "No momento não atendemos seu estado, mas podemos registrar seu interesse. Obrigado pelo contato!";
const MATRIZ = (cidade: string) => `${cidade} é atendida pela nossa Matriz. Vou passar seu contato para o responsável de lá, que vai te procurar em breve. Se preferir adiantar, o WhatsApp da Matriz é (21) 99461-1073.`;
const PROMESSA = /melhor dia|consultor passar|visita/i;
const CHAT = "3DF9D839DDCF463A3A350ADF91C40B89-5511987654321";
const areas = [
  { name: "Búzios", city: "Armação dos Búzios", zip_code_start: "28950-000", zip_code_end: "28959-999", dia_semana: "3ª feira", horario_inicio: "14:00:00", horario_fim: "17:00:00" },
  { name: "Cabo Frio", city: "Cabo Frio", zip_code_start: "28900-000", zip_code_end: "28924-999", dia_semana: "2ª feira", horario_inicio: "14:00:00", horario_fim: "17:00:00" },
];
const buziosPlace = { id: "place-bz", displayName: { text: "Pousada 7 Mares" }, formattedAddress: "Rua das Pedras, 10, Centro, Armação dos Búzios - RJ, 28950-000",
  location: { latitude: -22.75, longitude: -41.88 }, googleMapsUri: "https://maps.google.com/?cid=2",
  addressComponents: [{ types: ["sublocality_level_1"], longText: "Centro" }, { types: ["administrative_area_level_2"], longText: "Armação dos Búzios" },
    { types: ["administrative_area_level_1"], longText: "Rio de Janeiro", shortText: "RJ" }, { types: ["postal_code"], longText: "28950-000" }] };

function harness(options: { chatForaLead?: string } = {}) {
  const queries: any[] = [], requests: any[] = [];
  const client = { from(table: string) {
    const query: any = { table, operation: "read", filters: [] };
    const result = () => {
      queries.push(query);
      if (query.operation !== "read") return { data: { id: query.operation === "update" ? "updated" : "inserted", ...query.value }, error: null };
      if (table === "ekkoa_coverage_areas") return { data: areas.filter(area => query.filters.every((f: any[]) => {
        if (f[0] === "eq" && f[1] === "name") return area.name === f[2];
        if (f[0] === "ilike") return f[2].includes("%") ? area.city.includes(f[2].replaceAll("%", "")) : area.city === f[2];
        return true;
      })), error: null };
      if (table === "leads" && options.chatForaLead && query.filters.some((f: any[]) => f[1] === "gptmaker_chat_id"))
        return { data: { id: options.chatForaLead }, error: null };
      return { data: null, error: null };
    };
    const chain: any = {};
    for (const op of ["eq", "in", "contains", "ilike", "gte", "lte", "or", "order", "limit", "is", "neq"]) chain[op] = (...args: any[]) => { query.filters.push([op, ...args]); return chain; };
    chain.select = () => chain;
    chain.insert = (value: any) => { query.operation = "insert"; query.value = value; return chain; };
    chain.update = (value: any) => { query.operation = "update"; query.value = value; return chain; };
    chain.single = chain.maybeSingle = async () => result();
    chain.then = (resolve: any) => Promise.resolve(result()).then(resolve);
    return chain;
  } };
  const fetch = vi.fn(async (url: string, init: any = {}) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ places: [buziosPlace] }));
  });
  const context = vm.createContext({ createClient: () => client,
    Deno: { env: { get: (key: string) => key === "GOOGLE_MAPS_API_KEY" ? "test-only-key" : undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} },
    console: { ...console, error: vi.fn() }, fetch, Response, Request, URL, AbortSignal: { timeout: () => undefined }, performance, TextEncoder, crypto, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { queries, requests, writes: () => queries.filter(q => q.operation !== "read"),
    async route(method: string, params: any) { context.method = method; context.params = params; return JSON.parse(JSON.stringify(await vm.runInContext("routeTool(method, params)", context))); } };
}
afterEach(() => vi.useRealTimers());

describe("São Paulo/Pinheiros is outside coverage", () => {
  it.each([{ cidade: "São Paulo", bairro: "Pinheiros" }, { cidade: "Pinheiros, São Paulo" }, { cidade: "São Paulo/SP" }, { cidade: "São Paulo", estado: "SP" }])(
    "localizar_estabelecimento %j answers SEM_COBERTURA without searching and registers the contact", async place => {
      const h = harness();
      const r = await h.route("localizar_estabelecimento", { nome: "Restaurante Pinheiros Gourmet", chat_id: CHAT, ...place });
      expect(r.success).toBe(true);
      expect(r.data).toMatchObject({ cobertura: "SEM_COBERTURA", encontrado: false, candidatos: [], registrado: true, mensagem_para_lead: FORA });
      expect(r.data.mensagem_para_lead).not.toMatch(PROMESSA);
      expect(h.requests).toHaveLength(0);
      const lead = h.writes().find(q => q.table === "leads");
      expect(lead.operation).toBe("insert");
      expect(lead.value).toMatchObject({ fora_cobertura: true, vinculo: "SEM_COBERTURA", stage: "fechado_perdido", gptmaker_chat_id: CHAT });
    });
  it("reuses the outside-coverage record already saved for the chat_id", async () => {
    const h = harness({ chatForaLead: "fora-1" });
    const r = await h.route("localizar_estabelecimento", { nome: "Restaurante Pinheiros Gourmet", cidade: "São Paulo", bairro: "Pinheiros", chat_id: CHAT });
    expect(r.data).toMatchObject({ cobertura: "SEM_COBERTURA", lead_id: "updated" });
    const writes = h.writes().filter(q => q.table === "leads");
    expect(writes.map(q => q.operation)).toEqual(["update"]);
    expect(writes[0].filters).toContainEqual(["eq", "id", "fora-1"]);
  });
  it("verificar_cobertura_regiao returns the same literal message for São Paulo without estado", async () => {
    const r = await harness().route("verificar_cobertura_regiao", { cidade: "São Paulo" });
    expect(r.data).toMatchObject({ coberto: false, vinculo: "SEM_COBERTURA", mensagem_para_lead: FORA });
  });
  it("consultar_rota_consultor never returns dates or times", async () => {
    const h = harness();
    const r = await h.route("consultar_rota_consultor", { cidade: "São Paulo", chat_id: CHAT });
    expect(r.data).toMatchObject({ coberto: false, cobertura: "SEM_COBERTURA", proximas_datas: [], opcoes_horario: [], mensagem_para_lead: FORA });
    expect(h.writes()).toHaveLength(0);
  });
  it("agendar_visita_tecnica refuses without writing anything", async () => {
    const h = harness();
    const r = await h.route("agendar_visita_tecnica", { nome_contato: "PH", cidade: "São Paulo", data_visita: "2026-11-10", horario: "15:00", chat_id: CHAT });
    expect(r.success).toBe(false);
    expect(r.data).toMatchObject({ cobertura: "SEM_COBERTURA", mensagem_para_lead: FORA });
    expect(r.data.janelas).toBeUndefined();
    expect(h.writes()).toHaveLength(0);
  });
});

describe("covered and Matriz cities", () => {
  it("Búzios searches normally and may promise the visit", async () => {
    const h = harness();
    const r = await h.route("localizar_estabelecimento", { nome: "Pousada 7 Mares", cidade: "Búzios", chat_id: CHAT });
    expect(r.data).toMatchObject({ cobertura: "DISTRIBUIDORA", encontrado: true, candidatos: [{ regiao: "Búzios", place_id: "place-bz" }] });
    expect(h.requests.some(q => q.url.includes("places"))).toBe(true);
    expect(h.writes()).toHaveLength(0);
  });
  it("Búzios route still offers dates", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-07T14:00:00Z"));
    const r = await harness().route("consultar_rota_consultor", { cidade: "Búzios" });
    expect(r.data.coberto).toBe(true);
    expect(r.data.proximas_datas.length).toBeGreaterThan(0);
  });
  it.each(["Niterói", "Petrópolis"])("%s (RJ outside the Lagos) keeps the MATRIZ handoff without search or registration", async cidade => {
    const h = harness();
    const r = await h.route("localizar_estabelecimento", { nome: "Hotel Central", cidade, chat_id: CHAT });
    expect(r.data).toMatchObject({ cobertura: "MATRIZ", encontrado: false, mensagem_para_lead: MATRIZ(cidade), proxima_acao: "chame transferir_para_humano com motivo MATRIZ" });
    expect(r.next_action_hint).toContain("transferir_para_humano com motivo MATRIZ");
    expect(h.requests).toHaveLength(0);
    expect(h.writes()).toHaveLength(0);
    const rota = await h.route("consultar_rota_consultor", { cidade });
    expect(rota.data).toMatchObject({ coberto: false, vinculo: "MATRIZ", opcoes_horario: [] });
  });
  it("without city or CEP asks only for city and bairro", async () => {
    const h = harness();
    const r = await h.route("localizar_estabelecimento", { nome: "Pousada 7 Mares", chat_id: CHAT });
    expect(r.data.mensagem_para_lead).toBe("Me passa a cidade e o bairro (ou o CEP) do estabelecimento?");
    expect(h.requests).toHaveLength(0);
  });
});
