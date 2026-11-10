import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { cnpjDemo, planejarDatas, telefonesDemo, escolherPares, CENARIO_RESUMO } from "@/lib/demo-cenario";
import { idsDoPayload, semDemo } from "../../supabase/functions/_shared/demo-guard";

// Route days as registered for NitsClean (Búzios/Cabo Frio Mon+Fri, Rio das Ostras Tue+Thu, Saquarema/São Pedro Wed).
const AREAS = [
  { name: "Búzios", city: "Armação dos Búzios", dia_semana: "2ª feira e 6ª feira", horario_inicio: "09:00:00", horario_fim: "12:00:00" },
  { name: "Cabo Frio", city: "Cabo Frio", dia_semana: "2ª feira e 6ª feira", horario_inicio: "13:30:00", horario_fim: "16:30:00" },
  { name: "Rio das Ostras", city: "Rio das Ostras", dia_semana: "3ª feira e 5ª feira", horario_inicio: "15:00:00", horario_fim: "17:00:00" },
  { name: "Saquarema", city: "Saquarema", dia_semana: "4ª feira", horario_inicio: "15:00:00", horario_fim: "17:00:00" },
  { name: "São Pedro da Aldeia", city: "São Pedro da Aldeia", dia_semana: "4ª feira", horario_inicio: "09:30:00", horario_fim: "12:00:00" },
];

describe("cenário de demonstração: datas nos dias de rota", () => {
  it("segunda 09/11: ontem = sexta 06/11 (domingo não tem rota); hoje Búzios e Cabo Frio; amanhã Rio das Ostras", () => {
    const p = planejarDatas("2026-11-09", AREAS)!;
    expect(p.ontem_concluida).toEqual({ data: "2026-11-06", cidade: "Armação dos Búzios", hora: "09:00" });
    expect(p.ontem_nao_realizada).toEqual({ data: "2026-11-06", cidade: "Cabo Frio", hora: "13:30" });
    expect(p.hoje_andamento).toEqual({ data: "2026-11-09", cidade: "Armação dos Búzios", hora: "09:00" });
    expect(p.hoje_agendada).toEqual({ data: "2026-11-09", cidade: "Cabo Frio", hora: "13:30" });
    expect(p.amanha_teste).toEqual({ data: "2026-11-10", cidade: "Rio das Ostras", hora: "15:00" });
    expect(p.amanha_comercial).toEqual({ data: "2026-11-10", cidade: "Rio das Ostras", hora: "16:00" });
  });
  it("feriado na sexta: 'ontem' volta para a quinta (Rio das Ostras)", () => {
    const p = planejarDatas("2026-11-09", AREAS, (d) => d === "2026-11-06")!;
    expect(p.ontem_concluida.data).toBe("2026-11-05");
    expect(p.ontem_concluida.cidade).toBe("Rio das Ostras");
  });
  it("manutenção atrasada e retorno do teste ficam em dias de rota de Búzios, no passado", () => {
    const p = planejarDatas("2026-11-09", AREAS)!;
    expect(p.cliente_atrasada).toMatchObject({ data: "2026-11-06", cidade: "Armação dos Búzios" });
    expect(new Date(`${p.cliente_retorno_teste.data}T12:00:00Z`).getUTCDay()).toBeOneOf([1, 5]);
    expect(p.cliente_retorno_teste.data < "2026-10-27").toBe(true);
  });
});

describe("cenário de demonstração: telefones, CNPJ e produtos", () => {
  it("telefones fictícios 55 22 90000-00xx pulam qualquer número da equipe", () => {
    const t = telefonesDemo(3, ["22900000001", "+55 (22) 90000-0003"]);
    expect(t).toEqual(["5522900000002", "5522900000004", "5522900000005"]);
  });
  it("CNPJ de demonstração tem dígitos verificadores válidos e começa com 90.000", () => {
    const valido = (d: string) => {
      const calc = (len: number) => { const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const s = w.reduce((a, wi, i) => a + Number(d[i]) * wi, 0) % 11; return s < 2 ? 0 : 11 - s; };
      return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
    };
    for (const n of [1, 2, 3]) { const c = cnpjDemo(n); expect(c).toMatch(/^90000\d{9}$/); expect(valido(c)).toBe(true); }
  });
  it("pares refil + aparelho compatível só com preço e produto ativo", () => {
    const cat = [
      { id: "r1", name: "Papel A", price: 10, is_dispenser: false, compatible_dispenser_families: ["f1"] },
      { id: "r0", name: "Sem preço", price: 0, is_dispenser: false, compatible_dispenser_families: ["f1"] },
      { id: "d1", name: "Disp F1", is_dispenser: true, dispenser_family_id: "f1" },
      { id: "r2", name: "Galão B", price: "25,50", is_dispenser: false, compatible_dispenser_families: [] },
    ];
    const p = escolherPares(cat, 3);
    expect(p.map((x) => [x.refil.id, x.aparelho?.id ?? null])).toEqual([["r2", null], ["r1", "d1"]].sort((a, b) => (a[0] === "r1" ? -1 : 1) - (b[0] === "r1" ? -1 : 1)));
    expect(p.some((x) => x.refil.id === "r0")).toBe(false);
  });
  it("resumo lista o que o cenário cria", () => {
    expect(CENARIO_RESUMO.join(" ")).toMatch(/12 leads/);
    expect(CENARIO_RESUMO.join(" ")).toMatch(/Simples Remessa/);
  });
});

