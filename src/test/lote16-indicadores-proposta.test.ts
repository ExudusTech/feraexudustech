import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { matchProduto } from "../../supabase/functions/_shared/coleta";

describe("proposta da coleta: produto e preço", () => {
  const prods = [{ id: "p1", name: "Sabonete Espuma 800ml", price: 42 }, { id: "p2", name: "Papel Toalha Interfolha", price: null }, { id: "p3", name: "Dispenser Papel Toalha", price: 0 }];
  it("matches exact or unique partial names", () => {
    expect(matchProduto(prods, "sabonete espuma 800ml")?.id).toBe("p1");
    expect(matchProduto(prods, "Sabonete Espuma")?.id).toBe("p1");
  });
  it("never guesses between several matches or unknown products", () => {
    expect(matchProduto(prods, "papel toalha")).toBeNull();
    expect(matchProduto(prods, "álcool gel")).toBeNull();
  });
});

vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-05T14:00:00Z"));
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";

function harness(role: string) {
  const tables: Record<string, any[]> = {
    profiles: [{ user_id: "u1", name: "Ana", phone: "5522999990001", organization_id: org, is_active: true }],
    user_roles: [{ user_id: "u1", role }],
    schedules: [
      { id: "s1", organization_id: org, title: "Instalação Padaria", scheduled_date: "2026-11-06", start_time: "09:00:00", status: "agendado", assigned_to: "u1",
        ocorrencia_codigo: "OC-000009", prontidao: "falta_nota", nota_status: "pendente", material_status: "pendente", itens: [{ descricao: "Dispenser", quantidade: "2" }] },
    ],
    leads: [{ id: "l1", organization_id: org, stage_id: "st1", client_id: null, created_at: "2026-11-05T12:00:00Z" }],
    lead_stages: [{ id: "st1", organization_id: org, nome: "Novo", ordem: 1, tipo: "aberto", ativo: true }],
    atendimentos: [], proposals: [{ id: "pr1", organization_id: org, status: "rascunho", title: "Proposta Padaria", assigned_to: "u1" }],
    tarefas_faturamento: [{ organization_id: org, status: "aberta", acao: "emitir", empresa_nome: "Padaria", prazo: "2026-11-05T20:00:00Z" }],
  };
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
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch: vi.fn(), AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn() },
    Response, Request, URL, Blob, performance, TextEncoder, crypto, Date, Intl, CompressionStream, Uint8Array, DataView, Uint32Array });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { context, route: (params: any) => { context.params = params; return vm.runInContext("routeTool('flora_equipe', params)", context); } };
}
const CHAT = "3DF9D839DDCF463A3A350ADF91C40B89-5522999990001";

describe("flora_equipe indicadores por papel", () => {
  it("gestor gets the management summary with links", async () => {
    const r = await harness("gestor").route({ chat_id: CHAT, acao: "indicadores", texto: "indicadores de hoje" });
    expect(r.data.visao).toBe("gestor");
    expect(r.data.mensagem_para_equipe).toContain("Leads novos hoje: 1");
    expect(r.data.mensagem_para_equipe).toContain("Amanhã sem nota/material: 1");
    expect(r.data.mensagem_para_equipe).toContain("https://fera.exudustech.com.br/propostas");
    expect(r.data.imagem_enviada).toBe(false);
  });
  it("vendedor gets own agenda, what to take and own proposals", async () => {
    const r = await harness("vendedor").route({ chat_id: CHAT, acao: "indicadores", texto: "o que tenho amanhã" });
    expect(r.data.visao).toBe("campo");
    expect(r.data.mensagem_para_equipe).toContain("09:00 Instalação Padaria #OC-000009");
    expect(r.data.mensagem_para_equipe).toContain("Levar: 2x Dispenser");
    expect(r.data.mensagem_para_equipe).toContain("Propostas abertas: 1");
  });
  it("faturamento gets invoices to issue with deadline", async () => {
    const r = await harness("faturamento").route({ chat_id: CHAT, acao: "indicadores", texto: "notas" });
    expect(r.data.visao).toBe("faturamento");
    expect(r.data.mensagem_para_equipe).toMatch(/Emitir \(1\): Padaria até 05\/11/);
  });
  it("panorama tries the image; if sending fails, answers with text only", async () => {
    const r = await harness("gestor").route({ chat_id: CHAT, acao: "indicadores", texto: "como estamos na semana?" });
    expect(r.success).toBe(true);
    expect(r.data.imagem_enviada).toBe(false);
    expect(r.data.mensagem_para_equipe).toContain("Semana");
  });
  it("renders a valid PNG", async () => {
    const h = harness("gestor");
    const png: Uint8Array = await vm.runInContext("graficoPng('Fera - hoje', [{ rotulo: 'Leads', valor: 3 }, { rotulo: 'Visitas', valor: 5 }])", h.context);
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new DataView(png.buffer).getUint32(16)).toBe(800);
  });
});
