import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const catalog = [
  { id: "1", name: "Desinfetante Lysoform Bruto 5L", brand: "Lysoform", category: "Limpeza", fornecedor: "Reckitt", unit: "UN", description: "Desinfetante concentrado", price: "99.90" },
  { id: "2", name: "Álcool Gel 70%", brand: "Higiclean", category: "Higienização", fornecedor: null, unit: "UN", description: "Álcool para mãos", price: "10" },
  { id: "3", name: "Papel Toalha Interfolhado", brand: "Nits", category: "Papel", fornecedor: null, unit: "CX", description: "Folha dupla", price: "50" },
];
function harness() {
  const gte: string[] = [];
  const client = { from(table: string) {
    const chain: any = { select: () => chain, eq: () => chain, in: () => chain, contains: () => chain, limit: () => chain,
      gte: (k: string) => { gte.push(`${table}.${k}`); return chain; },
      then: (r: any) => Promise.resolve({ data: table === "products" ? catalog : [], error: null }).then(r) };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch: vi.fn(), console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() }, Response, Request, URL, performance, TextEncoder, crypto, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { route: (m: string, p: any) => { context.m = m; context.p = p; return vm.runInContext("routeTool(m, p)", context); }, gte };
}
describe("consultar_produto", () => {
  it("Solv Fresh is not found", async () => {
    const r = await harness().route("consultar_produto", { termo: "Solv Fresh" });
    expect(r.data).toEqual({ encontrado: false, correspondencia: "nenhuma", produtos: [] });
    expect(r.next_action_hint).toBeUndefined(); expect(r.message).toBeUndefined();
  });
  it("lysoform bruto is found with total match", async () => {
    const r = await harness().route("consultar_produto", { termo: "lysoform bruto" });
    expect(r.data.encontrado).toBe(true); expect(r.data.correspondencia).toBe("total");
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(["1"]);
  });
  it.each(["alcool gel", "ÁLCOOL GEL", "álcool gel"])("accent/case-insensitive: %s", async termo => {
    const r = await harness().route("consultar_produto", { termo });
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(["2"]);
  });
  it("falls back to partial match", async () => {
    const r = await harness().route("consultar_produto", { termo: "lysoform perfumado" });
    expect(r.data.correspondencia).toBe("parcial"); expect(r.data.produtos[0].id).toBe("1");
  });
  it("accepts nome and treats 'não informado' as absent", async () => {
    const r = await harness().route("consultar_produto", { termo: "não informado", nome: "papel toalha" });
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(["3"]);
  });
  it("never returns any price field", async () => {
    const r = await harness().route("consultar_produto", { termo: "lysoform" });
    expect(JSON.stringify(r)).not.toMatch(/price|preco|preço|99\.90/i);
  });
});
describe("transfer dedup column", () => {
  it("filters notification_logs by sent_at (real column), never created_at", () => {
    const block = source.slice(source.indexOf('from("notification_logs").select("id")'));
    expect(block.slice(0, 400)).toContain('.gte("sent_at"');
    expect(block.slice(0, 400)).not.toContain('"created_at"');
  });
});