describe("guarda de notificações da demonstração", () => {
  it("pega os ids de registro do payload do aviso", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(idsDoPayload({ schedule_id: id, lead_id: "x", tarefa_numero: 3, atendimento_id: id })).toEqual([id, id]);
  });
  it("listas em lote descartam linhas da demonstração (própria ou ligada)", () => {
    const demo = new Set(["a", "lead-demo"]);
    expect(semDemo([{ id: "a" }, { id: "b", lead_id: "lead-demo" }, { id: "c", lead_id: "real" }], demo)).toEqual([{ id: "c", lead_id: "real" }]);
    expect(semDemo([{ id: "a" }], new Set())).toEqual([{ id: "a" }]);
  });
});

// ─── MCP: visita não agendada (anexar_coleta / registrar_nota sem visita aberta) ───
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const TEAM_CHAT = "3DF9D839DDCF463A3A350ADF91C40B89-5522999990001";

function harness(extra: Record<string, any[]> = {}, rpcDemo = false) {
  const tables: Record<string, any[]> = {
    profiles: [{ user_id: "vend", name: "Marcos", phone: "5522999990001", organization_id: org, is_active: true }],
    user_roles: [{ user_id: "vend", role: "vendedor" }],
    schedules: [], leads: [], clients: [], holidays: [], lead_stages: [{ id: "st-vr", chave: "visita_realizada", organization_id: org }],
    ekkoa_coverage_areas: AREAS.map((a, i) => ({ id: `a${i}`, organization_id: org, is_active: true, zip_code_start: null, zip_code_end: null, ...a })),
    notification_recipients: [{ id: "r1", nome: "Gestor", whatsapp: "5522988887777", user_id: null, organization_id: org, ativo: true, eventos: ["transferencia_humano"] }],
    ...extra,
  };
  const writes: any[] = [];
  const client = { rpc: vi.fn(async () => ({ data: rpcDemo, error: null })), from(table: string) {
    let op = "read", value: any; const f: Array<(r: any) => boolean> = [];
    const rows = () => (tables[table] ?? []).filter((r) => f.every((fn) => fn(r)));
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain, is: () => chain, not: () => chain, contains: () => chain,
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; }, neq: (k: string, v: any) => { f.push((r) => r[k] !== v); return chain; },
      in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; }, or: () => chain,
      update: (v: any) => { op = "update"; value = v; return chain; }, insert: (v: any) => { op = "insert"; value = v; return chain; },
      maybeSingle: async () => { if (op !== "read") writes.push({ table, op, value }); return { data: rows()[0] ?? null, error: null }; },
      single: async () => { if (op !== "read") writes.push({ table, op, value }); return { data: op === "insert" ? { id: `new-${table}`, ocorrencia_codigo: table === "schedules" ? "OC-000042" : undefined } : rows()[0] ?? null, error: null }; },
      then: (res: any) => { if (op !== "read") writes.push({ table, op, value }); return Promise.resolve({ data: rows(), error: null }).then(res); },
    };
    return chain;
  } };
  const fetch = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ pendencias: ["Quem decide a compra"], resumo: "Resumo" }), body: { cancel: async () => {} } }));
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch, AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    Response, Request, URL, performance, TextEncoder, crypto, Date, Intl });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { writes, client, fetch, context, route: (method: string, params: any) => { context.method = method; context.params = params; return vm.runInContext("routeTool(method, params)", context); } };
}
const TEXTO = "Visitei hoje, falei com o Zé, querem papel e sabonete nos 2 banheiros";

