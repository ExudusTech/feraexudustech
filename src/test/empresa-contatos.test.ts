import { describe, expect, it } from "vitest";
import { canRegisterExistingClient, emptyContato, isConversionStageTipo, normalizePrimary, validateContatos } from "@/lib/empresa-contatos";

const c = (nome: string, telefone: string, is_primary = false) => ({ ...emptyContato(is_primary), nome, telefone });

describe("contatos da empresa", () => {
  it("novo lead exige pelo menos 1 contato", () => {
    expect(validateContatos([emptyContato(true)], { minOne: true }).geral).toBeTruthy();
    expect(validateContatos([c("Ana", "(22) 99999-0000")], { minOne: true })).toEqual({});
  });
  it("contato exige nome e telefone/WhatsApp válido", () => {
    const e = validateContatos([c("", "(22) 99999-0000"), c("Bia", "123")], { minOne: true });
    expect(e["0.nome"]).toBeTruthy();
    expect(e["1.telefone"]).toBeTruthy();
  });
  it("cliente pode ser salvo sem contatos", () => {
    expect(validateContatos([], { minOne: false })).toEqual({});
  });
  it("mantém exatamente um contato principal", () => {
    expect(normalizePrimary([c("A", "22999990000"), c("B", "22999990001")]).map((x) => x.is_primary)).toEqual([true, false]);
    expect(normalizePrimary([c("A", "22999990000", true), c("B", "22999990001", true)]).filter((x) => x.is_primary)).toHaveLength(1);
    expect(normalizePrimary([c("A", "22999990000"), c("B", "22999990001", true)]).map((x) => x.is_primary)).toEqual([false, true]);
  });
  it("só gestor/admin/super_admin cadastram cliente já atendido pela tela Clientes", () => {
    expect(canRegisterExistingClient(["gestor"])).toBe(true);
    expect(canRegisterExistingClient(["super_admin"])).toBe(true);
    expect(canRegisterExistingClient(["consultor_tecnico"])).toBe(false);
    expect(canRegisterExistingClient(["vendedor"])).toBe(false);
  });
  it("Ganho e Cliente ativo pedem conversão; outras etapas não", () => {
    expect(isConversionStageTipo("ganho")).toBe(true);
    expect(isConversionStageTipo("cliente")).toBe(true);
    expect(isConversionStageTipo("perdido")).toBe(false);
    expect(isConversionStageTipo("aberto")).toBe(false);
  });
});
