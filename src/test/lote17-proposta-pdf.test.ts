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
