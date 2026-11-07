import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

// One alias + accent/case-free comparison serves every coverage, route, booking and holiday check.
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const area = (name: string, city: string, dia: string, ini: string, fim: string, start: string, end: string) =>
  ({ name, city, dia_semana: dia, horario_inicio: ini, horario_fim: fim, zip_code_start: start, zip_code_end: end });
// Same windows as the registered areas.
const areas = [
  area("Búzios", "Armação dos Búzios", "2ª feira e 6ª feira", "09:00:00", "12:00:00", "28950-000", "28959-999"),
  area("Cabo Frio", "Cabo Frio", "2ª feira e 6ª feira", "13:30:00", "16:30:00", "28900-000", "28924-999"),
  area("São Pedro da Aldeia", "São Pedro da Aldeia", "4ª feira", "09:30:00", "12:00:00", "28940-000", "28949-999"),
  area("Rio das Ostras", "Rio das Ostras", "3ª feira e 5ª feira", "15:00:00", "17:00:00", "28890-000", "28899-999"),
  area("Iguaba Grande", "Iguaba Grande", "4ª feira", "11:00:00", "15:00:00", "28960-000", "28969-999"),
  area("Iguabinha (Araruama)", "Iguabinha", "4ª feira", "11:00:00", "15:00:00", "", ""),
  area("Araruama", "Araruama", "4ª feira", "11:00:00", "15:00:00", "28970-000", "28989-999"),
  area("Saquarema", "Saquarema", "4ª feira", "15:00:00", "17:00:00", "28990-000", "28999-999"),
];

