import { describe, expect, it } from "vitest";
import { agendaDataErro, aguardandoData, aparelhosDaVisita, aposVisita, cadenciaTexto, periodoDias, planejarRevisita, proximaPassagem, type AgendaCliente } from "../../supabase/functions/_shared/revisita";
import { pontosPendentes } from "../../supabase/functions/_shared/base-instalada";
import { ERRO_SEM_ROTA, planejarAtivacoes } from "../../supabase/functions/_shared/ativacao";
import { nextMaintenance } from "../../supabase/functions/_shared/visit-exec";

// 17/11/2026 is a Tuesday; the client's city route passes every Tuesday.
const TERCA: AgendaCliente = { modo: "rota", rota: [2] };

describe("revisita concentrada: uma visita por cliente", () => {
  const aparelhos = [{ id: "A", proxima: "2026-11-24" }, { id: "B", proxima: "2026-11-27" }, { id: "C", proxima: "2026-12-01" }];

  it("aparelhos de 7, 10 e 14 dias → visita no dia de rota com só os que vencem até a passagem seguinte", () => {
    const r = planejarRevisita({ desde: "2026-11-18", agenda: TERCA, aparelhos });
    expect(r).toEqual({ data: "2026-11-24", aparelhos: ["A", "B"], proxima_passagem: "2026-12-01" });
  });
  it("a cadência do cliente é a menor periodicidade arredondada ao dia de rota (semanal)", () => {
    expect(cadenciaTexto(["7", "10", "14"], TERCA)).toBe("Semanal (menor periodicidade: 7 dias)");
    expect(cadenciaTexto(["quinzenal", "mensal"], TERCA)).toBe("Quinzenal (menor periodicidade: 15 dias)");
  });
  it("ao encerrar, só os aparelhos atendidos ganham nova data e a próxima visita traz os que vencem", () => {
    const comPer = [{ ...aparelhos[0], periodicidade: "7" }, { ...aparelhos[1], periodicidade: "10" }, { ...aparelhos[2], periodicidade: "14" }];
    const depois = aposVisita(comPer, ["A", "B"], "2026-11-24", nextMaintenance);
    expect(depois.map((a) => a.proxima)).toEqual(["2026-12-01", "2026-12-04", "2026-12-01"]);
    expect(planejarRevisita({ desde: "2026-11-25", agenda: TERCA, aparelhos: depois })?.aparelhos).toEqual(["A", "B", "C"]);
  });
  it("aparelho atrasado ou sem data entra na primeira passagem", () => {
    const r = planejarRevisita({ desde: "2026-11-18", agenda: TERCA, aparelhos: [{ id: "X", proxima: "2026-11-01" }, { id: "Y", proxima: null }, { id: "Z", proxima: "2027-01-30" }] });
    expect(r).toMatchObject({ data: "2026-11-24", aparelhos: ["X", "Y"] });
  });
  it("feriado no dia de rota: a visita vai para a passagem seguinte", () => {
    const r = planejarRevisita({ desde: "2026-11-18", agenda: TERCA, aparelhos, bloqueado: (d) => d === "2026-11-24" });
    expect(r?.data).toBe("2026-12-01");
    expect(r?.aparelhos).toEqual(["A", "B", "C"]);
  });
  it("visita já aberta no período recebe os aparelhos que vencem (sem duplicar)", () => {
    expect(aparelhosDaVisita("2026-11-24", { desde: "2026-11-18", agenda: TERCA, aparelhos })).toEqual(["A", "B"]);
    expect(aparelhosDaVisita("2026-11-17", { desde: "2026-11-17", agenda: TERCA, aparelhos })).toEqual([]);
  });
  it("na checagem de saída, só os aparelhos previstos na visita são obrigatórios", () => {
    const pts = [{ id: "A", status: "ATIVO" }, { id: "B", status: "ATIVO" }, { id: "C", status: "ATIVO" }];
    expect(pontosPendentes(pts, ["A"], ["A", "B"])).toEqual(["B"]);
    expect(pontosPendentes(pts, ["A"], [])).toEqual(["B", "C"]);
  });
  it("periodicidade em dias", () => {
    expect([periodoDias("semanal"), periodoDias("quinzenal"), periodoDias("mensal"), periodoDias("bimestral"), periodoDias("10")]).toEqual([7, 15, 30, 60, 10]);
  });
});

