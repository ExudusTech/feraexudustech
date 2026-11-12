import { describe, expect, it } from "vitest";
import { corDaOcorrencia, contarPorCor } from "@/lib/ocorrencia-cores";
import { ordemDaRota, regioesDoDia, rotaBaseDe, ROTA_BASE_PADRAO, cidadeNaRegiao } from "@/lib/rota";

describe("cor por tipo de ocorrência", () => {
  it("primeiro atendimento / comercial a lead é amarelo (lead)", () => {
    expect(corDaOcorrencia({ ocorrencia_tipo: "primeira_visita", lead_id: "l1" })).toBe("lead");
    expect(corDaOcorrencia({ schedule_type: "visita_comercial", schedule_subtype: "PROSPECCAO", lead_id: "l1" })).toBe("lead");
  });
  it("instalação de teste é laranja (teste)", () => {
    expect(corDaOcorrencia({ ocorrencia_tipo: "instalacao_teste", lead_id: "l1" })).toBe("teste");
  });
  it("ativação da base é azul-escuro (ativacao)", () => {
    expect(corDaOcorrencia({ ocorrencia_tipo: "ativacao_base", schedule_type: "manutencao", client_id: "c1" })).toBe("ativacao");
  });
  it("manutenção preventiva é verde", () => {
    expect(corDaOcorrencia({ ocorrencia_tipo: "manutencao_preventiva", client_id: "c1" })).toBe("manutencao");
    expect(corDaOcorrencia({ schedule_type: "manutencao", client_id: "c1" })).toBe("manutencao");
  });
  it("recarga / entrega de refil é ciano (recarga)", () => {
    expect(corDaOcorrencia({ ocorrencia_tipo: "entrega", client_id: "c1" })).toBe("recarga");
    expect(corDaOcorrencia({ schedule_subtype: "REPOSICAO", client_id: "c1" })).toBe("recarga");
  });
  it("visita comercial a cliente é roxo (cliente)", () => {
    expect(corDaOcorrencia({ schedule_type: "visita_comercial", client_id: "c1" })).toBe("cliente");
    expect(corDaOcorrencia({ ocorrencia_tipo: "primeira_visita", client_id: "c1" })).toBe("cliente");
  });
  it("outros tipos são cinza", () => {
    expect(corDaOcorrencia({ ocorrencia_tipo: "chamado_corretivo", client_id: "c1" })).toBe("outros");
    expect(corDaOcorrencia({ ocorrencia_tipo: "substituicao", client_id: "c1" })).toBe("outros");
  });
  it("conta por cor na ordem da legenda", () => {
    expect(contarPorCor([{ ocorrencia_tipo: "manutencao_preventiva" }, { ocorrencia_tipo: "primeira_visita", lead_id: "l" }, { ocorrencia_tipo: "manutencao_preventiva" }]))
      .toEqual([{ cor: "lead", n: 1 }, { cor: "manutencao", n: 2 }]);
  });
});

describe("ordem da rota", () => {
  const base = { latitude: 0, longitude: 0 };
  const p = (id: string, lng: number, checkin_em: string | null = null) => ({ id, latitude: 0, longitude: lng, checkin_em });
  it("sem check-in: vizinho mais próximo a partir do ponto de saída", () => {
    const { ordem, reais } = ordemDaRota(base, [p("longe", 0.3), p("perto", 0.1), p("meio", 0.2)]);
    expect(ordem.map((x) => x.id)).toEqual(["perto", "meio", "longe"]);
    expect(reais).toBe(0);
  });
  it("com check-ins: ordem real primeiro, o resto a partir do último check-in", () => {
    const { ordem, reais } = ordemDaRota(base, [p("a", 0.1), p("b", 0.5, "2026-11-12T14:00:00Z"), p("c", 0.4), p("d", 0.3, "2026-11-12T12:00:00Z")]);
    expect(ordem.map((x) => x.id)).toEqual(["d", "b", "c", "a"]);
    expect(reais).toBe(2);
  });
  it("ponto de saída padrão é a base de Cabo Frio e pode ser trocado", () => {
    expect(rotaBaseDe(null)).toEqual(ROTA_BASE_PADRAO);
    expect(ROTA_BASE_PADRAO.nome).toBe("Base Cabo Frio");
    expect(rotaBaseDe({ nome: "Base Macaé", latitude: -22.37, longitude: -41.78 })).toEqual({ nome: "Base Macaé", latitude: -22.37, longitude: -41.78 });
  });
  it("regiões do dia pela agenda de rota e consultor", () => {
    const areas = [
      { id: "1", city: "Cabo Frio", dia_semana: "2ª feira e 6ª feira", consultant_user_id: "u1", is_active: true },
      { id: "2", city: "Araruama", dia_semana: "4ª feira", consultant_user_id: "u2", is_active: true },
      { id: "3", city: "Macaé", dia_semana: "3ª feira e 5ª feira", consultant_user_id: null, is_active: true },
    ];
    expect(regioesDoDia(areas, 1).map((a) => a.id)).toEqual(["1"]);
    expect(regioesDoDia(areas, 3, "u1").map((a) => a.id)).toEqual([]);
    expect(regioesDoDia(areas, 4, "u1").map((a) => a.id)).toEqual(["3"]);
    expect(cidadeNaRegiao("Iguabinha", "Iguabinha (Araruama)")).toBe(true);
    expect(cidadeNaRegiao("Cabo Frio", "Araruama")).toBe(false);
  });
});
