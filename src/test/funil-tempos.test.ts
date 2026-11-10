import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  ciclos, ciclosPorRecorte, diasEntre, FT_RECUSA_GESTAO, podeVerTempoFunil, estatDias, etapaMaisDemorada, faixaPorte, fmtDias, rankingDecisao, temposPorEtapa,
  type FtEtapa, type FtLead, type FtMudanca, type FtProposta,
} from "@/lib/funil-tempos";

const etapas: FtEtapa[] = [
  { id: "novo", nome: "Novo", ordem: 10, tipo: "aberta" }, { id: "qual", nome: "Qualificado", ordem: 20, tipo: "aberta" },
  { id: "prop", nome: "Proposta enviada", ordem: 30, tipo: "aberta" }, { id: "ganho", nome: "Ganho", ordem: 90, tipo: "ganho" },
];
const d = (dia: number) => new Date(Date.UTC(2026, 9, dia, 13)).toISOString(); // October 2026, 10:00 SP
const hist: FtMudanca[] = [
  { lead_id: "a", etapa_nova_id: "novo", mudou_em: d(1) }, { lead_id: "a", etapa_anterior_id: "novo", etapa_nova_id: "qual", mudou_em: d(3) },
  { lead_id: "a", etapa_anterior_id: "qual", etapa_nova_id: "prop", mudou_em: d(4) }, { lead_id: "a", etapa_anterior_id: "prop", etapa_nova_id: "ganho", mudou_em: d(14) },
  { lead_id: "b", etapa_nova_id: "novo", mudou_em: d(2) }, { lead_id: "b", etapa_anterior_id: "novo", etapa_nova_id: "qual", mudou_em: d(6) },
  { lead_id: "b", etapa_anterior_id: "qual", etapa_nova_id: "prop", mudou_em: d(8) },
  { lead_id: "c", etapa_nova_id: "novo", mudou_em: d(5) },
];
const leads: FtLead[] = [
  { id: "a", segmento: "Hotel/Pousada", porte: faixaPorte(30), cidade: "Búzios", vendedor: "Marcos", teste_instalado_em: d(4), teste_aprovado_em: d(11) },
  { id: "b", segmento: "Restaurante/Bar", porte: faixaPorte(10), cidade: "Cabo Frio", vendedor: "PH" },
  { id: "c", segmento: "Hotel/Pousada", created_at: d(5) },
];
const props: FtProposta[] = [
  { id: "p1", lead_id: "a", status: "aceita", enviada_em: d(4), aceita_em: d(14), ativado_em: d(17) },
  { id: "p2", lead_id: "b", status: "aceita", enviada_em: d(8), aceita_em: d(10) },
];

