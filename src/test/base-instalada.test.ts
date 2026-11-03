import { describe, expect, it } from "vitest";
import { avaliacaoErro, parseImportRows, podeGravarLocalizacao, pontoErro, pontosPendentes, proximasDatas, piorEstado } from "../../supabase/functions/_shared/base-instalada";

const none = () => false;

describe("plano de manutenção", () => {
  it("quinzenal na terça gera terças a cada 14 dias", () => {
    // 2026-11-03 is a Tuesday
    expect(proximasDatas({ frequencia: "quinzenal", dia_semana: 2, data_inicio: "2026-11-03" }, "2026-11-03", 30, none))
      .toEqual(["2026-11-03", "2026-11-17", "2026-12-01"]);
  });
  it("semanal gera uma por semana", () => {
    expect(proximasDatas({ frequencia: "semanal", dia_semana: 4, data_inicio: "2026-11-03" }, "2026-11-03", 21, none))
      .toEqual(["2026-11-05", "2026-11-12", "2026-11-19"]);
  });
  it("mensal mantém o mesmo dia da semana a cada 4 semanas", () => {
    expect(proximasDatas({ frequencia: "mensal", dia_semana: 2, data_inicio: "2026-11-03" }, "2026-11-03", 60, none))
      .toEqual(["2026-11-03", "2026-12-01", "2026-12-29"]);
  });
  it("personalizada usa o intervalo em dias", () => {
    expect(proximasDatas({ frequencia: "personalizada", intervalo_dias: 10, data_inicio: "2026-11-04" }, "2026-11-04", 25, none))
      .toEqual(["2026-11-04", "2026-11-14", "2026-11-24"]);
  });
  it("feriado empurra para o próximo dia útil sem mudar a série", () => {
    const blocked = (d: string) => d === "2026-11-17";
    expect(proximasDatas({ frequencia: "quinzenal", dia_semana: 2, data_inicio: "2026-11-03" }, "2026-11-03", 30, blocked))
      .toEqual(["2026-11-03", "2026-11-18", "2026-12-01"]);
  });
  it("não repete datas (sem duplicadas)", () => {
    const d = proximasDatas({ frequencia: "semanal", dia_semana: 2, data_inicio: "2026-11-03" }, "2026-11-03", 90, none);
    expect(new Set(d).size).toBe(d.length);
  });
  it("começa a série a partir de hoje quando o plano é antigo", () => {
    expect(proximasDatas({ frequencia: "quinzenal", dia_semana: 2, data_inicio: "2026-10-06" }, "2026-11-04", 20, none))
      .toEqual(["2026-11-17"]);
  });
});

describe("checklist", () => {
  it("não encerra com ponto ativo sem avaliação", () => {
    expect(pontosPendentes([{ id: "a" }, { id: "b" }, { id: "c", status: "RETIRADO" }], ["a"])).toEqual(["b"]);
  });
  it("exige foto em amarelo e vermelho, não em verde", () => {
    expect(avaliacaoErro({ estado: "verde" })).toBeNull();
    expect(avaliacaoErro({ estado: "amarelo" })).toMatch(/foto/);
    expect(avaliacaoErro({ estado: "vermelho", foto_path: "x" })).toBeNull();
  });
  it("precisa substituir exige o item", () => {
    expect(avaliacaoErro({ estado: "verde", precisa_substituir: true, item: "" })).toMatch(/item/);
  });
  it("novo ponto exige local e foto", () => {
    expect(pontoErro({ localizacao_interna: "Cozinha" })).toMatch(/foto/);
    expect(pontoErro({ localizacao_interna: "", foto_path: "x" })).toMatch(/local/);
    expect(pontoErro({ localizacao_interna: "Cozinha", foto_path: "x", quantidade: "2" })).toBeNull();
  });
  it("pior estado manda na cor do cliente", () => {
    expect(piorEstado(["verde", "amarelo"])).toBe("amarelo");
    expect(piorEstado(["verde", "vermelho", "amarelo"])).toBe("vermelho");
  });
});

describe("localização do check-in", () => {
  it("só grava com confirmação, mesmo para cliente sem localização", () => {
    expect(podeGravarLocalizacao({ latitude: null }, false)).toBe(false);
    expect(podeGravarLocalizacao({ latitude: -22.9 }, false)).toBe(false);
    expect(podeGravarLocalizacao({ latitude: -22.9 }, true)).toBe(true);
  });
});

describe("importação", () => {
  it("aponta linhas inválidas e duplicadas", () => {
    const r = parseImportRows([
      { Cliente: "Restaurante X", Cidade: "Búzios", "Frequência": "quinzenal", Dia: "terça" },
      { Cliente: "restaurante x", Cidade: "Buzios", "Frequência": "mensal", Dia: "quarta" },
      { Cliente: "Bar Y", Cidade: "", "Frequência": "semanal", Dia: "segunda" },
      { Cliente: "Hotel Z", Cidade: "Cabo Frio", "Frequência": "anual", Dia: "" },
      { Cliente: "Pousada W", Cidade: "Arraial", "Frequência": "Semanal", Dia: "sexta" },
    ], [{ name: "Pousada W", city: "Arraial" }]);
    expect(r[0]).toMatchObject({ erro: undefined, frequencia: "quinzenal", dia_semana: 2 });
    expect(r[1].erro).toBe("Cliente duplicado");
    expect(r[2].erro).toBe("Cidade vazia");
    expect(r[3].erro).toBe("Frequência inválida");
    expect(r[4].erro).toBe("Cliente duplicado");
  });
});
