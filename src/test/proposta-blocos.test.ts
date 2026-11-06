import { describe, it, expect } from "vitest";
import { statusBlocos, primeiroPendente, totalItem } from "@/lib/proposta-blocos";

const base = { temEmpresa: true, temResponsavel: true, pontos: [], itens: [{ unit_price: 10 }] };

describe("blocos da proposta", () => {
  it("2 itens sem preço bloqueiam o PDF com 'Falta: preço de 2 itens'", () => {
    const s = statusBlocos({ ...base, itens: [{ unit_price: null }, { unit_price: null }, { unit_price: 5 }] });
    expect(s.podeGerarPdf).toBe(false);
    expect(s.falta).toBe("Falta: preço de 2 itens");
    expect(s.pronto.produtos).toBe(false);
  });
  it("cliente pronto só com empresa + responsável", () => {
    expect(statusBlocos({ ...base, temResponsavel: false }).pronto.cliente).toBe(false);
    expect(statusBlocos(base).pronto.cliente).toBe(true);
  });
  it("abre no primeiro bloco pendente", () => {
    const s = statusBlocos({ ...base, itens: [{ unit_price: null }] });
    expect(primeiroPendente(s.pronto)).toBe("produtos");
    expect(primeiroPendente(statusBlocos(base).pronto)).toBe(null);
  });
  it("ponto sem aparelho deixa ambiente pendente mas não bloqueia PDF", () => {
    const s = statusBlocos({ ...base, pontos: [{ aparelho: null, produto: "Refil" }] });
    expect(s.pronto.ambiente).toBe(false);
    expect(s.podeGerarPdf).toBe(true);
  });
  it("total do item aplica desconto", () => {
    expect(totalItem(10, 3, 10)).toBe(27);
    expect(totalItem(null, 3, 0)).toBe(null);
  });
});