describe("tempo do funil (helpers puros)", () => {
  it("days, stats and formatting", () => {
    expect(diasEntre(d(1), d(4))).toBe(3);
    expect(diasEntre(d(4), d(1))).toBeNull();
    expect(estatDias([1, 3, 10])).toEqual({ n: 3, media: 4.7, mediana: 3 });
    expect(estatDias([2, 4])).toEqual({ n: 2, media: 3, mediana: 3 });
    expect(estatDias([])).toEqual({ n: 0, media: null, mediana: null });
    expect(fmtDias(3.5)).toBe("3,5 dias");
    expect(fmtDias(1)).toBe("1 dia");
    expect(fmtDias(0.25)).toBe("6 h");
    expect(faixaPorte(null)).toBe("Sem levantamento");
    expect(faixaPorte(120)).toBe("Grande (81+)");
  });
  it("time in each stage = until the next change; current stage counts as parado", () => {
    const t = temposPorEtapa(etapas, hist);
    const novo = t.find((x) => x.etapa_id === "novo")!, qual = t.find((x) => x.etapa_id === "qual")!, prop = t.find((x) => x.etapa_id === "prop")!;
    expect([novo.n, novo.mediana, novo.parados]).toEqual([2, 3, 1]); // a: 2 days, b: 4 days; c still in Novo
    expect([qual.n, qual.mediana]).toEqual([2, 1.5]); // a: 1 day, b: 2 days
    expect(qual).not.toHaveProperty("estimados");
    expect([prop.n, prop.mediana, prop.parados]).toEqual([1, 10, 1]);
    expect(t.some((x) => x.etapa_id === "ganho")).toBe(false);
    expect(etapaMaisDemorada(t)?.nome).toBe("Proposta enviada");
  });
  it("window keeps intervals that end inside it", () => {
    const t = temposPorEtapa(etapas, hist, { inicio: d(5), fim: d(9) });
    expect(t.find((x) => x.etapa_id === "novo")!.n).toBe(1); // only b (ended day 6)
    expect(t.find((x) => x.etapa_id === "prop")!.n).toBe(0); // a left Proposta on day 14
  });
  it("cycles: entry→accepted, sent→accepted, accepted→activation, test installed→approved", () => {
    const c = ciclos(leads, hist, props);
    expect(c.entrada_aceita).toEqual({ n: 2, media: 10.5, mediana: 10.5 }); // a 13 days, b 8 days
    expect(c.enviada_aceita.mediana).toBe(6); // 10 and 2
    expect(c.aceita_ativacao).toEqual({ n: 1, media: 3, mediana: 3 });
    expect(c.teste_aprovado).toEqual({ n: 1, media: 7, mediana: 7 });
  });
  it("slices and 'who decides faster'", () => {
    const seg = ciclosPorRecorte(leads, hist, props, "segmento");
    expect(seg.map((g) => [g.grupo, g.mediana])).toEqual([["Restaurante/Bar", 8], ["Hotel/Pousada", 13]]);
    const r = rankingDecisao(seg);
    expect(r.rapidos[0].grupo).toBe("Restaurante/Bar");
    expect(r.lentos[0].grupo).toBe("Hotel/Pousada");
    expect(ciclosPorRecorte(leads, hist, props, "porte").map((g) => g.grupo)).toEqual(["Pequeno (até 20)", "Médio (21–80)"]);
    expect(ciclosPorRecorte(leads, hist, props, "vendedor").map((g) => g.grupo)).toEqual(["PH", "Marcos"]);
  });
});

describe("tempo do funil é assunto de gestão", () => {
  it("only gestor, super_admin and admin may see funnel timing", () => {
    expect(podeVerTempoFunil(["gestor"])).toBe(true);
    expect(podeVerTempoFunil(["super_admin"])).toBe(true);
    expect(podeVerTempoFunil(["admin"])).toBe(true);
    expect(podeVerTempoFunil(["vendedor", "gestor"])).toBe(true);
    for (const r of ["vendedor", "consultor_tecnico", "faturamento", "financeiro", "operacional", "user", "visitante"]) expect(podeVerTempoFunil([r])).toBe(false);
    expect(podeVerTempoFunil([])).toBe(false);
    expect(podeVerTempoFunil(null)).toBe(false);
    expect(FT_RECUSA_GESTAO).toBe("Essa informação é da gestão; peça ao Arilson.");
  });
});

describe("mcp embeds the same helpers", () => {
  it("block is identical to the shared file", () => {
    const bloco = (s: string) => s.slice(s.indexOf("// BEGIN funil-tempos"), s.indexOf("// END funil-tempos"));
    const shared = bloco(readFileSync("supabase/functions/_shared/funil-tempos.ts", "utf8")).replace(/export /g, "");
    expect(bloco(readFileSync("supabase/functions/mcp/index.ts", "utf8"))).toBe(shared);
  });
});

