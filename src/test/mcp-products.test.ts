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
  { id: "dr", name: "DRASTIC W4C", brand: "DIVERSEY", category: "Detergente ácido", fornecedor: "DIVERSEY", unit: "UN", description: "Detergente desincrustante desinfetante ácido. Indicado para: Banheiros e vestiários." },
  { id: "sc5", name: "SUMA CALC D5", brand: "DIVERSEY", category: "Desincrustante", fornecedor: "DIVERSEY", unit: "GL", description: "Detergente desincrustante ácido para remoção de incrustações inorgânicas. Indicado para: Cozinhas." },
  { id: "ac", name: "LIMPADOR ACIDO PISO SHOCK 5L", brand: "OLEAK", category: "Limpadores", fornecedor: null, unit: "UN", description: null },
  { id: "dl", name: "DRAX LAVA LOUÇAS", brand: "DIVERSEY", category: "Lavagem mecânica - detergente líquido", fornecedor: "DIVERSEY", unit: "GL", description: "Desincrustante alcalino para lavagem mecânica de louças e copos. Indicado para: Cozinhas." },
  { id: "dx", name: "DRAX", brand: "DIVERSEY", category: "Desengraxante", fornecedor: "DIVERSEY", unit: "GL", description: "Desengraxante industrial", specifications: { segmentos: ["Indústria"] } },
  { id: "sp", name: "SOLUPAN LIQUIDO", brand: "DIVERSEY", category: "Desengraxante", fornecedor: "DIVERSEY", unit: "GL", description: "Desengraxante alcalino pesado", specifications: { segmentos: ["Indústria"] } },
  { id: "tt", name: "TITAN SU 103", brand: "DIVERSEY", category: "Desengraxante", fornecedor: "DIVERSEY", unit: "GL", description: "Desengraxante para máquinas", specifications: { segmentos: ["Indústria"] } },
  { id: "vx", name: "VIREX II 256", brand: "DIVERSEY", category: "Limpeza e desinfecção hospitalar", fornecedor: "DIVERSEY", unit: "GL", description: "Desinfetante hospitalar", specifications: { segmentos: ["Saúde"] } },
  { id: "x1", name: "Clax Antigo Descontinuado", brand: "DIVERSEY", category: "Lavanderia", fornecedor: "DIVERSEY", unit: "GL", description: "Velho", disponibilidade: "descontinuado", specifications: { segmentos: ["Lavanderia"] } },
];
function harness(opts: { sentBefore?: boolean; fetchOk?: boolean; products?: any[] } = {}) {
  const gte: string[] = [];
  const inserts: any[] = [];
  const fetchMock = vi.fn(async () => { if (opts.fetchOk === false) throw new Error("boom"); return new Response("{}", { status: 200 }); });
  const client = { from(table: string) {
    const chain: any = { select: () => chain, eq: () => chain, in: () => chain, contains: () => chain, limit: () => chain, neq: () => chain,
      insert: (row: any) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
      gte: (k: string) => { gte.push(`${table}.${k}`); return chain; },
      then: (r: any) => Promise.resolve({ data: table === "products" ? (opts.products ?? catalog) : (table === "product_image_sends" && opts.sentBefore ? [{ id: "s" }] : []), error: null }).then(r) };
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
    expect(r.data.mensagem_para_lead).not.toMatch(/não trabalha|não temos|nao trabalha/i);
    expect(r.data.mensagem_para_lead).toContain("o consultor avalia no local e indica o produto certo.");
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
    expect(r.data.mensagem_para_lead).toBe("Temos solução profissional para controle de odores e aromatização; o consultor avalia no local e indica o produto certo.");
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
    expect(r.data.mensagem_para_lead).toBe("Temos solução profissional para isso; o consultor avalia no local e indica o produto certo.");
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
  it.each(["cheiro para ambiente", "perfume para ambiente", "algo cheiroso pra recepção", "tirar odor do banheiro", "fragrância para loja"])("%s", async termo => {
    const r = await harness().route("consultar_produto", { termo, categoria: "aromatização e neutralização de odores" });
    expect(r.data.encontrado).toBe(true);
    const ids = r.data.produtos.map((p: any) => p.id);
    expect(ids).not.toContain("bs"); expect(ids).not.toContain("cx");
    expect(r.data.produtos.every((p: any) => /aromat|neutralizador/i.test(p.categoria))).toBe(true);
    expect(r.data.produtos[0].marca).toBe("EKKOA");
  });
  it("a named product with a smell word keeps its own match", async () => {
    const r = await harness().route("consultar_produto", { termo: "sabonete perfumado" });
    expect(r.data.linha_sugerida).toBeUndefined();
    expect([...r.data.produtos, ...(r.data.similares ?? [])].map((p: any) => p.id)).toContain("sc");
  });
  it("\"cheiro\" alone returns only aromatização/neutralização products", async () => {
    const r = await harness().route("consultar_produto", { termo: "cheiro" });
    expect(r.data.produtos.length).toBeGreaterThan(0);
    expect(r.data.produtos.every((p: any) => /aromat|neutralizador/i.test(p.categoria))).toBe(true);
  });
});

describe("consultar_produto — necessidade e mensagem de solução", () => {
  it("limpa rejunte → necessidade com desincrustantes Diversey e mensagem de solução", async () => {
    const r = await harness().route("consultar_produto", { termo: "limpa rejunte" });
    expect(r.data).toMatchObject({ encontrado: false, correspondencia: "necessidade", produtos: [] });
    const ids = r.data.similares.map((p: any) => p.id);
    expect(ids.length).toBeLessThanOrEqual(3);
    expect(ids.slice(0, 2).sort()).toEqual(["dr", "sc5"]);
    expect(ids).not.toContain("dl");
    expect(r.data.similares[0].marca).toBe("DIVERSEY");
    expect(r.data.mensagem_para_lead).toBe("Temos solução profissional para limpeza pesada de rejunte, limo e encardido; o consultor avalia no local e indica o produto certo.");
  });
  it.each([["limo no azulejo", "dr"], ["tirar gordura da coifa", "d1"], ["algo pro rejunte do banheiro", "dr"]])("%s → necessidade", async (termo, id) => {
    const r = await harness().route("consultar_produto", { termo });
    expect(r.data.correspondencia).toBe("necessidade");
    expect(r.data.similares[0].id).toBe(id);
    expect(r.data.similares.length).toBeLessThanOrEqual(3);
  });
  it.each(["Solv Fresh", "Xyzabc", "limpa rejunte", "lysoform perfumado"])("nunca diz que não trabalhamos/temos: %s", async termo => {
    const r = await harness().route("consultar_produto", { termo });
    expect(r.data.mensagem_para_lead).not.toMatch(/n[aã]o (trabalha|trabalhamos|temos|tem)\b/i);
  });
  it("produto nomeado continua total (necessidade não atropela nome)", async () => {
    const r = await harness().route("consultar_produto", { termo: "Drastic W4C" });
    expect(r.data.correspondencia).toBe("total");
    expect(r.data.produtos.map((p: any) => p.id)).toEqual(["dr"]);
  });
});

describe("consultar_produto — novas necessidades, segmentos e parcial restrito", () => {
  it("caso real: limpeza de máquinas e equipamentos industriais → necessidade com DRAX/SOLUPAN/TITAN", async () => {
    const r = await harness().route("consultar_produto", { termo: "limpeza de máquinas e equipamentos industriais" });
    expect(r.data).toMatchObject({ encontrado: false, correspondencia: "necessidade", produtos: [] });
    const ids = r.data.similares.map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["dx", "sp", "tt"]));
    expect(ids).not.toContain("ek1");
    expect(ids).not.toContain("ek2");
    expect(r.data.mensagem_para_lead).toContain("linha de desengraxantes Diversey");
  });
  it("produto para lavanderia de hotel → Clax", async () => {
    const r = await harness().route("consultar_produto", { termo: "produto para lavanderia de hotel" });
    const all = [...(r.data.produtos ?? []), ...(r.data.similares ?? [])];
    expect(all.some((p: any) => /clax/i.test(p.nome))).toBe(true);
    expect(r.data.mensagem_para_lead).toContain("linha Clax para lavanderia");
  });
  it("desinfetante para clínica → Oxivir/Virex", async () => {
    const r = await harness().route("consultar_produto", { termo: "desinfetante para clínica" });
    const ids = [...(r.data.produtos ?? []), ...(r.data.similares ?? [])].map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["ox", "vx"]));
    expect(r.data.mensagem_para_lead).toContain("Oxivir/Virex");
  });
  it("papel toalha continua papel; toalha de banho vai para lavanderia (Clax)", async () => {
    const papel = await harness().route("consultar_produto", { termo: "papel toalha" });
    expect(papel.data.produtos.map((p: any) => p.id)).toEqual(["3"]);
    const banho = await harness().route("consultar_produto", { termo: "lavar toalha de banho" });
    expect(banho.data.correspondencia).toBe("necessidade");
    expect(banho.data.similares.some((p: any) => /clax/i.test(p.nome))).toBe(true);
  });
  it("limpeza geral → correspondencia nenhuma, similares vazios, sem Ekkoa", async () => {
    const r = await harness().route("consultar_produto", { termo: "limpeza geral" });
    expect(r.data).toMatchObject({ encontrado: false, correspondencia: "nenhuma", produtos: [], similares: [] });
    expect(r.data.mensagem_para_lead).toContain("o consultor avalia no local e indica o produto certo.");
  });
  it("sinônimo de segmento: restaurante → Cozinhas", async () => {
    const r = await harness().route("consultar_produto", { termo: "produtos para restaurante" });
    expect(r.data.encontrado).toBe(true);
    expect(r.data.correspondencia).toBe("segmento");
    expect(r.data.produtos.map((p: any) => p.id)).toContain("d1");
  });
});

