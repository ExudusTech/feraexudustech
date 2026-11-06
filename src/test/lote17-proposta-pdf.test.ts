import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_PROPOSTA_CONFIG } from "@/lib/proposta-config";

const shared = readFileSync("supabase/functions/_shared/proposta-pdf.ts", "utf8");

describe("Lote 17 — proposta em PDF", () => {
  it("validade padrão é 10 dias", () => { expect(DEFAULT_PROPOSTA_CONFIG.validade_dias).toBe(10); });
  it("padrões da tela de Configurações são idênticos aos do servidor", () => {
    const a = shared.indexOf("export interface PropostaConfig"), b = shared.indexOf("export function mergeConfig");
    const src = readFileSync("src/lib/proposta-config.ts", "utf8");
    expect(src).toContain(shared.slice(a, b).trim());
  });
  it("Multi Química nunca entra como parceiro", () => {
    expect(shared).toMatch(/multiquimica/);
  });
  it("função bloqueia itens sem preço", () => {
    const fn = readFileSync("supabase/functions/proposta-pdf/index.ts", "utf8");
    expect(fn).toMatch(/unit_price == null/);
    expect(fn).toMatch(/422/);
  });
});

describe("PDF: comodato só na solução por ambiente", () => {
  it("não tem seção separada e inclui aparelho sem ponto como Geral", async () => {
    expect(shared).not.toContain('section("Aparelhos em comodato"');
    const { ambientesComGeral } = await import("../../supabase/functions/_shared/proposta-pdf");
    const r = ambientesComGeral([{ local: "Banheiro feminino", aparelho: "Dispenser X", produto: "Refil", quantidade: "2" }],
      [{ descricao: "Dispenser X", quantidade: 1 }, { descricao: "Aromatizador Y", quantidade: 3 }]);
    expect(r).toHaveLength(2);
    expect(r[1]).toEqual({ local: "Geral", aparelho: "Aromatizador Y", produto: null, quantidade: "3" });
  });
});