// Flora Equipe questions over the same tables (Tuesday 10/11/2026, São Paulo).
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-10T14:00:00Z"));
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const PH = "5522999990002", MARCOS = "5522999990001", TECNICO = "5522999990003", FATURA = "5522999990004", GESTORA = "5522999990005";
function harness() {
  const n = (dia: number) => new Date(Date.UTC(2026, 10, dia, 13)).toISOString();
  const tables: Record<string, any[]> = {
    profiles: [{ user_id: "u1", name: "Marcos Serafim", phone: MARCOS, organization_id: org, is_active: true }, { user_id: "u2", name: "PH Nascimento", phone: PH, organization_id: org, is_active: true },
      { user_id: "u3", name: "Tiago Técnico", phone: TECNICO, organization_id: org, is_active: true }, { user_id: "u4", name: "Fátima Faturamento", phone: FATURA, organization_id: org, is_active: true },
      { user_id: "u5", name: "Gisele Gestora", phone: GESTORA, organization_id: org, is_active: true }],
    user_roles: [{ user_id: "u1", role: "vendedor" }, { user_id: "u2", role: "super_admin" }, { user_id: "u3", role: "consultor_tecnico" }, { user_id: "u4", role: "faturamento" }, { user_id: "u5", role: "gestor" }],
    ekkoa_coverage_areas: [{ organization_id: org, is_active: true, name: "Búzios", city: "Armação dos Búzios" }, { organization_id: org, is_active: true, name: "Cabo Frio", city: "Cabo Frio" }],
    lead_stages: etapas.map((e) => ({ ...e, organization_id: org })),
    leads: [
      { id: "a", organization_id: org, category: null, levantamento: { segmento: "Hotel/Pousada", porte: 30 }, city: "Búzios", assigned_to: "u1", canal_origem: "WHATSAPP", teste_instalado_em: n(1), teste_aprovado_em: n(6) },
      { id: "b", organization_id: org, levantamento: { segmento: "Restaurante/Bar", porte: 12 }, city: "Cabo Frio", assigned_to: "u2" },
    ],
    lead_stage_history: [
      { organization_id: org, lead_id: "a", etapa_nova_id: "novo", mudou_em: n(1) }, { organization_id: org, lead_id: "a", etapa_anterior_id: "novo", etapa_nova_id: "prop", mudou_em: n(2) },
      { organization_id: org, lead_id: "a", etapa_anterior_id: "prop", etapa_nova_id: "ganho", mudou_em: n(9) },
      { organization_id: org, lead_id: "b", etapa_nova_id: "novo", mudou_em: n(3) }, { organization_id: org, lead_id: "b", etapa_anterior_id: "novo", etapa_nova_id: "prop", mudou_em: n(7) },
      { organization_id: org, lead_id: "b", etapa_anterior_id: "prop", etapa_nova_id: "ganho", mudou_em: n(8) },
    ],
    proposals: [
      { id: "p1", organization_id: org, lead_id: "a", status: "aceita", enviada_em: n(2), aceita_em: n(9), ativado_em: n(10), assigned_to: "u1" },
      { id: "p2", organization_id: org, lead_id: "b", status: "aceita", enviada_em: n(7), aceita_em: n(8), assigned_to: "u2" },
    ],
  };
  const client = { from(table: string) {
    const f: Array<(r: any) => boolean> = [];
    const rows = () => (tables[table] ?? []).filter((r) => f.every((fn) => fn(r)));
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, lt: () => chain, ilike: () => chain, is: () => chain, not: () => chain, or: () => chain,
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; }, neq: () => chain, in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }), then: (res: any) => Promise.resolve({ data: rows(), error: null }).then(res),
    };
    return chain;
  }, storage: { from: () => ({ upload: async () => ({ error: { message: "x" } }) }) } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} }, EdgeRuntime: { waitUntil: () => {} }, fetch: vi.fn(),
    AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() }, Response, Request, URL, Blob, performance, TextEncoder, crypto, Date, Intl,
    CompressionStream, Uint8Array, DataView, Uint32Array, atob, btoa });
  const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return (phone: string, texto: string) => { context.params = { chat_id: `3DF9D839DDCF463A3A350ADF91C40B89-${phone}`, acao: "indicadores", texto }; return vm.runInContext("routeTool('flora_equipe', params)", context); };
}

