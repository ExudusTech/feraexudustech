import { describe, it, expect } from "vitest";
import { ajustarPontos, aparelhosCompativeis, escolherProduto, itensDosPontos, pendenciasColeta, produtosCompativeis } from "@/lib/coleta";

const catalogo = [
  { id: "d1", name: "Dispenser Interfolha", is_dispenser: true, dispenser_family_id: "fInter" },
  { id: "d2", name: "Dispenser Interfolha Mini", is_dispenser: true, dispenser_family_id: "fInter" },
  { id: "d3", name: "Dispenser Sabonete Espuma", is_dispenser: true, dispenser_family_id: "fEsp" },
  { id: "p1", name: "Papel Interfolha 2000", is_dispenser: false, compatible_dispenser_families: ["fInter"] },
  { id: "p2", name: "Sabonete Espuma 800ml", is_dispenser: false, compatible_dispenser_families: ["fEsp"] },
  { id: "p3", name: "Detergente Galão 5L", is_dispenser: false, compatible_dispenser_families: [] },
];

describe("coleta: aparelho × produto/refil", () => {
  it("produto escolhido mostra só os aparelhos da família compatível", () => {
    expect(aparelhosCompativeis(catalogo, "Papel Interfolha 2000").map((a) => a.id)).toEqual(["d1", "d2"]);
    expect(aparelhosCompativeis(catalogo, "Detergente Galão 5L")).toEqual([]);
  });
  it("um único aparelho compatível é preenchido sozinho", () => {
    expect(escolherProduto({ produto: "Sabonete Espuma 800ml" }, catalogo)).toEqual({ produto: "Sabonete Espuma 800ml", sem_aparelho: false, aparelho: "Dispenser Sabonete Espuma" });
    expect(escolherProduto({ produto: "Papel Interfolha 2000" }, catalogo).aparelho).toBeUndefined();
  });
  it("aparelho escolhido sugere primeiro os produtos compatíveis com a família", () => {
    expect(produtosCompativeis(catalogo, "Dispenser Interfolha Mini").map((p) => p.id)).toEqual(["p1"]);
  });
  it('produto sem família compatível marca "Sem aparelho"', () => {
    expect(escolherProduto({ produto: "Detergente Galão 5L" }, catalogo).sem_aparelho).toBe(true);
  });
  it("pendência de aparelho só quando o produto tem família e Sem aparelho está desmarcado", () => {
    const pend = (p: object) => pendenciasColeta(null, { pontos: [{ local: "Cozinha", quantidade: "1", ...p }] }, { catalogo }).concat(
      pendenciasColeta("venda_direta", { pontos: [{ local: "Cozinha", quantidade: "1", ...p }] }, { catalogo }).filter((x) => x.startsWith("Cozinha")));
    expect(pend({ produto: "Papel Interfolha 2000" })).toContain("Cozinha: qual aparelho?");
    expect(pend({ produto: "Papel Interfolha 2000", sem_aparelho: true })).not.toContain("Cozinha: qual aparelho?");
    expect(pend({ produto: "Detergente Galão 5L" })).not.toContain("Cozinha: qual aparelho?");
    expect(pend({ produto: "Produto fora do catálogo" })).not.toContain("Cozinha: qual aparelho?");
    const semProduto = pend({ aparelho: "Dispenser Interfolha" });
    expect(semProduto).toContain("Cozinha: qual produto/refil?");
    expect(semProduto).not.toContain("Cozinha: qual aparelho?");
  });
  it("ponto sem aparelho entra nos itens só com o produto", () => {
    expect(itensDosPontos({ pontos: [{ local: "Cozinha", aparelho: "Dispenser X", produto: "Detergente Galão 5L", quantidade: "2", sem_aparelho: true }] }))
      .toEqual([{ descricao: "Detergente Galão 5L — Cozinha", quantidade: "2" }]);
  });
  it("rascunho novo da IA mantém a escolha Sem aparelho do vendedor", () => {
    const r = ajustarPontos({ pontos: [{ local: "Cozinha", produto: "Papel Interfolha 2000" }] }, catalogo, { pontos: [{ local: "Cozinha", produto: "Papel Interfolha 2000", sem_aparelho: true }] });
    expect(r.pontos?.[0].sem_aparelho).toBe(true);
  });
});
