import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { afterAll, describe, expect, it, vi } from "vitest";

// Wednesday 18/11/2026, 16:09 in São Paulo (the real case: "amanhã" is 19/11, the Flora sent 20/11).
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-18T19:09:00Z"));
afterAll(() => { vi.useRealTimers(); });
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const PHONES = { marcos: "5522999990001", ph: "5522999990002" };
const chat = (phone: string) => `3DF9D839DDCF463A3A350ADF91C40B89-${phone}`;

function tables(): Record<string, any[]> {
  const visita = (id: string, data: string, user: string, title: string) =>
    ({ id, organization_id: org, scheduled_date: data, status: "agendado", ocorrencia_tipo: "primeira_visita", assigned_to: user, start_time: "09:00:00", title, ocorrencia_codigo: `OC-${id}` });
  return {
    profiles: [
      { user_id: "u1", name: "Marcos Serafim", phone: PHONES.marcos, organization_id: org, is_active: true },
      { user_id: "u2", name: "PH Nascimento", phone: PHONES.ph, organization_id: org, is_active: true },
    ],
    user_roles: [{ user_id: "u1", role: "vendedor" }, { user_id: "u2", role: "super_admin" }],
    schedules: [visita("19", "2026-11-19", "u2", "Pousada Dezenove"), visita("20", "2026-11-20", "u2", "Hotel Vinte"), visita("25", "2026-11-25", "u2", "Bar Vinte e Cinco"),
      visita("18", "2026-11-18", "u1", "Loja Hoje")],
    atendimentos: [], tarefas_faturamento: [], lead_timeline: [], leads: [], clients: [], lead_stages: [], ekkoa_coverage_areas: [],
  };
}

function harness() {
  const t = tables();
  const client = { from(table: string) {
    const f: Array<(r: any) => boolean> = [];
    const rows = () => (t[table] ?? []).filter((r) => f.every((fn) => fn(r)));
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, lt: () => chain, ilike: () => chain, is: () => chain, not: () => chain, or: () => chain,
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; }, neq: (k: string, v: any) => { f.push((r) => r[k] !== v); return chain; },
      in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; },
      insert: () => chain, update: () => chain, upsert: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }), single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any) => Promise.resolve({ data: rows(), error: null }).then(res),
    };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch: vi.fn(), AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    Response, Request, URL, Blob, performance, TextEncoder, crypto, Date, Intl, Uint8Array, DataView, Uint32Array, atob, btoa });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return (acao: string, texto: string, extra: Record<string, unknown> = {}, phone = PHONES.ph): Promise<any> => {
    context.params = { chat_id: chat(phone), acao, texto, ...extra };
    return vm.runInContext("routeTool('flora_equipe', params)", context);
  };
}

describe("datas relativas: o servidor calcula, a data da Flora é ignorada (hoje = qua 18/11/2026 16:09)", () => {
  const route = harness();
  it("'Qual minha agenda de amanhã?' com data=2026-11-20 da Flora → 19/11", async () => {
    const r = await route("minha_agenda", "Qual minha agenda de amanhã?", { data: "2026-11-20" });
    expect(r.data.acao).toBe("minha_agenda");
    expect(r.data.data).toBe("2026-11-19");
    expect(r.data.mensagem_para_equipe).toContain("Pousada Dezenove");
    expect(r.data.mensagem_para_equipe).not.toContain("Hotel Vinte");
  });
  it.each([
    ["minha agenda de hoje", "2026-11-18"], ["agenda de depois de amanhã", "2026-11-20"], ["e ontem?", "2026-11-17"],
    ["agenda de anteontem", "2026-11-16"], ["minha agenda de sexta", "2026-11-20"], ["agenda de segunda-feira", "2026-11-23"],
    ["minha agenda de domingo", "2026-11-22"],
  ])("minha_agenda '%s' → %s, mesmo com a Flora mandando outra data", async (texto, esperado) => {
    const r = await route("minha_agenda", texto, { data: "2026-12-01" });
    expect(r.data.data).toBe(esperado);
  });
  it("agenda_equipe também usa a data do servidor", async () => {
    const r = await route("agenda_equipe", "amanhã", { data: "2026-11-20" });
    expect(r.data.acao).toBe("agenda_equipe");
    expect(r.data.data).toBe("2026-11-19");
  });
  it("indicadores → agenda também usa a data do servidor", async () => {
    const r = await route("indicadores", "Qual é a agenda de amanhã?", { data: "2026-11-20" });
    expect(r.data.acao).toBe("minha_agenda");
    expect(r.data.data).toBe("2026-11-19");
  });
  it("sem referência relativa ('dia 25') vale a data da Flora", async () => {
    const r = await route("minha_agenda", "minha agenda do dia 25", { data: "2026-11-25" });
    expect(r.data.data).toBe("2026-11-25");
    expect(r.data.mensagem_para_equipe).toContain("Bar Vinte e Cinco");
  });
  it("'segunda vez' não é dia da semana", async () => {
    const r = await route("minha_agenda", "minha agenda pela segunda vez", { data: "2026-11-25" });
    expect(r.data.data).toBe("2026-11-25");
  });
});

describe("pergunta de pendências/agenda enviada como anexar_coleta ou registrar_nota", () => {
  const route = harness();
  it("'O que tenho pendente?' em anexar_coleta → listar_pendencias", async () => {
    const r = await route("anexar_coleta", "O que tenho pendente?");
    expect(r.data.acao).toBe("listar_pendencias");
    expect(r.data.pedido_original).toBe("anexar_coleta");
    expect(r.data.mensagem_para_equipe).not.toMatch(/estabelecimento/i);
  });
  it.each(["minhas pendências", "o que falta?", "Tenho alguma pendência?"])("registrar_nota '%s' → listar_pendencias", async (texto) => {
    const r = await route("registrar_nota", texto);
    expect(r.data.acao).toBe("listar_pendencias");
  });
  it("'o que tenho amanhã?' em anexar_coleta → minha_agenda com a data do servidor", async () => {
    const r = await route("anexar_coleta", "o que tenho amanhã?", { data: "2026-11-20" });
    expect(r.data.acao).toBe("minha_agenda");
    expect(r.data.data).toBe("2026-11-19");
  });
  it.each([
    "Visitei a Pousada Sol, deixei 2 aparelhos e ele quer refil",
    "o que tenho pendente com o cliente da Pousada Sol?",
    "o que falta? o dono pediu 3 caixas",
  ])("conteúdo de visita continua em anexar_coleta: '%s'", async (texto) => {
    const r = await route("anexar_coleta", texto);
    expect(r.data?.acao).toBe("anexar_coleta");
  });
  it("com código da ocorrência continua em anexar_coleta", async () => {
    const r = await route("anexar_coleta", "o que falta?", { codigo: "#OC-000105" });
    expect(r.data?.acao).toBe("anexar_coleta");
  });
});
