import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estaEmHorario, gravidade, minutosUteis, normalizeHumanHours, proximoHorarioUtil } from "../../supabase/functions/_shared/business-hours";

const cfg = normalizeHumanHours(undefined);
const finados = [{ date: "2026-11-02", city: null }];
const d = (iso: string) => new Date(iso);

describe("business hours (seg–sex 08:00–18:00, America/Sao_Paulo)", () => {
  it("Sunday afternoon reopens Monday 8h", () => {
    const next = proximoHorarioUtil(d("2026-11-08T18:00:00Z"), cfg, []);
    expect(next.at.toISOString()).toBe("2026-11-09T11:00:00.000Z");
    expect(next.label).toBe("segunda-feira, 09/11, a partir das 8h");
  });
  it("Finados 02/11 reopens Tuesday 03/11 8h", () => {
    const now = d("2026-11-02T17:00:00Z");
    expect(estaEmHorario(now, cfg, finados)).toBe(false);
    expect(proximoHorarioUtil(now, cfg, finados).labelComArtigo).toBe("na terça-feira, 03/11, a partir das 8h");
  });
  it("Friday 19h reopens Monday", () => {
    expect(proximoHorarioUtil(d("2026-11-06T22:00:00Z"), cfg, []).date).toBe("2026-11-09");
  });
  it("before 8h on a weekday opens the same day", () => {
    const next = proximoHorarioUtil(d("2026-11-04T09:30:00Z"), cfg, []);
    expect(next.at.toISOString()).toBe("2026-11-04T11:00:00.000Z");
  });
  it("18h sharp is already closed", () => {
    expect(estaEmHorario(d("2026-11-04T21:00:00Z"), cfg, [])).toBe(false);
    expect(estaEmHorario(d("2026-11-04T20:59:00Z"), cfg, [])).toBe(true);
  });
  it("municipal holiday closes only its city", () => {
    const closed = [{ date: "2026-11-04", city: "Cabo Frio" }];
    expect(estaEmHorario(d("2026-11-04T14:00:00Z"), cfg, closed, "Cabo Frio")).toBe(false);
    expect(estaEmHorario(d("2026-11-04T14:00:00Z"), cfg, closed, "Búzios")).toBe(true);
  });
  it("Saturday uses 'no' article", () => {
    const sat = normalizeHumanHours({ days: [6], start: "09:00", end: "12:00" });
    expect(proximoHorarioUtil(d("2026-11-04T14:00:00Z"), sat, []).labelComArtigo).toBe("no sábado, 07/11, a partir das 9h");
  });
  it("counts waiting minutes only inside open windows", () => {
    // Friday 17:50 → Monday 08:10 = 10 + 10 minutes
    expect(minutosUteis(d("2026-11-06T20:50:00Z"), d("2026-11-09T11:10:00Z"), cfg, [])).toBe(20);
    // Over Finados nothing counts on 02/11
    expect(minutosUteis(d("2026-11-02T12:00:00Z"), d("2026-11-03T11:30:00Z"), cfg, finados)).toBe(30);
  });
  it("severity limits: green ≤15, yellow 15–60, red >60", () => {
    expect(gravidade(15)).toBe("verde");
    expect(gravidade(16)).toBe("amarelo");
    expect(gravidade(60)).toBe("amarelo");
    expect(gravidade(61)).toBe("vermelho");
  });
  it("mcp embeds the same business-hours code as the shared module", () => {
    const block = (src: string) => src.slice(src.indexOf("// BEGIN business-hours"), src.indexOf("// END business-hours"));
    const shared = block(readFileSync("supabase/functions/_shared/business-hours.ts", "utf8")).replace(/export /g, "");
    expect(block(readFileSync("supabase/functions/mcp/index.ts", "utf8"))).toBe(shared);
  });
});
