import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateCheckin } from "../../supabase/functions/_shared/visit-exec";
import { fieldMetrics } from "@/lib/field-ops";

const position = (timestamp = Date.now(), accuracy = 12) => ({ coords: { latitude: -22.88, longitude: -42.02, accuracy }, timestamp } as GeolocationPosition);
const fakeGeo = (...outcomes: (number | GeolocationPosition)[]) => {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure: PositionErrorCallback, _options?: PositionOptions) => {
    const outcome = outcomes.shift();
    if (typeof outcome === "number") failure({ code: outcome } as GeolocationPositionError);
    else if (outcome) success(outcome);
  });
  return { geo: { getCurrentPosition } as unknown as Geolocation, getCurrentPosition };
};
beforeEach(() => vi.resetModules());

describe("check-in geolocation", () => {
  it("only PERMISSION_DENIED marks sem_permissao and does not retry denial", async () => {
    const { getPosition } = await import("@/lib/geolocation");
    const { geo, getCurrentPosition } = fakeGeo(1);
    const result = await getPosition(geo);
    expect(result).toEqual({ position: null, error: "PERMISSION_DENIED", cached: false });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(evaluateCheckin(null, {}, 300, result.error).sem_permissao).toBe(true);
  });
  it.each([[2, "POSITION_UNAVAILABLE"], [3, "TIMEOUT"]] as const)("code %i stays distinct after both failures", async (code, error) => {
    const { getPosition } = await import("@/lib/geolocation");
    const { geo, getCurrentPosition } = fakeGeo(code, code);
    const result = await getPosition(geo);
    expect(result.error).toBe(error);
    expect(result.position).toBeNull();
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ timeout: 20000, enableHighAccuracy: true });
    expect(getCurrentPosition.mock.calls[1][2]).toMatchObject({ timeout: 45000, enableHighAccuracy: true });
    expect(evaluateCheckin(null, {}, 300, result.error)).toMatchObject({ sem_permissao: false, precisa_justificativa: true });
  });
  it("a successful retry needs no justification even with low accuracy", async () => {
    const { getPosition } = await import("@/lib/geolocation");
    const { geo } = fakeGeo(3, position(Date.now(), 800));
    const result = await getPosition(geo);
    expect(result.position?.precisao).toBe(800);
    expect(evaluateCheckin(result.position, { lat: -22.88, lng: -42.02 }, 300, result.error).precisa_justificativa).toBe(false);
  });
  it("recovers the last recent position and retains the actual error", async () => {
    const { getPosition } = await import("@/lib/geolocation");
    const { geo } = fakeGeo(position(), 2, 3);
    await getPosition(geo);
    const result = await getPosition(geo);
    expect(result.cached).toBe(true);
    expect(result.error).toBe("TIMEOUT");
    expect(result.position?.lat).toBe(-22.88);
    expect(evaluateCheckin(result.position, { lat: -22.88, lng: -42.02 }, 300, result.error).precisa_justificativa).toBe(false);
  });
  it("never recovers a position older than 60 seconds", async () => {
    const { getPosition } = await import("@/lib/geolocation");
    const { geo } = fakeGeo(position(), 3, 3);
    await getPosition(geo);
    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now + 60001);
    expect((await getPosition(geo)).position).toBeNull();
    spy.mockRestore();
  });
  it("does not recover a previous position when permission is denied", async () => {
    const { getPosition } = await import("@/lib/geolocation");
    const { geo } = fakeGeo(position(), 1);
    await getPosition(geo);
    expect((await getPosition(geo)).position).toBeNull();
  });
  it("rejects invalid coordinates without declaring permission denied", async () => {
    const { getPosition } = await import("@/lib/geolocation");
    const bad = { ...position(), coords: { ...position().coords, latitude: 200 } } as GeolocationPosition;
    const result = await getPosition(fakeGeo(bad, bad).geo);
    expect(result.error).toBe("INVALID_POSITION");
    expect(result.position).toBeNull();
    expect(evaluateCheckin({ lat: 200, lng: 0 }, {}).sem_permissao).toBe(false);
  });
  it("unsupported geolocation is not denial", async () => {
    const { getPosition } = await import("@/lib/geolocation");
    const result = await getPosition(null as unknown as Geolocation);
    expect(result.error).toBe("UNSUPPORTED");
    expect(evaluateCheckin(null, {}, 300, result.error).sem_permissao).toBe(false);
  });
  it("a legacy missing position has unknown permission state", () => {
    expect(evaluateCheckin(null, {}).sem_permissao).toBe(false);
  });
  it("manager alerts include unavailable check-ins without flagging recovered GPS", () => {
    const visits = ["missing", "recovered"].map((id) => ({ id, assigned_to: "consultor", scheduled_date: "2026-11-04", start_time: "10:00", status: "em_atendimento" }));
    const m = fieldMetrics(visits, [
      { schedule_id: "missing", fora_do_raio: false, sem_permissao: false, latitude: null, geolocation_error: "TIMEOUT" },
      { schedule_id: "recovered", fora_do_raio: false, sem_permissao: false, latitude: -22.88, geolocation_error: "TIMEOUT" },
    ], new Date("2026-11-04T15:00:00Z"), "2026-11-04", "2026-11-02");
    expect(m.foraDoLocal).toEqual(["missing"]);
  });
});