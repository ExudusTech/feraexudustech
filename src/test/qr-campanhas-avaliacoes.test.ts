import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { qrComplementos, qrEscolherCampanha, qrMensagem, qrNotaValida, qrNps, qrNumeroDaRef, qrPrecisaAlerta, qrRef, qrRenderizar, qrSaudacao, qrSentimento, QR_TEXTO_RESERVA, type QrCampanha } from "@/lib/qr";

const domingo12h = new Date("2026-11-15T15:00:00Z"); // domingo 12:00 em São Paulo
const terca9h = new Date("2026-11-10T12:00:00Z"); // terça 09:00 em São Paulo
const campanhas: QrCampanha[] = [
  { nome: "Padrão", texto: "{saudacao}! Que bom te ver no {estabelecimento} 😊 Quer dar uma nota de 0 a 10 para o ambiente?", padrao: true, prioridade: 0 },
  { nome: "Domingo de praia", texto: "{saudacao}! Bom {dia_semana} no {estabelecimento}!", dias_semana: [0], hora_inicio: "11:00", hora_fim: "15:00", prioridade: 50 },
  { nome: "Hotéis", texto: "{saudacao}! Como está a estadia? Nota de 0 a 10?", segmentos: ["Hotel/Pousada"], prioridade: 20 },
  { nome: "Vencida", texto: "Promo antiga", fim: "2026-10-31", prioridade: 90 },
];
const vars = { estabelecimento: "Pousada Mar Azul", segmento: "Hotel/Pousada", produto_do_aparelho: "Dispenser" };