describe("consultar_produto — normalização e correspondência por tipo", () => {
  const paperCatalog = [
    ...catalog,
    { id: "ks", name: "TOALHA INTERFOLHADA KLEENEX SUPREME 150FLS", brand: "Kleenex", linha_produto: "Supreme", category: "Toalhas Interfolhadas", fornecedor: "Kimberly-Clark", unit: "CX", description: "Linha de valor: Experiência. Fluxo de pessoas indicado: Médio a baixo.", disponibilidade: "estoque", image_url: "org/ks.jpg", pode_enviar_foto_cliente: true },
    { id: "sb", name: "TOALHA INTERFOLHADA SCOTT BASIC 250FLS", brand: "Scott", linha_produto: "Basic", category: "Toalhas Interfolhadas", fornecedor: "Kimberly-Clark", unit: "CX", description: "Linha de valor: Economia. Fluxo de pessoas indicado: Médio a baixo.", disponibilidade: "estoque", image_url: "org/sb.jpg", pode_enviar_foto_cliente: true },
    { id: "se", name: "TOALHA FD INTERF SCOTT ESSENT 12 X 200", brand: "Scott", linha_produto: "Essential", category: "Toalhas Interfolhadas", fornecedor: "Kimberly-Clark", unit: "CX", description: "Linha de valor: Essencial. Fluxo de pessoas indicado: Alto.", disponibilidade: "estoque", image_url: "org/se.jpg", pode_enviar_foto_cliente: true },
    { id: "sf", name: "TOALHA FS INTERF SCOTT 24X250 -6.000 FL", brand: "Scott", linha_produto: "Basic", category: "Toalhas Interfolhadas", fornecedor: "Kimberly-Clark", unit: "CX", description: "Folha simples econômica.", disponibilidade: "estoque", image_url: "org/sf.jpg", pode_enviar_foto_cliente: true },
    { id: "mp", name: "TOALHA MAX PURE INTERF FS 36X250", brand: "Max Pure", linha_produto: "Standard", category: "Toalhas Interfolhadas", fornecedor: "Max Pure", unit: "CX", description: "Folha simples.", disponibilidade: "estoque" },
    { id: "gc", name: "GUARDANAPOS CIPAR", brand: "Cipar", category: "Guardanapos", fornecedor: "Cipar", unit: "CX", description: "Guardanapo de papel interfolhado", disponibilidade: "estoque" },
    { id: "dt", name: "DISPENSER TOALHA INTERFOLHADA", brand: "Kimberly-Clark", category: "Dispensers", fornecedor: "Kimberly-Clark", unit: "UN", description: "Dispenser para toalha", disponibilidade: "estoque" },
  ];

  it("caso real: papel toalha interfolhado → correspondencia tipo com Kleenex/Scott, sem guardanapo nem dispenser, com fluxo_indicado e até 3 fotos", async () => {
    const h = harness({ products: paperCatalog });
    const r = await h.route("consultar_produto", { termo: "papel toalha interfolhado", chat_id: "chat-tipo-1" });
    expect(r.data.encontrado).toBe(true);
    expect(r.data.correspondencia).toBe("tipo");
    expect(r.data.produtos.length).toBeLessThanOrEqual(4);
    const ids = r.data.produtos.map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["ks", "sb", "se"]));
    expect(ids).not.toContain("gc");
    expect(ids).not.toContain("dt");
    const ks = r.data.produtos.find((p: any) => p.id === "ks");
    expect(ks.fluxo_indicado).toBe("Médio a baixo");
    expect(ks.linha_valor).toBe("Experiência");
    expect(r.data.mensagem_para_lead).toContain("KLEENEX SUPREME");
    expect(r.data.mensagem_para_lead).toContain("comodato");
    expect(r.data.imagem_enviada).toBe(true);
    expect(r.data.imagens_enviadas).toBeLessThanOrEqual(3);
    expect(h.fetchMock).toHaveBeenCalledTimes(r.data.imagens_enviadas);
  });

  it("folha dupla / FD e folha simples / FS são equivalentes", async () => {
    const r = await harness({ products: paperCatalog }).route("consultar_produto", { termo: "toalha folha dupla interfolhada" });
    expect(r.data.encontrado).toBe(true);
    expect(r.data.produtos.map((p: any) => p.id)).toContain("se");
  });

  it("guardanapo continua devolvendo guardanapos", async () => {
    const r = await harness({ products: paperCatalog }).route("consultar_produto", { termo: "guardanapo" });
    expect(r.data.encontrado).toBe(true);
    expect(r.data.produtos.map((p: any) => p.id)).toContain("gc");
  });

  it("papel toalha sozinho não devolve guardanapo", async () => {
    const r = await harness({ products: paperCatalog }).route("consultar_produto", { termo: "papel toalha" });
    const all = [...(r.data.produtos ?? []), ...(r.data.similares ?? [])].map((p: any) => p.id);
    expect(all).not.toContain("gc");
  });
});
