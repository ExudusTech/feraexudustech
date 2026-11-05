import { describe, expect, it } from "vitest";
import { avaliacaoErro, parseImportRows, podeGravarLocalizacao, pontoErro, pontosPendentes, proximasDatas, piorEstado, parseDiaSemana, intervaloDias, proximaVisitaPlano, areaDoCliente } from "../../supabase/functions/_shared/base-instalada";

const none = () => false;

describe("plano de manutenção (dias de rota, 05/11)", () => {
  const rio = parseDiaSemana("3ª feira e 5ª feira"); // Rio das Ostras: terça/quinta
  it("lê os dias de rota da região", () => { expect(rio).toEqual([2, 4]); });
  it("quinzenal = 15 dias, caindo no primeiro dia de rota na data-alvo ou após", () => {
    // 2026-11-03 terça → +15 = 18/11 quarta → quinta 19/11 → +15 = 04/12 sexta → terça 08/12
    expect(proximasDatas({ frequencia: "quinzenal", data_inicio: "2026-11-03" }, "2026-11-03", 40, none, rio))
      .toEqual(["2026-11-03", "2026-11-19", "2026-12-08"]);
  });
  it("semanal = 7 e mensal = 30 dias", () => {
    expect(intervaloDias({ frequencia: "semanal", data_inicio: "" })).toBe(7);
    expect(intervaloDias({ frequencia: "quinzenal", data_inicio: "" })).toBe(15);
    expect(intervaloDias({ frequencia: "mensal", data_inicio: "" })).toBe(30);
  });
  it("mensal em Rio das Ostras: 30 dias depois, próximo terça/quinta", () => {
    // 2026-11-05 quinta + 30 = 05/12 sábado → terça 08/12
    expect(proximaVisitaPlano({ frequencia: "mensal", data_inicio: "2026-11-05" }, "2026-11-05", rio)).toBe("2026-12-08");
  });
  it("nunca cai em feriado nem bloqueio do Google: pula para o próximo dia de rota", () => {
    const blocked = (d: string) => d === "2026-11-19";
    expect(proximasDatas({ frequencia: "quinzenal", data_inicio: "2026-11-03" }, "2026-11-03", 20, blocked, rio))
      .toEqual(["2026-11-03", "2026-11-24"]);
  });
  it("continua a partir da última visita do plano", () => {
    expect(proximasDatas({ frequencia: "semanal", data_inicio: "2026-10-01" }, "2026-11-04", 10, none, rio, "2026-11-03"))
      .toEqual(["2026-11-10"]);
  });
  it("não repete datas", () => {
    const d = proximasDatas({ frequencia: "semanal", data_inicio: "2026-11-03" }, "2026-11-03", 90, none, rio);
    expect(new Set(d).size).toBe(d.length);
  });
  it("região pelo CEP mais específico, senão pela cidade", () => {
    const areas = [{ name: "Cabo Frio", city: "Cabo Frio", zip_code_start: "28900-000", zip_code_end: "28929-999" },
      { name: "Cabo Frio 2º Distrito", city: "Cabo Frio 2º Distrito", zip_code_start: "28925-000", zip_code_end: "28929-999" },
      { name: "Rio das Ostras", city: "Rio das Ostras" }];
    expect(areaDoCliente(areas, "28926-100", "Cabo Frio")?.name).toBe("Cabo Frio 2º Distrito");
    expect(areaDoCliente(areas, null, "rio das ostras")?.name).toBe("Rio das Ostras");
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
    expect(r[0].erro).toBeUndefined();
    expect(r[0]).toMatchObject({ frequencia: "quinzenal", dia_semana: 2 });
    expect(r[1].erro).toBe("Cliente duplicado");
    expect(r[2].erro).toBe("Cidade vazia");
    expect(r[3].erro).toBe("Frequência inválida");
    expect(r[4].erro).toBe("Cliente duplicado");
  });
});