describe("código ref do QR", () => {
  it("traduz de volta para a etiqueta e nunca mostra o número", () => {
    for (const n of [1, 2, 123, 500, 999999, 900001]) {
      const r = qrRef(n);
      expect(r).toMatch(/^Q[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(r).not.toContain(String(n).padStart(6, "0"));
      expect(qrNumeroDaRef(r)).toBe(n);
      expect(qrNumeroDaRef(`Bom dia! Que bom te ver no X 😊\n\nref ${r}`)).toBe(n);
    }
    expect(qrRef(1)).not.toBe(qrRef(2));
    expect(qrNumeroDaRef("sem código")).toBeNull();
  });
});

describe("campanhas do QR", () => {
  it("domingo 11–15h: a campanha do horário, por prioridade", () => {
    expect(qrEscolherCampanha(campanhas, domingo12h, vars).nome).toBe("Domingo de praia");
    expect(qrRenderizar("{saudacao}! Bom {dia_semana} no {estabelecimento}!", vars, domingo12h)).toBe("Boa tarde! Bom domingo no Pousada Mar Azul!");
  });
  it("segmento opcional e vigência: fora do horário vale a do segmento; vencida nunca", () => {
    expect(qrEscolherCampanha(campanhas, terca9h, vars).nome).toBe("Hotéis");
    expect(qrEscolherCampanha(campanhas, terca9h, { ...vars, segmento: "Escola" }).nome).toBe("Padrão");
  });
  it("aparelho não ativado: pula campanhas com {estabelecimento}; sem nenhuma, texto de reserva", () => {
    expect(qrEscolherCampanha(campanhas.slice(0, 1), terca9h, {}).texto).toBe(QR_TEXTO_RESERVA);
    expect(qrEscolherCampanha([], terca9h, vars).texto).toBe(QR_TEXTO_RESERVA);
  });
  it("saudação pelo horário de São Paulo", () => {
    expect(qrSaudacao(9 * 60)).toBe("Bom dia");
    expect(qrSaudacao(14 * 60)).toBe("Boa tarde");
    expect(qrSaudacao(20 * 60)).toBe("Boa noite");
  });
  it("mensagem pública termina com o ref discreto e não cita 'aparelho nº'", () => {
    const m = qrMensagem(campanhas, terca9h, { ...vars, segmento: "Escola" }, qrRef(123));
    expect(m.texto).toBe(`Bom dia! Que bom te ver no Pousada Mar Azul 😊 Quer dar uma nota de 0 a 10 para o ambiente?\n\nref ${qrRef(123)}`);
    expect(m.texto).not.toMatch(/aparelho n|000123/);
  });
});

describe("avaliação do QR", () => {
  it("nota de 0 a 10", () => {
    expect(qrNotaValida(8)).toBe(8); expect(qrNotaValida("10")).toBe(10);
    expect(qrNotaValida(11)).toBeNull(); expect(qrNotaValida("oito")).toBeNull(); expect(qrNotaValida(7.5)).toBeNull();
  });
  it("sentimento simples e alerta para nota ≤ 6 ou comentário negativo", () => {
    expect(qrSentimento(10, "Banheiro sempre limpo")).toBe("positivo");
    expect(qrSentimento(8, null)).toBe("neutro");
    expect(qrSentimento(9, "faltou papel, estava sujo")).toBe("negativo");
    expect(qrPrecisaAlerta(6, null)).toBe(true);
    expect(qrPrecisaAlerta(7, null)).toBe(false);
    expect(qrPrecisaAlerta(8, "cheiro ruim no banheiro")).toBe(true);
  });
  it("NPS = % promotores (9–10) − % detratores (0–6)", () => {
    expect(qrNps([10, 9, 8, 4])).toEqual({ n: 4, media: 7.8, nps: 25, promotores: 2, detratores: 1 });
    expect(qrNps([]).nps).toBeNull();
  });
  it("complementos do kit: o que o cliente ainda não tem", () => {
    const catalogo = [
      { id: "disp", name: "Dispenser Sabonete", is_dispenser: true, dispenser_family_id: "f1" },
      { id: "ref1", name: "Refil Sabonete Espuma", compatible_dispenser_families: ["f1"] },
      { id: "pt", name: "Papel Toalha Interfolhado" }, { id: "aro", name: "Aromatizador Ekkoa" }, { id: "gel", name: "Álcool Gel 70%" },
    ];
    const r = qrComplementos({ aparelho: catalogo[0], instalados: ["disp", "pt"], catalogo, segmento: "Hotel/Pousada" }).map((p) => p.id);
    expect(r).toEqual(["ref1", "aro"]);
    expect(r).not.toContain("pt");
  });
});

describe("mcp embeds the same QR helpers", () => {
  it("block is identical to the shared file", () => {
    const bloco = (s: string) => s.slice(s.indexOf("// BEGIN qr"), s.indexOf("// END qr"));
    expect(bloco(readFileSync("supabase/functions/mcp/index.ts", "utf8"))).toBe(bloco(readFileSync("supabase/functions/_shared/qr.ts", "utf8")).replace(/export /g, ""));
  });
});

// Flora: contexto_qr and registrar_avaliacao_qr over an in-memory database.
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const EQUIPE = "5522999990002", CONTATO = "5522988887777", ESTRANHO = "5521977776666";
const chat = (fone: string) => `3DF9D839DDCF463A3A350ADF91C40B89-${fone}`;
function harness() {
  const tables: Record<string, any[]> = {
    profiles: [{ user_id: "u2", name: "PH Nascimento", phone: EQUIPE, organization_id: org, is_active: true }, { user_id: "u9", name: "Marcos", phone: "5522911112222", organization_id: org, is_active: true }],
    user_roles: [{ user_id: "u2", role: "super_admin" }, { user_id: "u9", role: "consultor_tecnico" }],
    comodatos: [{ id: "c1", organization_id: org, status: "ATIVO", client_id: "cli", lead_id: null, product_id: "disp", refil_product_id: "ref1", localizacao_interna: "Banheiro feminino", etiqueta_numero: 123 },
      { id: "c2", organization_id: org, status: "SEPARADO", client_id: null, lead_id: "l1", product_id: "disp", localizacao_interna: null, etiqueta_numero: 124 }],
    clients: [{ id: "cli", organization_id: org, name: "Pousada Mar Azul", ramo_atuacao: null, levantamento: { segmento: "Hotel/Pousada" }, assigned_user_id: "u9", phone: null }],
    pessoas: [{ id: "p1", organization_id: org, nome: "Renata Lima", whatsapp: CONTATO, telefone: null, chat_ids: [] }],
    empresa_contatos: [{ organization_id: org, pessoa_id: "p1", client_id: "cli" }],
    products: [{ id: "disp", organization_id: org, name: "Dispenser Sabonete", description: "Para sabonete espuma", is_dispenser: true, is_active: true, dispenser_family_id: "f1", disponibilidade: "estoque" },
      { id: "ref1", organization_id: org, name: "Refil Sabonete Espuma", description: "Lavar as mãos: 1 dose", is_active: true, compatible_dispenser_families: ["f1"], disponibilidade: "estoque" },
      { id: "aro", organization_id: org, name: "Aromatizador Ekkoa", is_active: true, disponibilidade: "estoque" }],
    qr_campanhas: [{ organization_id: org, nome: "Padrão", texto: "{saudacao}! Que bom te ver no {estabelecimento}", padrao: true, ativo: true, prioridade: 0 }],
    notification_recipients: [], qr_avaliacoes: [], notification_logs: [],
  };
  const tasks: Promise<unknown>[] = [];
  const fetchMock = vi.fn(async () => ({ ok: true, body: { cancel: async () => undefined } }));
  const client = { rpc: async () => ({ data: false, error: null }), from(table: string) {
    const f: Array<(r: any) => boolean> = []; let payload: any = null; let mode = "select";
    const rows = () => (tables[table] ?? []).filter((r) => f.every((fn) => fn(r)));
    const exec = () => {
      if (mode === "insert") { const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, ...payload }; (tables[table] ??= []).push(row); return [row]; }
      if (mode === "update") { const rs = rows(); rs.forEach((r) => Object.assign(r, payload)); return rs; }
      return rows();
    };
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, lt: () => chain, is: () => chain, not: () => chain, neq: () => chain,
      contains: (k: string, v: any[]) => { f.push((r) => v.every((x) => (r[k] ?? []).includes(x))); return chain; },
      or: (expr: string) => { const parts = expr.split(",").map((p) => p.match(/^(\w+)\.eq\.(.+)$/)).filter(Boolean) as RegExpMatchArray[]; f.push((r) => parts.some((m) => String(r[m[1]]) === m[2])); return chain; },
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; }, in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; },
      insert: (p: any) => { mode = "insert"; payload = p; return chain; }, update: (p: any) => { mode = "update"; payload = p; return chain; },
      single: async () => ({ data: exec()[0] ?? null, error: null }), maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
      then: (res: any) => Promise.resolve({ data: exec(), error: null }).then(res),
    };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: (k: string) => (k.startsWith("GPTMAKER") ? "x" : undefined) }, serve: () => {} },
    EdgeRuntime: { waitUntil: (t: Promise<unknown>) => tasks.push(t) }, fetch: fetchMock, AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    Response, Request, URL, Blob, performance, TextEncoder, crypto, Date, Intl, CompressionStream, Uint8Array, DataView, Uint32Array, atob, btoa });
  const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  const call = (tool: string, p: Record<string, unknown>) => { context.params = p; context.tool = tool; return vm.runInContext("routeTool(tool, params)", context); };
  return { call, tables, tasks, fetchMock };
}

