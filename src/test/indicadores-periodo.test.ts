import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { fontesBoletim } from "../../supabase/functions/_shared/boletim-fonte";

// Tuesday 10/11/2026, 11:00 in São Paulo.
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-10T14:00:00Z"));
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const PHONES = { marcos: "5522999990001", ph: "5522999990002", fatima: "5522999990004" };
const chat = (phone: string) => `3DF9D839DDCF463A3A350ADF91C40B89-${phone}`;

function baseTables(): Record<string, any[]> {
  return {
    profiles: [
      { user_id: "u1", name: "Marcos Serafim", phone: PHONES.marcos, organization_id: org, is_active: true },
      { user_id: "u2", name: "PH Nascimento", phone: PHONES.ph, organization_id: org, is_active: true },
      { user_id: "u4", name: "Fátima Souza", phone: PHONES.fatima, organization_id: org, is_active: true },
    ],
    user_roles: [{ user_id: "u1", role: "vendedor" }, { user_id: "u1", role: "consultor_tecnico" }, { user_id: "u2", role: "super_admin" }, { user_id: "u4", role: "faturamento" }],
    ekkoa_coverage_areas: [
      { organization_id: org, is_active: true, name: "Búzios", city: "Armação dos Búzios" },
      { organization_id: org, is_active: true, name: "Cabo Frio", city: "Cabo Frio" },
    ],
    schedules: [
      { id: "s1", organization_id: org, scheduled_date: "2026-11-10", status: "concluido", resultado: "boa", ocorrencia_tipo: "primeira_visita", assigned_to: "u1", lead_id: "l1", ocorrencia_codigo: "OC-000101", title: "Pousada Sol" },
      { id: "s2", organization_id: org, scheduled_date: "2026-11-10", status: "nao_realizado", nao_realizado_motivo: "cliente_ausente", ocorrencia_tipo: "manutencao_preventiva", assigned_to: "u1", client_id: "c1", ocorrencia_codigo: "OC-000102", title: "Hotel Mar" },
      { id: "s3", organization_id: org, scheduled_date: "2026-11-10", status: "concluido", resultado: "mediana", source: "flora_relatada", ocorrencia_tipo: "primeira_visita", assigned_to: "u2", lead_id: "l2", ocorrencia_codigo: "OC-000103", title: "Bar do Zé" },
      { id: "s4", organization_id: org, scheduled_date: "2026-11-09", status: "concluido", resultado: "boa", ocorrencia_tipo: "primeira_visita", assigned_to: "u1", lead_id: "l1", ocorrencia_codigo: "OC-000104", title: "Pousada Sol" },
      { id: "s5", organization_id: org, scheduled_date: "2026-11-09", status: "em_atendimento", coleta_status: "pendente", ocorrencia_tipo: "instalacao_teste", assigned_to: "u2", lead_id: "l2", ocorrencia_codigo: "OC-000105", title: "Bar do Zé" },
      { id: "s6", organization_id: org, scheduled_date: "2026-11-08", status: "concluido", resultado: "boa", ocorrencia_tipo: "primeira_visita", assigned_to: "u1", lead_id: "l1", ocorrencia_codigo: "OC-000106", title: "Pousada Sol" },
      { id: "s7", organization_id: org, scheduled_date: "2026-10-15", status: "concluido", resultado: "ruim", ocorrencia_tipo: "primeira_visita", assigned_to: "u1", lead_id: "l1", ocorrencia_codigo: "OC-000107", title: "Pousada Sol" },
      { id: "s8", organization_id: org, scheduled_date: "2026-11-10", status: "cancelado", ocorrencia_tipo: "primeira_visita", assigned_to: "u1", title: "Cancelada" },
    ],
    schedule_checkins: [
      { organization_id: org, schedule_id: "s1", checkin_em: "2026-11-10T12:00:00Z", precisao_m: 25, distancia_m: 30, fora_do_raio: false, destino_sem_coordenadas: false },
      { organization_id: org, schedule_id: "s2", checkin_em: "2026-11-10T13:00:00Z", precisao_m: 80, distancia_m: 50, fora_do_raio: false, destino_sem_coordenadas: false },
      { organization_id: org, schedule_id: "s4", checkin_em: "2026-11-09T13:00:00Z", precisao_m: 10, distancia_m: 20, fora_do_raio: false, destino_sem_coordenadas: false },
    ],
    leads: [
      { id: "l1", organization_id: org, created_at: "2026-11-10T12:00:00Z", updated_at: "2026-11-10T12:30:00Z", canal_origem: "WHATSAPP", assigned_to: "u1", city: "Armação dos Búzios", stage_id: "st2" },
      { id: "l2", organization_id: org, created_at: "2026-11-09T12:00:00Z", updated_at: "2026-11-09T12:00:00Z", canal_origem: null, assigned_to: "u2", city: "Cabo Frio", stage_id: "st1" },
    ],
    clients: [{ id: "c1", organization_id: org, city: "Cabo Frio" }],
    lead_stages: [{ id: "st1", organization_id: org, ordem: 10, tipo: "aberta", chave: "novo" }, { id: "st2", organization_id: org, ordem: 20, tipo: "aberta", chave: "qualificado" }],
    proposals: [
      { id: "pr1", organization_id: org, status: "aceita", final_value: 1000, updated_at: "2026-11-10T13:00:00Z", assigned_to: "u1", created_by: "u1", lead_id: "l1" },
      { id: "pr2", organization_id: org, status: "enviada", final_value: 500, pdf_gerado_em: "2026-11-10T13:00:00Z", updated_at: "2026-11-10T13:00:00Z", assigned_to: "u2", created_by: "u2", lead_id: "l2" },
    ],
    tarefas_faturamento: [
      { id: "t1", organization_id: org, acao: "emitir", status: "concluida", concluida_em: "2026-11-10T12:00:00Z", updated_at: "2026-11-10T12:00:00Z", schedule_id: "s1", empresa_nome: "Pousada Sol" },
      { id: "t2", organization_id: org, acao: "emitir_comodato", status: "aberta", prazo: "2026-11-09T20:00:00Z", updated_at: "2026-11-09T20:00:00Z", schedule_id: "s3", empresa_nome: "Hotel Sol" },
      { id: "t3", organization_id: org, acao: "emitir", status: "cancelada", updated_at: "2026-11-10T12:00:00Z", schedule_id: "s2", empresa_nome: "Hotel Mar" },
    ],
    atendimentos: [{ id: "a1", organization_id: org, aberto_em: "2026-11-10T12:00:00Z", assumido_em: "2026-11-10T12:10:00Z", assumido_por: "u2", status: "em_atendimento", lead_id: "l2" }],
    comodatos: [{ id: "cm1", organization_id: org, status: "ATIVO", data_inicio: "2026-11-10", created_by: "u1", lead_id: "l1" }],
    lead_timeline: [],
  };
}