describe("atendimento por data (fora da rota)", () => {
  it("dia X do mês ignora o dia de rota da cidade", () => {
    const a: AgendaCliente = { modo: "data", rota: [2], regra: "dia_mes", dia_mes: 10 };
    expect(proximaPassagem(a, "2026-11-18")).toBe("2026-12-10"); // quinta-feira, não terça
  });
  it("dia X que cai no domingo passa para segunda; a visita concentra os aparelhos", () => {
    const a: AgendaCliente = { modo: "data", rota: [], regra: "dia_mes", dia_mes: 13 };
    expect(proximaPassagem(a, "2026-11-18")).toBe("2026-12-14");
    const b: AgendaCliente = { modo: "data", rota: [], regra: "dia_mes", dia_mes: 10 };
    expect(planejarRevisita({ desde: "2026-11-18", agenda: b, aparelhos: [{ id: "A", proxima: "2027-01-20" }] })?.data).toBe("2027-01-11");
  });
  it("a cada N dias a partir da última visita", () => {
    const a: AgendaCliente = { modo: "data", rota: [2], regra: "intervalo", intervalo_dias: 45, ancora: "2026-11-01" };
    expect(proximaPassagem(a, "2026-11-18")).toBe("2026-12-16");
  });
  it("próxima data informada manualmente é usada como está", () => {
    const a: AgendaCliente = { modo: "data", rota: [2], regra: "manual", proxima_data: "2026-12-03" };
    expect(planejarRevisita({ desde: "2026-11-18", agenda: a, aparelhos: [{ id: "A", proxima: "2027-02-01" }] })).toEqual({ data: "2026-12-03", aparelhos: ["A"], proxima_passagem: null });
  });
  it("sem data informada o cliente fica aguardando data (nenhuma visita automática)", () => {
    const a: AgendaCliente = { modo: "data", rota: [], regra: "manual", proxima_data: null };
    expect(planejarRevisita({ desde: "2026-11-18", agenda: a, aparelhos: [{ id: "A" }] })).toBeNull();
    const plano = { modo_agenda: "data", regra_data: "manual", proxima_data: null, ativo: true };
    expect(aguardandoData(plano, "2026-11-18", false)).toBe(true);
    expect(aguardandoData(plano, "2026-11-18", true)).toBe(false);
    expect(aguardandoData({ ...plano, proxima_data: "2026-11-10" }, "2026-11-18", false)).toBe(true);
    expect(aguardandoData({ ...plano, regra_data: "dia_mes", dia_mes: 5 }, "2026-11-18", false)).toBe(false);
    expect(aguardandoData({ modo_agenda: "rota", ativo: true }, "2026-11-18", false)).toBe(false);
  });
  it("validação do formulário", () => {
    expect(agendaDataErro({ regra: "manual", proxima_data: "2026-11-10" }, "2026-11-18")).toBe("A próxima data não pode estar no passado");
    expect(agendaDataErro({ regra: "manual", proxima_data: "2026-11-22" }, "2026-11-18")).toBe("A próxima data cai num domingo");
    expect(agendaDataErro({ regra: "dia_mes", dia_mes: 32 }, "2026-11-18")).toBe("Dia do mês entre 1 e 31");
    expect(agendaDataErro({ regra: "intervalo", intervalo_dias: 30 }, "2026-11-18")).toBeNull();
  });
  it("importação/lote: cidade sem rota cadastrada não gera OS e vai para 'Aguardando data'", () => {
    const [l] = planejarAtivacoes({ clientes: [{ id: "c1", nome: "Hotel Serra", cidade: "Nova Friburgo" }], areas: [{ name: "Cabo Frio", city: "Cabo Frio", dia_semana: "3ª feira" }],
      desde: "2026-11-18", ocupados: [] });
    expect(l.erro).toBe(ERRO_SEM_ROTA); expect(l.data).toBeUndefined();
  });
});
