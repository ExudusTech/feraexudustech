import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const catalog = [
  { id: "1", name: "Desinfetante Lysoform Bruto 5L", brand: "Lysoform", category: "Limpeza", fornecedor: "Reckitt", unit: "UN", description: "Desinfetante concentrado", price: "99.90" },
  { id: "2", name: "Álcool Gel 70%", brand: "Higiclean", category: "Higienização", fornecedor: null, unit: "UN", description: "Álcool para mãos", price: "10" },
  { id: "4", name: "Glade N.Fresh Aerosol", brand: "Glade", category: "Aromatizador", fornecedor: null, unit: "UN", description: "Odorizador", price: "20" },
  { id: "3", name: "Papel Toalha Interfolhado", brand: "Nits", category: "Papel", fornecedor: null, unit: "CX", description: "Folha dupla", price: "50" },
  { id: "d1", name: "Suma Break Up D3.5", brand: "DIVERSEY", category: "Desengordurante", fornecedor: "DIVERSEY", unit: "GL", description: "Desengordurante cozinha", disponibilidade: "sob_encomenda", image_url: "org/NC-DIV-001.jpg", pode_enviar_foto_cliente: true, specifications: { segmentos: ["Cozinha industrial", "Hotelaria"] } },
  { id: "d2", name: "Clax Personril", brand: "DIVERSEY", category: "Lavanderia", fornecedor: "DIVERSEY", unit: "GL", description: "Detergente", disponibilidade: "sob_encomenda", specifications: { segmentos: ["Lavanderia", "Hotelaria"] } },
  { id: "d3", name: "Taski Jontec", brand: "DIVERSEY", category: "Pisos", fornecedor: "DIVERSEY", unit: "GL", description: "Cera", disponibilidade: "sob_encomenda", specifications: { segmentos: ["Hospitalar"] } },
  { id: "d9", name: "SUMA GRILL D9", brand: "DIVERSEY", category: "Limpeza de chapas e fornos", fornecedor: "DIVERSEY", unit: "GL", description: "Limpador de fornos", disponibilidade: "sob_encomenda" },
  { id: "h1", name: "INSPIRACOES - AGUA DE CHEIRO / AGUA DE LENCOL 500ML E 5L", brand: "Inspiracoes", category: "Aromatizador", fornecedor: null, unit: "UN", description: "Ideal para hotel e hotelaria", image_url: "org/NC-INS-001.jpg", pode_enviar_foto_cliente: true },
  { id: "sc", name: "SOFT CARE DES-E", brand: "DIVERSEY", category: "Higiene das mãos", fornecedor: "DIVERSEY", unit: "GL", description: "Sabonete", image_url: "org/NC-DIV-050.jpg", pode_enviar_foto_cliente: true },
  { id: "ox", name: "OXIVIR TB PRONTO USO", brand: "DIVERSEY", category: "Desinfecção", fornecedor: "DIVERSEY", unit: "UN", description: "Desinfetante hospitalar", image_url: "org/NC-DIV-060.jpg", pode_enviar_foto_cliente: true },
  { id: "sm", name: "Dispenser Smart Autocorte", brand: "Nits", category: "Dispensers", fornecedor: null, unit: "UN", description: "Dispenser de papel", image_url: "org/NC-NIT-001.jpg", pode_enviar_foto_cliente: true },
  { id: "gh", name: "GUARD GRAND HOTEL CQT 90X50FLS", brand: "Guard", category: "Papel", fornecedor: null, unit: "CX", description: "Papel", image_url: "org/NC-GH-1.jpg", pode_enviar_foto_cliente: true },
  { id: "pi", name: "Pano Microfibra Interno", brand: "Nits", category: "Panos", fornecedor: null, unit: "UN", description: "Pano", image_url: "org/NC-PAN-001.jpg", pode_enviar_foto_cliente: false },
  { id: "ek1", name: "AGUA DE CHEIRO PARIS 500ML", brand: "EKKOA", category: "Aromatizante", fornecedor: "EKKOA", unit: "UN", description: "Água perfumada" },
  { id: "ek2", name: "REFIL BALI OCEAN 80ML", brand: "EKKOA", category: "Neutralizadores", fornecedor: "EKKOA", unit: "UN", description: "Neutraliza odores" },
  { id: "bs", name: "ACRIL PROX B", brand: "DIVERSEY", category: "Base seladora", fornecedor: "DIVERSEY", unit: "UN", description: "Base seladora. Indicado para: Escritórios e salas, ambientes internos" },
  { id: "cx", name: "CLAX ANTI CHLOR", brand: "DIVERSEY", category: "Neutralizantes", fornecedor: "DIVERSEY", unit: "UN", description: "Neutralizante de cloro" },
  { id: "x1", name: "Clax Antigo Descontinuado", brand: "DIVERSEY", category: "Lavanderia", fornecedor: "DIVERSEY", unit: "GL", description: "Velho", disponibilidade: "descontinuado", specifications: { segmentos: ["Lavanderia"] } },
];
function harness(opts: { sentBefore?: boolean; fetchOk?: boolean } = {}) {
  const gte: string[] = [];
  const inserts: any[] = [];
  const fetchMock = vi.fn(async () => { if (opts.fetchOk === false) throw new Error("boom"); return new Response("{}", { status: 200 }); });
  const client = { from(table: string) {
    const chain: any = { select: () => chain, eq: () => chain, in: () => chain, contains: () => chain, limit: () => chain, neq: () => chain,
      insert: (row: any) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
      gte: (k: string) => { gte.push(`${table}.${k}`); return chain; },
      then: (r: any) => Promise.resolve({ data: table === "products" ? catalog : (table === "product_image_sends" && opts.sentBefore ? [{ id: "s" }] : []), error: null }).then(r) };
    return chain;
  } };
  (client as any).storage = { from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })) }) }) };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: (k: string) => (k === "GPTMAKER_API_TOKEN" ? "tok" : undefined) }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch: fetchMock, setTimeout, clearTimeout, AbortController, console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() }, Response, Request, URL, performance, TextEncoder, crypto, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { route: (m: string, p: any) => { context.m = m; context.p = p; return vm.runInContext("routeTool(m, p)", context); }, gte, inserts, fetchMock };
}
describe("consultar_produto", () => {
  it.each(["limpeza profissional para cozinhas", "não informado", undefined, ""])("Suma Grill D9 remains total regardless of category: %s", async categoria => {
    const r = await harness().route("consultar_produto", { termo: "Suma Grill D9", ...(categoria === undefined ? {} : { categoria }) });
    expect(r.data.encontrado).toBe(true);
    expect(r.data.correspondencia).toBe("total");
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(["d9"]);
    expect(r.data.mensagem_para_lead).toBeUndefined();
  });
  it.each(["limpeza profissional para cozinhas", "não informado", undefined, "", "Limpeza", "Aromatizador"])("Solv Fresh remains not found regardless of category: %s", async categoria => {
    const r = await harness().route("consultar_produto", { termo: "Solv Fresh", ...(categoria === undefined ? {} : { categoria }) });
    expect(r.data.encontrado).toBe(false);
    expect(r.data.produtos).toEqual([]);
    expect(r.data.mensagem_para_lead).toContain("não trabalha com o Solv Fresh.");
  });
  it("brand match is not excluded by an unrelated category", async () => {
    const r = await harness().route("consultar_produto", { termo: "Diversey", categoria: "limpeza profissional para cozinhas" });
    expect(r.data.encontrado).toBe(true);
    expect(r.data.correspondencia).toBe("marca");
    expect(r.data.produtos.length).toBeGreaterThan(0);
  });
  it("category suggests alternatives without inventing a term match", async () => {
    const r = await harness().route("consultar_produto", { termo: "Xyzabc", categoria: "Limpeza de chapas e fornos" });
    expect(r.data.encontrado).toBe(false);
    expect(r.data.correspondencia).toBe("nenhuma");
    expect(r.data.similares.map((p: any) => p.id)).toEqual(["d9"]);
  });
  it("category only ranks matching products without excluding the others", async () => {
    const r = await harness().route("consultar_produto", { termo: "Diversey", categoria: "Pisos" });
    expect(r.data.produtos[0].id).toBe("d3");
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(expect.arrayContaining(["d1", "d2", "d3", "d9"]));
  });
  it("Solv Fresh is not found", async () => {
    const r = await harness().route("consultar_produto", { termo: "Solv Fresh" });
    expect(r.data.encontrado).toBe(false); expect(r.data.produtos).toEqual([]);
    expect(r.data.produto_citado).toBe("Solv Fresh");
    expect(r.data.mensagem_para_lead.startsWith("A NitsClean Distribuidora não trabalha com o Solv Fresh.")).toBe(true);
    expect(r.data.mensagem_para_lead).toContain("Temos opções de Aromatizador");
    expect(r.data.similares.map((p: any) => p.id)).toContain("4");
    expect(r.next_action_hint).toBeUndefined(); expect(r.message).toBeUndefined();
  });
  it("lysoform bruto is found with total match", async () => {
    const r = await harness().route("consultar_produto", { termo: "lysoform bruto" });
    expect(r.data.encontrado).toBe(true); expect(r.data.correspondencia).toBe("total");
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(["1"]);
    expect(r.data.mensagem_para_lead).toBeUndefined();
  });
  it("no match at all has empty similares and plain message", async () => {
    const r = await harness().route("consultar_produto", { termo: "Xyzabc" });
    expect(r.data.similares).toEqual([]);
    expect(r.data.mensagem_para_lead).toBe("A NitsClean Distribuidora não trabalha com o Xyzabc.");
  });
  it.each(["alcool gel", "ÁLCOOL GEL", "álcool gel"])("accent/case-insensitive: %s", async termo => {
    const r = await harness().route("consultar_produto", { termo });
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(["2"]);
  });
  it("falls back to partial match", async () => {
    const r = await harness().route("consultar_produto", { termo: "lysoform perfumado" });
    expect(r.data.correspondencia).toBe("parcial"); expect(r.data.encontrado).toBe(false);
    expect(r.data.produtos).toEqual([]); expect(r.data.similares[0].id).toBe("1");
  });
  it("accepts nome and treats 'não informado' as absent", async () => {
    const r = await harness().route("consultar_produto", { termo: "não informado", nome: "papel toalha" });
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(["3"]);
  });
  it.each(["lysoform", "Solv Fresh", "Xyzabc"])("never returns any price field: %s", async termo => {
    const r = await harness().route("consultar_produto", { termo });
    expect(JSON.stringify(r)).not.toMatch(/price|preco|preço|99\.90/i);
  });
});
describe("consultar_produto lote 5/6", () => {
  it("Diversey → encontrado, correspondencia marca, variados, sem mensagem", async () => {
    const r = await harness().route("consultar_produto", { termo: "Diversey" });
    expect(r.data.encontrado).toBe(true); expect(r.data.correspondencia).toBe("marca");
    expect(r.data.produtos.length).toBeLessThanOrEqual(5);
    expect(new Set(r.data.produtos.map((p: any) => p.categoria)).size).toBe(r.data.produtos.length);
    expect(r.data.mensagem_para_lead).toBeUndefined();
  });
  it("Suma Break Up → total com disponibilidade e image_url", async () => {
    const r = await harness().route("consultar_produto", { termo: "Suma Break Up" });
    expect(r.data.correspondencia).toBe("total"); expect(r.data.produtos.map((p: any) => p.id)).toEqual(["d1"]);
    expect(r.data.produtos[0].disponibilidade).toBe("sob_encomenda");
    expect(r.data.produtos[0].image_url).toBe("https://signed/org/NC-DIV-001.jpg");
  });
  it.each(["Clax Antigo Descontinuado", "Diversey", "lavanderia"])("descontinuado nunca aparece: %s", async termo => {
    const r = await harness().route("consultar_produto", { termo });
    expect(JSON.stringify(r)).not.toContain("x1");
  });
  it("lavanderia → itens do segmento", async () => {
    const r = await harness().route("consultar_produto", { termo: "lavanderia" });
    expect(r.data.encontrado).toBe(true);
    expect(r.data.produtos.map((p: any) => p.id)).toContain("d2");
  });
  it("produto único com imagem e chat_id → envia imagem via GPT Maker", async () => {
    const h = harness();
    const r = await h.route("consultar_produto", { termo: "Suma Break Up", chat_id: "whatsapp-5521999999999" });
    expect(r.data.imagem_enviada).toBe(true);
    const [url, init] = h.fetchMock.mock.calls[0] as any;
    expect(url).toBe("https://api.gptmaker.ai/v2/chat/whatsapp-5521999999999/send-message");
    expect(JSON.parse(init.body)).toEqual({ image: "https://signed/org/NC-DIV-001.jpg", message: "Suma Break Up D3.5" });
    expect(h.inserts.find((i) => i.table === "product_image_sends").row.status).toBe("enviado");
  });
  it("não reenvia em 24h", async () => {
    const h = harness({ sentBefore: true });
    const r = await h.route("consultar_produto", { termo: "Suma Break Up", chat_id: "whatsapp-1" });
    expect(r.data.imagem_enviada).toBe(false); expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("falha no envio não quebra a resposta", async () => {
    const h = harness({ fetchOk: false });
    const r = await h.route("consultar_produto", { termo: "Suma Break Up", chat_id: "whatsapp-1" });
    expect(r.success).toBe(true); expect(r.data.imagem_enviada).toBe(false);
    expect(h.inserts.find((i) => i.table === "product_image_sends").row.status).toBe("erro");
  });
  it("busca genérica (marca) não envia imagem", async () => {
    const h = harness();
    const r = await h.route("consultar_produto", { termo: "Diversey", chat_id: "whatsapp-1" });
    expect(r.data.imagem_enviada).toBe(false); expect(h.fetchMock).not.toHaveBeenCalled();
  });
});
describe("transfer dedup column", () => {
  it("filters notification_logs by sent_at (real column), never created_at", () => {
    const block = source.slice(source.indexOf('from("notification_logs").select("id, sent_at")'));
    expect(block.slice(0, 400)).toContain('.gte("sent_at"');
    expect(block.slice(0, 400)).not.toContain('"created_at"');
  });
});
describe("consultar_produto: total só pelo nome", () => {
  it("produtos para hotel → sem imagem, não total", async () => {
    const h = harness();
    const r = await h.route("consultar_produto", { termo: "produtos para hotel", categoria: "higiene e limpeza profissional", chat_id: "whatsapp-1" });
    expect(r.data.correspondencia).not.toBe("total");
    expect(r.data.imagem_enviada).toBe(false); expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it.each([["Suma Grill D9", "d9"], ["Soft Care Des-E", "sc"], ["Oxivir TB pronto uso", "ox"], ["dispenser Smart Autocorte", "sm"]])("%s → total com 1 produto", async (termo, id) => {
    const r = await harness().route("consultar_produto", { termo });
    expect(r.data.correspondencia).toBe("total"); expect(r.data.produtos.map((p: any) => p.id)).toEqual([id]);
  });
  it.each(["limpeza de cozinha", "coisas para banheiro"])("%s → nunca total nem imagem", async (termo) => {
    const h = harness();
    const r = await h.route("consultar_produto", { termo, chat_id: "whatsapp-1" });
    expect(r.data.correspondencia).not.toBe("total"); expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("Diversey → marca, sem imagem", async () => {
    const h = harness();
    const r = await h.route("consultar_produto", { termo: "Diversey", chat_id: "whatsapp-1" });
    expect(r.data.correspondencia).toBe("marca"); expect(r.data.imagem_enviada).toBe(false); expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("match só na descrição nunca é total", async () => {
    const r = await harness().route("consultar_produto", { termo: "limpador de fornos" });
    expect(r.data.correspondencia).toBe("segmento");
  });
  it("foto só para uso interno (pode_enviar_foto_cliente=false) → não envia nem expõe image_url", async () => {
    const h = harness();
    const r = await h.route("consultar_produto", { termo: "Pano Microfibra Interno", chat_id: "chat-1" });
    expect(r.data.correspondencia).toBe("total");
    expect(r.data.produtos[0].image_url).toBeNull();
    expect(r.data.imagem_enviada).toBe(false);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});

describe("consultar_produto — smell synonyms go to aromatização/neutralização (Ekkoa)", () => {
  it.each(["cheiro para ambiente", "perfume para ambiente", "algo cheiroso pra recepção", "tirar odor do banheiro", "fragrância para loja", "cheiro"])("%s", async termo => {
    const r = await harness().route("consultar_produto", { termo, categoria: "aromatização e neutralização de odores" });
    expect(r.data.encontrado).toBe(true);
    const ids = r.data.produtos.map((p: any) => p.id);
    expect(ids).not.toContain("bs"); expect(ids).not.toContain("cx");
    expect(r.data.produtos.every((p: any) => /aromat|neutralizador/i.test(p.categoria))).toBe(true);
    expect(r.data.produtos[0].marca).toBe("EKKOA");
  });
  it("a named product with a smell word keeps its own match", async () => {
    const r = await harness().route("consultar_produto", { termo: "sabonete perfumado" });
    expect(r.data.produtos.map((p: any) => p.id)).toContain("sc");
    expect(r.data.produtos.map((p: any) => p.id)).not.toContain("ek1");
  });
});
