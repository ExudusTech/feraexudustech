import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-18T14:00:00Z"));

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const WA = "3DF9D839DDCF463A3A350ADF91C40B89-5521979047667";
type Row = Record<string, any>;
const AREAS = [
  { id: "cf", name: "Cabo Frio", city: "Cabo Frio", zip_code_start: "28900-000", zip_code_end: "28924-999", dia_semana: "2ª feira e 6ª feira", horario_inicio: "08:00", horario_fim: "17:00", is_active: true },
  { id: "bz", name: "Búzios", city: "Armação dos Búzios", zip_code_start: "28950-000", zip_code_end: "28959-999", dia_semana: "3ª feira", horario_inicio: "08:00", horario_fim: "17:00", is_active: true },
];

function harness(viaCep: Record<string, any> | "falha" = "falha", seed: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = {
    pessoas: [{ id: "person", nome: "Marcela", whatsapp: "5521979047667", chat_ids: [WA] }],
    leads: [], lead_timeline: [], notification_logs: [], schedules: [], holidays: [], mcp_request_log: [], profiles: [], user_roles: [],
    ekkoa_coverage_areas: structuredClone(AREAS), organizations: [{ flora_default_lead_owner: null }], ...seed,
  };
  const tasks: Promise<void>[] = [];
  const fetch = vi.fn(async (url: string) => {
    if (String(url).includes("viacep.com.br")) {
      if (viaCep === "falha") throw new Error("timeout");
      return new Response(JSON.stringify(viaCep), { status: 200 });
    }
    return new Response("{}");
  });
  let seq = 0;
  const client = { from(table: string) {
    let op = "read", value: any; const filters: Array<(r: Row) => boolean> = []; let limit = Infinity;
    const run = (single: boolean) => {
      const rows = db[table] ?? (db[table] = []);
      if (op === "insert") { const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...value }; rows.push(row); return { data: row, error: null }; }
      const found = rows.filter(r => filters.every(f => f(r)));
      if (op === "update") { found.forEach(r => Object.assign(r, value)); return { data: found[0] ?? null, error: null }; }
      const out = found.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const chain: any = {
      select: () => chain, order: () => chain, limit: (n: number) => { limit = n; return chain; }, or: () => chain, ilike: () => chain, neq: () => chain, lte: () => chain, not: () => chain, is: () => chain,
      eq: (k: string, v: any) => { if (k !== "organization_id") filters.push(r => r[k] === v); return chain; },
      in: (k: string, v: any[]) => { filters.push(r => v.includes(r[k])); return chain; },
      gte: (k: string, v: any) => { filters.push(r => r[k] == null || String(r[k]) >= String(v)); return chain; },
      contains: (k: string, v: any) => { filters.push(r => Array.isArray(r[k]) ? v.every((x: any) => r[k].includes(x)) : Object.entries(v).every(([kk, vv]) => r[k]?.[kk] === vv)); return chain; },
      insert: (v: any) => { op = "insert"; value = v; return chain; }, update: (v: any) => { op = "update"; value = v; return chain; },
      single: async () => run(true), maybeSingle: async () => run(true), then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: (t: Promise<void>) => tasks.push(t) }, fetch, AbortSignal: { timeout: () => undefined }, Response, Request, URL, performance, crypto,
    console: { error: vi.fn(), warn: vi.fn(), log: vi.fn() }, Date, TextEncoder });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { db, fetch, async route(method: string, params: Row) {
    context.method = method; context.params = params;
    const r = await vm.runInContext("routeTool(method, params)", context);
    await Promise.all(tasks); return r;
  } };
}

