import { describe, expect, it } from "vitest";
import { evaluateCheckin, durationMinutes, nextMaintenance, validateCheckout, confirmationDue, lateMinutes, requiresPhoto, stageForCheckout } from "../../supabase/functions/_shared/visit-exec";

const base = { lat: -22.8800, lng: -42.0200 };
const north = (m: number) => ({ lat: base.lat + m / 111_195, lng: base.lng });

describe("visit execution rules", () => {
  it("299 m is fine, 301 m needs a reason", () => {
    expect(evaluateCheckin(north(299), base, 300).precisa_justificativa).toBe(false);
    expect(evaluateCheckin(north(301), base, 300).precisa_justificativa).toBe(true);
  });
  it("no location permission needs a reason", () => {
    expect(evaluateCheckin(null, base).precisa_justificativa).toBe(true);
  });
  it("duration in minutes", () => { expect(durationMinutes("2026-11-03T13:00:00Z", "2026-11-03T13:47:00Z")).toBe(47); });
  it("next maintenance = today + periodicity", () => {
    expect(nextMaintenance("2026-11-03", "trimestral")).toBe("2027-02-03");
    expect(nextMaintenance("2026-11-03", null)).toBe("2026-12-03");
  });
  it("cannot finish without next step", () => {
    const ok = { status: "em_atendimento", resultado: "boa", resumo: "Cliente gostou", proximo: "proposta", commercial: true, fotos: 0, precisa_foto: false };
    expect(validateCheckout(ok)).toBeNull();
    expect(validateCheckout({ ...ok, proximo: "" })).toBe("Defina o próximo passo");
    expect(validateCheckout({ ...ok, proximo: "perdido", motivo_perda: "preço" })).toMatch(/confirme/);
  });
  it("photo required only for technical visits", () => {
    expect(requiresPhoto("manutencao", "MANUTENCAO")).toBe(true);
    expect(requiresPhoto("visita_comercial", "PROSPECCAO")).toBe(false);
    expect(validateCheckout({ status: "em_atendimento", resultado: "concluida", resumo: "ok ok", proximo: "follow_up", data_alvo: "2027-05-01", commercial: false, fotos: 0, precisa_foto: true })).toMatch(/foto/);
  });
  it("lead stages", () => {
    expect(stageForCheckout(true, "proposta")).toBe("visita_realizada");
    expect(stageForCheckout(false, "perdido")).toBe("perdido");
  });
  const s = { scheduled_date: "2026-11-06", start_time: "14:00:00", confirmacao_status: "pendente", d1_sent: false, dia_sent: false, sem_resposta_alertado: false };
  const cfg = { d1_hora: "17:00", horas_antes: 2 };
  it("D-1 at 17h, same day 2h before, no answer 1h before", () => {
    expect(confirmationDue(new Date("2026-11-05T19:59:00Z"), s, cfg, true)).toBeNull();
    expect(confirmationDue(new Date("2026-11-05T20:00:00Z"), s, cfg, true)).toBe("d1");
    expect(confirmationDue(new Date("2026-11-05T20:00:00Z"), s, cfg, false)).toBeNull();
    expect(confirmationDue(new Date("2026-11-06T15:00:00Z"), { ...s, d1_sent: true }, cfg, true)).toBe("dia");
    expect(confirmationDue(new Date("2026-11-06T16:10:00Z"), { ...s, d1_sent: true, dia_sent: true }, cfg, true)).toBe("sem_resposta");
    expect(confirmationDue(new Date("2026-11-05T20:00:00Z"), { ...s, confirmacao_status: "nao_aplicavel" }, cfg, true)).toBeNull();
  });
  it("late after 15 min without check-in", () => {
    expect(lateMinutes(new Date("2026-11-06T17:16:00Z"), { scheduled_date: "2026-11-06", start_time: "14:00", status: "agendado" })).toBe(16);
    expect(lateMinutes(new Date("2026-11-06T17:16:00Z"), { scheduled_date: "2026-11-06", start_time: "14:00", status: "em_atendimento" })).toBe(0);
  });
});

import { attemptsFor, confirmationEligible, CONFIRMACAO_MAX_TENTATIVAS } from "../../supabase/functions/_shared/visit-exec";
describe("client confirmation eligibility and retries", () => {
  it("skips visits created before 03/11/2026 (São Paulo)", () => {
    expect(confirmationEligible("2026-11-02T23:59:00-03:00", "chat1")).toBe(false);
    expect(confirmationEligible("2026-11-03T00:00:00-03:00", "chat1")).toBe(true);
  });
  it("skips visits without a client chat", () => {
    expect(confirmationEligible("2026-11-04T10:00:00Z", null)).toBe(false);
  });
  it("allows at most 3 attempts per step", () => {
    expect(CONFIRMACAO_MAX_TENTATIVAS).toBe(3);
    expect(attemptsFor("d1", 3, "d1: HTTP 500")).toBe(3);
  });
  it("a failed D-1 does not consume the same-day attempts", () => {
    expect(attemptsFor("dia", 3, "d1: HTTP 500")).toBe(0);
  });
});