describe("Flora: contexto_qr", () => {
  it("PUBLICO: estabelecimento, ponto e produto; nada sensível nem número da etiqueta", async () => {
    const h = harness();
    const r = await h.call("contexto_qr", { chat_id: chat(ESTRANHO), ref: `ref ${qrRef(123)}` });
    expect(r.data).toMatchObject({ tipo: "PUBLICO", estabelecimento: "Pousada Mar Azul", segmento: "Hotel/Pousada", ponto: "Banheiro feminino", produto: "Dispenser Sabonete", origem_lead: "QR no cliente Pousada Mar Azul" });
    expect(JSON.stringify(r.data)).not.toMatch(/000123|cli|c1|u9|Renata/);
    expect(r.data).not.toHaveProperty("sugestoes_complemento");
  });
  it("CLIENTE: contato da empresa dona do aparelho recebe complementos que ainda não tem", async () => {
    const r = await harness().call("contexto_qr", { chat_id: chat(CONTATO), ref: qrRef(123) });
    expect(r.data.tipo).toBe("CLIENTE");
    expect(r.data.sugestoes_complemento).toEqual([{ nome: "Aromatizador Ekkoa" }]);
    expect(r.data.mensagem_para_lead).toContain("Renata");
  });
  it("EQUIPE: ficha do aparelho no app", async () => {
    const r = await harness().call("contexto_qr", { chat_id: chat(EQUIPE), ref: qrRef(123) });
    expect(r.data.tipo).toBe("EQUIPE");
    expect(r.data.ficha_url).toBe("https://fera.exudustech.com.br/aparelho/000123");
  });
  it("aparelho ainda não instalado: PUBLICO sem estabelecimento", async () => {
    const r = await harness().call("contexto_qr", { chat_id: chat(ESTRANHO), ref: qrRef(124) });
    expect(r.data).toMatchObject({ tipo: "PUBLICO", aparelho_ativo: false, estabelecimento: null, ponto: null });
  });
  it("ref inválida", async () => {
    expect((await harness().call("contexto_qr", { chat_id: chat(ESTRANHO), ref: "oi" })).success).toBe(false);
  });
});

