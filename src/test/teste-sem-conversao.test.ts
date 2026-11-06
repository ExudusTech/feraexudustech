import { describe, it, expect } from "vitest";
import { converteLeadNaColeta } from "../../supabase/functions/_shared/coleta";
import { statusPontoNovo, pontosPendentes } from "../../supabase/functions/_shared/base-instalada";
import { requiresClient, targetAllowed } from "@/lib/schedule-form";

const lead = { kind: "lead" as const, id: "l1", name: "La Gare", city: null, address: null, zip_code: null, latitude: null, longitude: null };

describe("instalação de teste não converte lead", () => {
  it("confirmar coleta com passo teste mantém lead", () => {
    expect(converteLeadNaColeta({ proximos_passos: [{ tipo: "teste", data: "2026-11-07" }] } as any)).toBe(false);
  });
  it("venda direta converte", () => {
    expect(converteLeadNaColeta({ proximos_passos: [{ tipo: "venda_direta", data: "2026-11-07" }] } as any)).toBe(true);
  });
  it("agendamento de instalação de teste aceita lead; definitiva exige cliente", () => {
    expect(requiresClient("visita_tecnica", "instalacao_teste")).toBe(false);
    expect(targetAllowed("visita_tecnica", lead, "instalacao_teste")).toBe(true);
    expect(targetAllowed("visita_tecnica", lead, "instalacao_definitiva")).toBe(false);
  });
  it("aparelho ativado em teste fica EM_TESTE e entra no checklist", () => {
    expect(statusPontoNovo({ client_id: null, operacao_material: "instalacao_teste" })).toBe("EM_TESTE");
    expect(statusPontoNovo({ client_id: "c1", operacao_material: "instalacao_definitiva" })).toBe("ATIVO");
    expect(pontosPendentes([{ id: "p1", status: "EM_TESTE" }], [])).toEqual(["p1"]);
  });
});