function harness(tables = baseTables()) {
  const client = { from(table: string) {
    const f: Array<(r: any) => boolean> = [];
    const rows = () => (tables[table] ?? []).filter((r) => f.every((fn) => fn(r)));
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, lt: () => chain, ilike: () => chain, is: () => chain, not: () => chain, or: () => chain,
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; }, neq: (k: string, v: any) => { f.push((r) => r[k] !== v); return chain; },
      in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }), single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any) => Promise.resolve({ data: rows(), error: null }).then(res),
    };
    return chain;
  }, storage: { from: () => ({ upload: async () => ({ error: { message: "x" } }) }) } };
  const fetch = vi.fn();
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch, AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    Response, Request, URL, Blob, performance, TextEncoder, crypto, Date, Intl, CompressionStream, Uint8Array, DataView, Uint32Array, atob, btoa });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { context, fetch, run: (expr: string, vars: Record<string, unknown> = {}) => { Object.assign(context, vars); return vm.runInContext(expr, context); },
    route: (phone: string, texto: string) => { context.params = { chat_id: chat(phone), acao: "indicadores", texto }; return vm.runInContext("routeTool('flora_equipe', params)", context); } };
}

describe("período livre (America/Sao_Paulo, hoje = ter 10/11/2026)", () => {
  const h = harness();
  const p = (t: string) => h.run("resolverPeriodo(t, '2026-11-10')", { t });
  const casos: Array<[string, string, string, string, string]> = [
    ["", "2026-11-10", "2026-11-10", "2026-11-09", "2026-11-09"],
    ["indicadores de hoje", "2026-11-10", "2026-11-10", "2026-11-09", "2026-11-09"],
    ["como foi ontem?", "2026-11-09", "2026-11-09", "2026-11-08", "2026-11-08"],
    ["e anteontem?", "2026-11-08", "2026-11-08", "2026-11-07", "2026-11-07"],
    ["como estamos esta semana", "2026-11-09", "2026-11-10", "2026-11-02", "2026-11-03"],
    ["resumo da semana passada", "2026-11-02", "2026-11-08", "2026-10-26", "2026-11-01"],
    ["números deste mês", "2026-11-01", "2026-11-10", "2026-10-01", "2026-10-10"],
    ["boletim do mês passado", "2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"],
    ["como foi outubro?", "2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"],
    ["resumo de outubro de 2026", "2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"],
    ["e dezembro?", "2025-12-01", "2025-12-31", "2025-11-01", "2025-11-30"],
    ["março", "2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28"],
    ["janeiro de 2026", "2026-01-01", "2026-01-31", "2025-12-01", "2025-12-31"],
    ["últimos 7 dias", "2026-11-04", "2026-11-10", "2026-10-28", "2026-11-03"],
    ["ultimos 30 dias", "2026-10-12", "2026-11-10", "2026-09-12", "2026-10-11"],
    ["últimos quinze dias", "2026-10-27", "2026-11-10", "2026-10-12", "2026-10-26"],
    ["de 1 a 15/11", "2026-11-01", "2026-11-15", "2026-10-17", "2026-10-31"],
    ["01/10 a 31/10", "2026-10-01", "2026-10-31", "2026-08-31", "2026-09-30"],
    ["de 01/10/2026 até 15/10/2026", "2026-10-01", "2026-10-15", "2026-09-16", "2026-09-30"],
    ["de 1 a 15 de outubro", "2026-10-01", "2026-10-15", "2026-09-16", "2026-09-30"],
    ["dia 05/11", "2026-11-05", "2026-11-05", "2026-11-04", "2026-11-04"],
  ];
  it.each(casos)("%s", (texto, ini, fim, aIni, aFim) => {
    const r = p(texto);
    expect([r.inicio, r.fim, r.anterior.inicio, r.anterior.fim]).toEqual([ini, fim, aIni, aFim]);
  });
  it("labels the resolved period", () => {
    expect(p("").rotulo).toBe("hoje (10/11)");
    expect(p("").anterior.rotulo).toBe("ontem (09/11)");
    expect(p("semana passada").rotulo).toBe("semana passada (02/11 a 08/11)");
    expect(p("outubro").rotulo).toBe("outubro/2026");
    expect(p("este mês").rotulo).toContain("novembro/2026 até hoje");
    expect(p("últimos 7 dias").rotulo).toBe("últimos 7 dias (04/11 a 10/11)");
  });
  it("'do Marco' is a person, not March", () => {
    expect(p("indicadores do Marco").inicio).toBe("2026-11-10");
  });
});