describe("CEP fora das faixas e sem cidade: ViaCEP antes de perguntar", () => {
  it("CEP de Arraial do Cabo fora da faixa → DISTRIBUIDORA pela região de Cabo Frio", async () => {
    const h = harness({ cep: "28930-000", localidade: "Arraial do Cabo", uf: "RJ" });
    const r = await h.route("verificar_cobertura_regiao", { cep: "28930-000" });
    expect(h.fetch.mock.calls.some(c => String(c[0]).includes("viacep.com.br/ws/28930000/json"))).toBe(true);
    expect(r.data).toMatchObject({ coberto: true, vinculo: "DISTRIBUIDORA", sem_rota_propria: true, regiao_proxima: "Cabo Frio", cidade: "Arraial do Cabo" });
    expect(r.data.precisa_confirmar).toBeUndefined();
  });
  it("CEP de Niterói → MATRIZ", async () => {
    const h = harness({ cep: "24020-000", localidade: "Niterói", uf: "RJ" });
    const r = await h.route("verificar_cobertura_regiao", { cep: "24020-000" });
    expect(r.data).toMatchObject({ vinculo: "MATRIZ", cidade: "Niterói" });
  });
  it("CEP de outro estado → SEM_COBERTURA", async () => {
    const h = harness({ cep: "01310-100", localidade: "São Paulo", uf: "SP" });
    const r = await h.route("verificar_cobertura_regiao", { cep: "01310-100" });
    expect(r.data.vinculo).toBe("SEM_COBERTURA");
  });
  it("ViaCEP falhou → aí sim pergunta a cidade", async () => {
    const h = harness("falha");
    const r = await h.route("verificar_cobertura_regiao", { cep: "28930-000" });
    expect(r.data).toMatchObject({ precisa_confirmar: true, vinculo: null, mensagem_para_lead: "Qual é a cidade do estabelecimento?" });
  });
  it("consultar_rota_consultor só com CEP de Arraial usa a região mais próxima", async () => {
    const h = harness({ cep: "28930-000", localidade: "Arraial do Cabo", uf: "RJ" });
    const r = await h.route("consultar_rota_consultor", { cep: "28930-000" });
    expect(r.data.vinculo).toBe("DISTRIBUIDORA");
    expect(r.data.regiao_proxima ?? r.data.regiao).toBe("Cabo Frio");
  });
});

describe("criar_lead sem cidade: localização pendente", () => {
  const base = { chat_id: WA, nome: "Marcela", empresa_nome: "Peixaria Biju", produto_interesse: "limpa rejunte", canal: "WHATSAPP", interaction_id: "i-1" };
  it("grava em novo com a tag, uma linha na linha do tempo e continua pedindo a cidade", async () => {
    const h = harness();
    const r = await h.route("criar_lead", base);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ criado: true, localizacao_pendente: true, mensagem_para_lead: "Me passa a cidade e o bairro (ou o CEP) do estabelecimento?" });
    expect(h.db.leads).toHaveLength(1);
    expect(h.db.leads[0]).toMatchObject({ stage: "novo", flora_tags: ["localizacao_pendente"], city: null, empresa_nome: "Peixaria Biju" });
    expect(h.db.lead_timeline.map(t => t.resumo)).toEqual([expect.stringContaining("localização pendente")]);
  });
  it("aceita só o nome do estabelecimento (sem contato)", async () => {
    const h = harness();
    const r = await h.route("criar_lead", { chat_id: WA, empresa_nome: "Peixaria Biju", produto_interesse: "rejunte", canal: "WHATSAPP", interaction_id: "i-2" });
    expect(r.success).toBe(true);
    expect(h.db.leads[0]).toMatchObject({ contact_name: "Peixaria Biju", flora_tags: ["localizacao_pendente"] });
  });
  it("a cidade chega depois no mesmo chat: atualiza o mesmo lead e tira a tag", async () => {
    const h = harness();
    await h.route("criar_lead", base);
    const r = await h.route("criar_lead", { ...base, interaction_id: "i-outra", cidade: "Cabo Frio", bairro: "Centro" });
    expect(r.data).toMatchObject({ criado: false, localizacao_atualizada: true });
    expect(h.db.leads).toHaveLength(1);
    expect(h.db.leads[0]).toMatchObject({ city: "Cabo Frio", bairro: "Centro", flora_tags: [] });
    expect(h.db.lead_timeline.some(t => t.resumo.includes("Localização informada: Cabo Frio"))).toBe(true);
  });
  it("mesmo interaction_id com CEP também completa o lead", async () => {
    const h = harness();
    await h.route("criar_lead", base);
    await h.route("criar_lead", { ...base, cep: "28930-000" });
    expect(h.db.leads).toHaveLength(1);
    expect(h.db.leads[0]).toMatchObject({ zip_code: "28930000", flora_tags: [] });
  });
  it("atualizar_lead com cidade grava a cidade (não o CEP) e tira a tag", async () => {
    const h = harness();
    const r = await h.route("criar_lead", base);
    await h.route("atualizar_lead", { lead_id: r.data.lead.id, cidade: "Búzios" });
    expect(h.db.leads[0]).toMatchObject({ city: "Búzios", flora_tags: [] });
    expect(h.db.leads[0].zip_code).toBeUndefined();
  });
  it("sem cidade de novo no mesmo chat não duplica", async () => {
    const h = harness();
    await h.route("criar_lead", base);
    const r = await h.route("criar_lead", { ...base, interaction_id: "i-3" });
    expect(r.data).toMatchObject({ criado: false, localizacao_pendente: true });
    expect(h.db.leads).toHaveLength(1);
  });
});