describe("Flora Equipe: visita não agendada", () => {
  it("sem visita aberta e sem empresa → pergunta só o nome e a cidade, sem gravar", async () => {
    const h = harness();
    const r = await h.route("flora_equipe", { chat_id: TEAM_CHAT, acao: "anexar_coleta", texto: TEXTO });
    expect(r.data.mensagem_para_equipe).toBe("Não achei visita sua aberta. Para eu registrar a visita, me diga o nome do estabelecimento e a cidade.");
    expect(h.writes).toHaveLength(0);
  });
  it("com empresa e cidade → oferece registrar e devolve codigo_confirmacao, sem gravar", async () => {
    const h = harness();
    const r = await h.route("flora_equipe", { chat_id: TEAM_CHAT, acao: "anexar_coleta", texto: TEXTO, empresa: "Bar do Zé", cidade: "Búzios" });
    expect(r.data.mensagem_para_equipe).toBe("Não achei visita sua aberta. Quer que eu registre a visita a Bar do Zé agora?");
    expect(r.data.codigo_confirmacao).toMatch(/^[0-9a-z]+\.[0-9a-f]{18}$/);
    expect(r.data.cidade).toBe("Armação dos Búzios");
    expect(h.writes).toHaveLength(0);
  });
  it("cidade no próprio texto também vale (alias Búzios)", async () => {
    const r = await harness().route("flora_equipe", { chat_id: TEAM_CHAT, acao: "anexar_coleta", texto: `${TEXTO} lá em Búzios`, dados: { empresa: "Bar do Zé" } });
    expect(r.data.precisa_confirmacao).toBe(true);
    expect(r.data.cidade).toBe("Armação dos Búzios");
  });
  it("confirmar=true + código → cria lead e 1ª visita comercial realizada hoje, relatada pela Flora, sem check-in, e devolve o que falta", async () => {
    const h = harness();
    const base = { chat_id: TEAM_CHAT, acao: "anexar_coleta", texto: TEXTO, empresa: "Bar do Zé", cidade: "Búzios" };
    const offer = await h.route("flora_equipe", base);
    const r = await h.route("flora_equipe", { ...base, confirmar: true, codigo_confirmacao: offer.data.codigo_confirmacao });
    expect(r.success).toBe(true);
    const lead = h.writes.find((w) => w.table === "leads" && w.op === "insert");
    expect(lead.value).toMatchObject({ empresa_nome: "Bar do Zé", city: "Armação dos Búzios", assigned_to: "vend", stage_id: "st-vr" });
    const s = h.writes.find((w) => w.table === "schedules" && w.op === "insert");
    expect(s.value).toMatchObject({ ocorrencia_tipo: "primeira_visita", schedule_type: "visita_comercial", status: "concluido", scheduled_date: "2026-11-09",
      source: "flora_relatada", assigned_to: "vend", lead_id: "new-leads" });
    expect(h.writes.some((w) => w.table === "schedule_checkins")).toBe(false);
    expect(h.writes.find((w) => w.table === "schedule_evidencias").value).toMatchObject({ tipo: "texto", transcricao: TEXTO, origem: "flora" });
    expect(r.data.mensagem_para_equipe).toContain("#OC-000042 (relatada pela Flora, sem check-in)");
    expect(r.data.pendencias).toEqual(["Quem decide a compra"]);
  });
  it("código errado ou texto diferente → não grava", async () => {
    const h = harness();
    const base = { chat_id: TEAM_CHAT, acao: "anexar_coleta", texto: TEXTO, empresa: "Bar do Zé", cidade: "Búzios" };
    const offer = await h.route("flora_equipe", base);
    const r = await h.route("flora_equipe", { ...base, texto: "sim", confirmar: true, codigo_confirmacao: offer.data.codigo_confirmacao });
    expect(r.success).toBe(false);
    expect(h.writes).toHaveLength(0);
  });
  it("lead aberto da mesma empresa e cidade (alias) é reaproveitado, sem criar outro", async () => {
    const h = harness({ leads: [{ id: "L1", organization_id: org, empresa_nome: "Bar do Zé", city: "Armação dos Búzios", client_id: null, stage: "novo", pessoa_id: "P1", stage_id: null }] });
    const base = { chat_id: TEAM_CHAT, acao: "registrar_nota", texto: TEXTO, empresa: "bar do ze", cidade: "Buzios" };
    const offer = await h.route("flora_equipe", base);
    expect(offer.data.cadastro_existente).toBe("lead");
    await h.route("flora_equipe", { ...base, confirmar: true, codigo_confirmacao: offer.data.codigo_confirmacao });
    expect(h.writes.some((w) => w.table === "leads" && w.op === "insert")).toBe(false);
    expect(h.writes.find((w) => w.table === "schedules" && w.op === "insert").value).toMatchObject({ lead_id: "L1", source: "flora_relatada" });
  });
  it("cidade fora da cobertura (São Paulo) → não registra", async () => {
    const h = harness();
    const r = await h.route("flora_equipe", { chat_id: TEAM_CHAT, acao: "anexar_coleta", texto: TEXTO, empresa: "Bar Paulista", cidade: "São Paulo" });
    expect(r.success).toBe(false);
    expect(r.data.mensagem_para_equipe).toMatch(/fora da área/);
    expect(h.writes).toHaveLength(0);
  });
});

describe("Flora: avisos da equipe não saem para registros da demonstração", () => {
  it("dispatchTeamNotification para lead demo não envia nem registra", async () => {
    const h = harness({}, true);
    h.context.lead = "11111111-2222-3333-4444-555555555555";
    await vm.runInContext("dispatchTeamNotification(getClient(), 'transferencia_humano', {}, lead)", h.context);
    expect(h.client.rpc).toHaveBeenCalledWith("demo_envolvido", { _ids: ["11111111-2222-3333-4444-555555555555"] });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.writes).toHaveLength(0);
  });
});