describe("recorte e permissões", () => {
  it("nickname resolves to the team member", () => {
    const h = harness();
    expect(h.run("apelidoBase('marquinho')")).toBe("marc");
    expect(h.run("acharPessoa('Marquinho', perfis).map(p => p.user_id)", { perfis: baseTables().profiles })).toEqual(["u1"]);
  });
  it("gestor sees everyone, the ranking and the comparison with yesterday", async () => {
    const r = await harness().route(PHONES.ph, "indicadores de hoje");
    expect(r.data.visao).toBe("gestor");
    expect(r.data.periodo.rotulo).toBe("hoje (10/11)");
    expect(r.data.numeros).toMatchObject({ operacoes: 3, concluidas: 2, pct_concluidas: 67, nao_realizadas: 1, no_local: 1, fora_local: 1, sem_checkin: 1, leads_novos: 1, propostas_aceitas: 1, notas_emitidas: 1, notas_pendentes: 1 });
    expect(r.data.anterior).toMatchObject({ operacoes: 2, pct_concluidas: 50 });
    const m = r.data.mensagem_para_equipe as string;
    expect(m).toContain("hoje (10/11) · vs ontem (09/11)");
    expect(m).toContain("Operações: 3 ▲1");
    expect(m).toContain("67% concluídas ▲17 pp");
    expect(m).toContain("1 relatadas pela Flora");
    expect(m).toContain("1 leads novos =");
    expect(m).toContain("1 aceitas ▲1 (R$ 1.000,00)");
    expect(m).toContain("10 min em média até assumir");
    expect(m).toContain("Por vendedor: Marcos 2 ops");
    expect(m).toContain("https://fera.exudustech.com.br/agenda");
    expect(r.data.ranking.map((x: any) => x.nome)).toEqual(["Marcos", "PH"]);
    expect(r.data.panorama).toBe(true);
    expect(r.data.imagem_enviada).toBe(false);
  });
  it("gestor filters by seller nickname and month, without ranking", async () => {
    const r = await harness().route(PHONES.ph, "indicadores do Marquinho no mês");
    expect(r.data.recorte.consultor).toBe("Marcos Serafim");
    expect(r.data.numeros.operacoes).toBe(4);
    expect(r.data.anterior.operacoes).toBe(0);
    expect(r.data.ranking).toEqual([]);
    expect(r.data.mensagem_para_equipe).toContain("· Marcos");
    expect(r.data.mensagem_para_equipe).not.toContain("Por vendedor");
  });
  it("vendedor only ever sees own numbers, even when asking for someone else", async () => {
    const r = await harness().route(PHONES.marcos, "indicadores do PH esta semana");
    expect(r.data.visao).toBe("campo");
    expect(r.data.numeros.operacoes).toBe(3);
    expect(r.data.ranking).toEqual([]);
    expect(r.data.mensagem_para_equipe).toContain("Você vê só os seus números.");
    expect(r.data.mensagem_para_equipe).not.toContain("Atendimento:");
  });
  it("city with alias (Búzios = Armação dos Búzios)", async () => {
    const r = await harness().route(PHONES.ph, "indicadores de Búzios hoje");
    expect(r.data.recorte.cidade).toBe("Armação dos Búzios");
    expect(r.data.numeros.operacoes).toBe(1);
    expect(r.data.numeros.leads_novos).toBe(1);
  });
  it("operation type filter", async () => {
    const r = await harness().route(PHONES.ph, "indicadores de manutenção hoje");
    expect(r.data.recorte.tipo).toBe("manutenções");
    expect(r.data.numeros.operacoes).toBe(1);
  });
  it("point question answers only the topic, as text, without image", async () => {
    const h = harness();
    const r = await h.route(PHONES.ph, "quantas propostas aceitas no mês?");
    expect(r.data.pontual).toBe(true);
    expect(r.data.panorama).toBe(false);
    expect(r.data.mensagem_para_equipe).toContain("1 aceitas");
    expect(r.data.mensagem_para_equipe).not.toContain("Operações:");
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("faturamento sees issued, cancelled and pending invoices", async () => {
    const r = await harness().route(PHONES.fatima, "notas de hoje");
    expect(r.data.visao).toBe("faturamento");
    const m = r.data.mensagem_para_equipe as string;
    expect(m).toContain("Emitidas: 1 ▲1");
    expect(m).toContain("Canceladas/baixadas: 1 ▲1");
    expect(m).toContain("Pendentes agora: 1 (1 com prazo vencido)");
    expect(m).toMatch(/NF de Comodato \(1\): Hotel Sol até 09\/11/);
  });
  it("demo records count like any other", async () => {
    const t = baseTables();
    t.schedules.push({ id: "d1", organization_id: org, scheduled_date: "2026-11-10", status: "concluido", resultado: "boa", ocorrencia_tipo: "primeira_visita", assigned_to: "u1", title: "[DEMO] Pousada" });
    const r = await harness(t).route(PHONES.ph, "indicadores de hoje");
    expect(r.data.numeros.operacoes).toBe(4);
  });
});

describe("boletim em imagem", () => {
  beforeAll(async () => { await initWasm(readFileSync("node_modules/@resvg/resvg-wasm/index_bg.wasm")); });
  const dados = {
    titulo: "Indicadores da equipe", periodo: "esta semana (09/11 a 10/11)", comparacao: "semana anterior (02/11 a 03/11)", recorte: "Armação dos Búzios", gerado: "10/11/2026 às 11:00",
    cards: [{ rotulo: "Operações", valor: "12", delta: "▲3" }, { rotulo: "Concluídas", valor: "67%", sub: "8 de 12", delta: "▼5 pp" },
      { rotulo: "Leads novos", valor: "5", delta: "=" }, { rotulo: "Propostas aceitas", valor: "2", sub: "R$ 3.282,44", delta: "▲1" }],
    barras: { titulo: "Resultado das operações", itens: [{ rotulo: "Concluídas", valor: 8, cor: "#91BF4B" }, { rotulo: "Não realizadas", valor: 2, cor: "#C8463D" },
      { rotulo: "Info pendente", valor: 1, cor: "#E3A72F" }, { rotulo: "Em aberto", valor: 1, cor: "#5EB5BF" }] },
    lista: { titulo: "Ranking por vendedor", vazio: "", linhas: [{ nome: "Marcos · 7 operações", valor: "6 concl. · 86% comprovadas" }, { nome: "PH · 5 operações", valor: "2 concl. · 40% comprovadas" }] },
  };
  it("renders a 1080×1350 PNG with legible text", () => {
    const h = harness();
    const svg: string = h.run("boletimSvg(d)", { d: dados });
    expect(svg).toContain("Comparado com semana anterior");
    const png: Uint8Array = h.run("renderizarBoletim(svg, R, f)", { svg, R: Resvg, f: fontesBoletim() });
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const dv = new DataView(png.buffer, png.byteOffset);
    expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([1080, 1350]);
    expect(png.length).toBeGreaterThan(20_000);
    writeFileSync("/tmp/boletim-teste.png", png);
    // Text really drawn with the embedded font: petrol pixels in the period line, not just shapes.
    const img = new Resvg(svg, { font: { fontBuffers: fontesBoletim(), defaultFontFamily: "Montserrat", loadSystemFonts: false } }).render();
    const px = img.pixels, w = img.width;
    let petroleo = 0;
    for (let y = 180; y < 225; y++) for (let x = 60; x < 700; x++) { const i = (y * w + x) * 4; if (px[i] < 40 && px[i + 1] > 60 && px[i + 1] < 110 && px[i + 2] > 70 && px[i + 2] < 120) petroleo++; }
    expect(petroleo).toBeGreaterThan(2000);
  });
  it("without the renderer, falls back to the simple chart", async () => {
    const h = harness();
    const png: Uint8Array = await h.run("graficoPng('Fera', [{ rotulo: 'Concluidas', valor: 3 }])");
    expect(Array.from(png.slice(0, 4))).toEqual([137, 80, 78, 71]);
  });
});
