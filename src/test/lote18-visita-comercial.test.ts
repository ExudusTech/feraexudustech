import { describe, it, expect } from "vitest";
import { itensDosPontos, limparRascunho, pendenciasColeta, sugerirProdutos, tipoNotaPadrao } from "@/lib/coleta";
import { siteVisivel } from "../../supabase/functions/_shared/proposta-pdf";

describe("visita comercial unificada", () => {
  it("perdido sem motivo pede o motivo; com motivo não", () => {
    expect(pendenciasColeta(null, { proximos_passos: [{ tipo: "perdido" }] })).toEqual(["Motivo da perda"]);
    expect(pendenciasColeta(null, { proximos_passos: [{ tipo: "perdido", observacao: "preço" }] })).toEqual([]);
  });
  it("instalação de teste sem itens e sem CNPJ vira pendência", () => {
    const p = pendenciasColeta(null, { proximos_passos: [{ tipo: "teste", data: "2026-11-07" }] }, { cnpj: false });
    expect(p).toEqual(["Itens da instalação de teste", "CNPJ da empresa"]);
  });
  it("CNPJ válido no rascunho resolve a pendência de CNPJ", () => {
    const r = limparRascunho({ pontos: [{ aparelho: "Dispenser", produto: "Sabonete" }], proximos_passos: [{ tipo: "teste", data: "2026-11-07" }], instalacao: { cnpj: "12.345.678/0001-90" } });
    expect(r.instalacao?.cnpj).toBe("12345678000190");
    expect(pendenciasColeta(null, r, { cnpj: false })).toEqual([]);
  });
  it("itensDosPontos junta aparelho + produto + local, quantidade padrão 1", () => {
    expect(itensDosPontos({ pontos: [{ local: "Banheiros", aparelho: "Dispenser X", produto: "Sabonete", quantidade: "3" }, { produto: "Papel" }, { local: "Vazio" }] }))
      .toEqual([{ descricao: "Dispenser X + Sabonete — Banheiros", quantidade: "3" }, { descricao: "Papel", quantidade: "1" }]);
  });
  it("tipo de nota padrão: teste → remessa_teste, venda direta → venda", () => {
    expect(tipoNotaPadrao("teste")).toBe("remessa_teste");
    expect(tipoNotaPadrao("venda_direta")).toBe("venda");
  });
  it('sugerirProdutos casa "Alpha HP da Diversity" com Diversey', () => {
    const cat = [{ name: "Alpha HP", brand: "Diversey" }, { name: "Sabonete Neutro", brand: "Kimberly" }];
    expect(sugerirProdutos(cat, "Alpha HP da Diversity")[0]?.brand).toBe("Diversey");
    expect(sugerirProdutos(cat, "Diversity")[0]?.name).toBe("Alpha HP");
  });
  it("site padrão ou vazio não aparece no PDF", () => {
    expect(siteVisivel("www.nitsclean.com.br")).toBe(false);
    expect(siteVisivel("")).toBe(false);
    expect(siteVisivel("www.outro.com.br")).toBe(true);
  });
});