describe("Flora: registrar_avaliacao_qr", () => {
  it("nota alta: grava com sentimento e sem alerta", async () => {
    const h = harness();
    const r = await h.call("registrar_avaliacao_qr", { chat_id: chat(ESTRANHO), ref: qrRef(123), nota: 10, comentario: "Tudo limpo" });
    expect(r.data).toMatchObject({ registrado: true, sentimento: "positivo", alerta: false, sugestao: null });
    expect(h.tables.qr_avaliacoes[0]).toMatchObject({ comodato_id: "c1", client_id: "cli", ponto: "Banheiro feminino", tipo_avaliador: "PUBLICO", nota: 10 });
    expect(h.tasks).toHaveLength(0);
  });
  it("nota ≤ 6: alerta o consultor do cliente e sugere falar com alguém", async () => {
    const h = harness();
    const r = await h.call("registrar_avaliacao_qr", { chat_id: chat(CONTATO), ref: qrRef(123), nota: 4, comentario: "Faltou papel" });
    expect(r.data).toMatchObject({ alerta: true, sentimento: "negativo", tipo: "CLIENTE", sugestao: { acao: "transferir_para_humano", motivo: "avaliação baixa QR" } });
    await Promise.all(h.tasks);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((h.fetchMock.mock.calls[0] as any)[1].body);
    expect(body.phone).toBe("5522911112222");
    expect(body.message).toContain("4/10");
    expect(body.message).toContain("https://fera.exudustech.com.br/aparelho/000123");
  });
  it("recusa nota fora de 0–10 e QR sem aparelho instalado", async () => {
    const h = harness();
    expect((await h.call("registrar_avaliacao_qr", { chat_id: chat(ESTRANHO), ref: qrRef(123), nota: 11 })).success).toBe(false);
    expect((await h.call("registrar_avaliacao_qr", { chat_id: chat(ESTRANHO), ref: qrRef(124), nota: 9 })).success).toBe(false);
    expect(h.tables.qr_avaliacoes).toHaveLength(0);
  });
});