function harness(holidays: any[] = []) {
  const queries: any[] = [];
  const client = { from(table: string) {
    const query: any = { table, operation: "read", filters: [] };
    const result = () => {
      queries.push(query);
      if (query.operation !== "read") return { data: { id: "inserted", ...query.value }, error: null };
      if (table === "ekkoa_coverage_areas") return { data: areas.filter(a => query.filters.every((f: any[]) =>
        f[0] === "eq" && f[1] === "name" ? a.name === f[2] : f[0] !== "ilike")), error: null };
      if (table === "holidays") return { data: holidays, error: null };
      return { data: null, error: null };
    };
    const chain: any = {};
    for (const op of ["eq", "in", "contains", "ilike", "gte", "lte", "lt", "gt", "or", "order", "limit", "is", "neq"]) chain[op] = (...args: any[]) => { query.filters.push([op, ...args]); return chain; };
    chain.select = () => chain;
    chain.insert = (value: any) => { query.operation = "insert"; query.value = value; return chain; };
    chain.update = (value: any) => { query.operation = "update"; query.value = value; return chain; };
    chain.single = chain.maybeSingle = async () => result();
    chain.then = (resolve: any) => Promise.resolve(result()).then(resolve);
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client,
    Deno: { env: { get: () => undefined }, serve: () => {} }, EdgeRuntime: { waitUntil: () => {} },
    console: { ...console, error: vi.fn(), warn: vi.fn() }, fetch: vi.fn(async () => new Response("{}", { status: 500 })),
    Response, Request, URL, AbortSignal: { timeout: () => undefined }, performance, TextEncoder, crypto, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { queries, writes: () => queries.filter(q => q.operation !== "read"),
    fn(name: string, ...args: any[]) { context.__args = args; return vm.runInContext(`${name}(...__args)`, context); },
    async route(method: string, params: any) { context.method = method; context.params = params; return JSON.parse(JSON.stringify(await vm.runInContext("routeTool(method, params)", context))); } };
}
afterEach(() => vi.useRealTimers());

describe("city aliases", () => {
  it.each([
    ["Búzios", "Búzios"], ["Buzios", "Búzios"], ["BUZIOS", "Búzios"], ["Armação de Búzios", "Búzios"], ["Armação dos Búzios", "Búzios"], ["armacao dos buzios", "Búzios"], ["Búzios/RJ", "Búzios"],
    ["Cabo Frio", "Cabo Frio"], ["Cabo", "Cabo Frio"], ["São Pedro da Aldeia", "São Pedro da Aldeia"], ["São Pedro", "São Pedro da Aldeia"], ["Sao Pedro", "São Pedro da Aldeia"],
    ["Rio das Ostras", "Rio das Ostras"], ["Iguaba Grande", "Iguaba Grande"], ["Iguaba", "Iguaba Grande"], ["Araruama", "Araruama"], ["Saquarema", "Saquarema"],
  ])("verificar_cobertura_regiao %s → %s", async (cidade, regiao) => {
    const r = await harness().route("verificar_cobertura_regiao", { cidade });
    expect(r.data).toMatchObject({ coberto: true, vinculo: "DISTRIBUIDORA" });
    expect(r.data.cobertura.map((c: any) => c.regiao)).toEqual([regiao]);
  });
  it("Arraial / Arraial do Cabo are the same city (RJ, no area → MATRIZ), never Cabo Frio", async () => {
    const h = harness();
    expect(h.fn("sameCity", "Arraial", "Arraial do Cabo")).toBe(true);
    expect(h.fn("sameCity", "Arraial", "Cabo Frio")).toBe(false);
    for (const cidade of ["Arraial", "Arraial do Cabo"]) {
      const r = await h.route("verificar_cobertura_regiao", { cidade });
      expect(r.data).toMatchObject({ coberto: false, vinculo: "MATRIZ" });
    }
  });
  it("one alias table compares accents, case and UF suffix", () => {
    const h = harness();
    expect(h.fn("sameCity", "buzios - RJ", "Armação dos Búzios")).toBe(true);
    expect(h.fn("sameCity", "Cabo", "CABO FRIO")).toBe(true);
    expect(h.fn("sameCity", "Iguaba", "Iguabinha")).toBe(false);
    expect(h.fn("cityInArea", "Búzios", "Armação dos Búzios", true)).toBe(true);
  });
});

describe("booking with \"Búzios\" uses the Búzios area days and hours", () => {
  it("consultar_rota_consultor with Buzios offers only Monday/Friday inside 09:00–12:00", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-07T14:00:00Z"));
    const r = await harness().route("consultar_rota_consultor", { cidade: "Buzios" });
    expect(r.data.coberto).toBe(true);
    expect(r.data.proximas_datas.length).toBeGreaterThan(0);
    for (const d of r.data.proximas_datas) {
      expect([1, 5]).toContain(new Date(`${d.data}T12:00:00`).getDay());
      expect(d.horario).toBe("09:00:00 às 12:00:00");
    }
    expect(r.data.opcoes_horario.length).toBeGreaterThan(0);
    for (const o of r.data.opcoes_horario) {
      expect([1, 5]).toContain(new Date(`${o.data}T12:00:00`).getDay());
      const [hh, mm] = String(o.hora).split(":").map(Number);
      expect(hh * 60 + mm).toBeGreaterThanOrEqual(9 * 60);
      expect(hh * 60 + mm).toBeLessThanOrEqual(12 * 60);
    }
  });
  it("agendar_visita_tecnica rejects Wednesday and offers Monday/Friday", async () => {
    const h = harness();
    const r = await h.route("agendar_visita_tecnica", { nome_contato: "PH", cidade: "Búzios", data_visita: "2026-11-11", horario: "10:00" });
    expect(r.success).toBe(false);
    expect(r.message).toContain("Segunda-feira e Sexta-feira");
    expect(h.writes()).toHaveLength(0);
  });
  it("agendar_visita_tecnica rejects Monday outside 09:00–12:00 with the area window", async () => {
    const h = harness();
    const r = await h.route("agendar_visita_tecnica", { nome_contato: "PH", cidade: "Búzios", data_visita: "2026-11-09", horario: "15:00" });
    expect(r.success).toBe(false);
    expect(r.data.janelas).toEqual([{ inicio: "09:00", fim: "12:00" }]);
    expect(h.writes()).toHaveLength(0);
  });
  it("agendar_visita_tecnica accepts Monday 10:00 past the route checks", async () => {
    const h = harness();
    const r = await h.route("agendar_visita_tecnica", { nome_contato: "PH", cidade: "Búzios", data_visita: "2026-11-09", horario: "10:00" });
    expect(r.data?.janelas).toBeUndefined();
    expect(r.message ?? "").not.toMatch(/não é dia de cobertura|consultor atende/);
  });
  it("a holiday registered for Armação dos Búzios blocks a booking sent as Búzios", async () => {
    const h = harness([{ date: "2026-11-09", name: "Feriado municipal", city: "Armação dos Búzios", organization_id: null, kind: "municipal" }]);
    const r = await h.route("agendar_visita_tecnica", { nome_contato: "PH", cidade: "Buzios", data_visita: "2026-11-09", horario: "10:00" });
    expect(r.success).toBe(false);
    expect(h.writes()).toHaveLength(0);
  });
});
