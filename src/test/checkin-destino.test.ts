import { describe, expect, it } from "vitest";
import { evaluateCheckin } from "../../supabase/functions/_shared/visit-exec";
import { geocodeQuery } from "../../supabase/functions/_shared/geocode";
import { fieldMetrics, matchesFilter } from "@/lib/field-ops";

const rio = { lat: -22.9897, lng: -43.3566 };

describe("check-in sem coordenadas do destino", () => {
  it("caso real e2ce5bb2: posição boa, cliente sem coordenadas → não é 'dentro do raio'", () => {
    const ev = evaluateCheckin(rio, { lat: null, lng: null }, 300);
    expect(ev.distancia_m).toBeNull();
    expect(ev.destino_sem_coordenadas).toBe(true);
    expect(ev.fora_do_raio).toBe(false);
  });
  it("com coordenadas do cliente em Cabo Frio, quem está no Rio fica fora do raio", () => {
    const ev = evaluateCheckin(rio, { lat: -22.8794, lng: -42.0187 }, 300);
    expect(ev.destino_sem_coordenadas).toBe(false);
    expect(ev.fora_do_raio).toBe(true);
    expect(ev.distancia_m!).toBeGreaterThan(100_000);
  });
  it("gestor vê o check-in como 'sem coordenadas' e pode filtrar", () => {
    const s = { id: "a", assigned_to: "u", scheduled_date: "2026-11-04", start_time: "10:00", status: "em_atendimento" };
    const m = fieldMetrics([s], [{ schedule_id: "a", fora_do_raio: false, sem_permissao: false, latitude: rio.lat, destino_sem_coordenadas: true }],
      new Date("2026-11-04T13:00:00Z"), "2026-11-04", "2026-11-02");
    expect(m.semCoordenadas).toEqual(["a"]);
    expect(matchesFilter(s, "sem_coordenadas", { atrasadas: [], foraDoLocal: [], semCoordenadas: m.semCoordenadas })).toBe(true);
  });
});

describe("geocodificação por endereço/CEP", () => {
  it("usa endereço e CEP", () => {
    expect(geocodeQuery({ endereco: "Rua A, 10", cidade: "Cabo Frio", estado: "RJ", cep: "28907000" })).toBe("Rua A, 10, Cabo Frio, RJ, 28907-000, Brasil");
  });
  it("só CEP já basta", () => {
    expect(geocodeQuery({ cep: "28907-000" })).toBe("28907-000, Brasil");
  });
  it("só a cidade não geocodifica (seria impreciso)", () => {
    expect(geocodeQuery({ cidade: "Cabo Frio" })).toBeNull();
  });
});