describe("Flora Equipe — perguntas de tempo", () => {
  const ask = harness();
  it("'em que etapa os leads mais demoram?' → slowest stage, text only, last 90 days by default", async () => {
    const r = await ask(PH, "em que etapa os leads mais demoram?");
    expect(r.data.modo).toBe("tempo_funil");
    expect(r.data.periodo.rotulo).toContain("últimos 90 dias");
    expect(r.data.etapa_mais_demorada).toMatchObject({ nome: "Proposta enviada", n: 2, mediana_dias: 4 });
    expect(r.data.panorama).toBe(false);
    expect(r.data.mensagem_para_equipe).toContain("Onde mais demora: Proposta enviada — 4 dias");
    expect(r.data.mensagem_para_equipe).not.toContain("Ciclo:");
  });
  it("'quanto tempo da proposta aceita até ativar?' → accepted→activation", async () => {
    const r = await ask(PH, "quanto tempo da proposta aceita até ativar?");
    expect(r.data.ciclos.aceita_ativacao).toEqual({ n: 1, mediana_dias: 1, media_dias: 1 });
    expect(r.data.mensagem_para_equipe).toContain("Aceita→ativação 1 dia");
    expect(r.data.mensagem_para_equipe).toContain("teste instalado→aprovado 5 dias");
  });
  it("'qual segmento fecha mais rápido?' → ranking by segment", async () => {
    const r = await ask(PH, "qual segmento fecha mais rápido?");
    expect(r.data.recorte.agrupado_por).toBe("segmento");
    expect(r.data.mais_rapido).toBe("Restaurante/Bar");
    expect(r.data.mais_lento).toBe("Hotel/Pousada");
    expect(r.data.mensagem_para_equipe).toContain("Segmento que fecha mais rápido: Restaurante/Bar 5 dias");
  });
  it("period in the text is respected", async () => {
    const r = await ask(GESTORA, "em que etapa os leads do Marcos mais demoram este mês?");
    expect(r.data.periodo.rotulo).toContain("novembro/2026");
    expect(r.data.recorte.consultor).toBe("Marcos Serafim");
    expect(r.data.etapa_mais_demorada).toMatchObject({ nome: "Proposta enviada", n: 1, mediana_dias: 7 });
  });
  it("gestor gets the numbers", async () => {
    const r = await ask(GESTORA, "qual segmento fecha mais rápido?");
    expect(r.data.recusado).toBeUndefined();
    expect(r.data.mais_rapido).toBe("Restaurante/Bar");
  });
  for (const [papel, fone] of [["vendedor", MARCOS], ["consultor_tecnico", TECNICO], ["faturamento", FATURA]] as const) {
    for (const pergunta of ["em que etapa os leads mais demoram?", "quanto tempo do aceite até ativar?", "qual segmento fecha mais rápido?", "tempo do funil do mês"]) {
      it(`${papel} is refused with no numbers: "${pergunta}"`, async () => {
        const r = await ask(fone, pergunta);
        expect(r.data.recusado).toBe(true);
        expect(r.data.mensagem_para_equipe).toBe("Essa informação é da gestão; peça ao Arilson.");
        expect(r.data.mensagem_para_equipe).not.toMatch(/\d/);
        expect(r.data).not.toHaveProperty("ciclos");
        expect(r.data).not.toHaveProperty("etapa_mais_demorada");
        expect(r.data.imagem_enviada).toBe(false);
      });
    }
  }
  it("'tempo do funil do mês' is a panorama (image attempted)", async () => {
    const r = await ask(PH, "tempo do funil do mês");
    expect(r.data.panorama).toBe(true);
    expect(r.data.ciclos.entrada_aceita.n).toBe(2);
  });
});
