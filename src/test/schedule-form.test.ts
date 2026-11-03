import { describe, it, expect } from "vitest";
import { requiresClient, targetAllowed, autoTitle, addMinutes, resolveAssignee, scheduleFieldsFromTarget, searchTargets, type ScheduleTarget } from "@/lib/schedule-form";
const cli: ScheduleTarget = { kind: "cliente", id: "c1", name: "Clínica Pró Vida", city: "Búzios", address: "Rua A", zip_code: "28950000", latitude: -22.7, longitude: -41.9 };
const lead: ScheduleTarget = { ...cli, kind: "lead", id: "l1", name: "Padaria" };
describe("schedule form rules", () => {
  it("maintenance, delivery and technical require a client", () => {
    for (const t of ["manutencao", "entrega", "visita_tecnica"]) { expect(requiresClient(t)).toBe(true); expect(targetAllowed(t, lead)).toBe(false); expect(targetAllowed(t, cli)).toBe(true); }
  });
  it("commercial accepts lead or client", () => { expect(targetAllowed("visita_comercial", lead)).toBe(true); expect(targetAllowed("visita_comercial", null)).toBe(false); });
  it("auto title", () => expect(autoTitle("manutencao", "Clínica Pró Vida")).toBe("Manutenção — Clínica Pró Vida"));
  it("end = start + duration", () => expect(addMinutes("09:30", 60)).toBe("10:30"));
  it("consultor always self-assigned; gestor may choose", () => {
    expect(resolveAssignee(["consultor_tecnico"], "me", "other")).toBe("me");
    expect(resolveAssignee(["gestor"], "me", "other")).toBe("other");
  });
  it("writes client_id or lead_id and coordinates", () => {
    expect(scheduleFieldsFromTarget(cli)).toMatchObject({ client_id: "c1", lead_id: null, latitude: -22.7 });
    expect(scheduleFieldsFromTarget(lead)).toMatchObject({ client_id: null, lead_id: "l1" });
  });
  it("search hides leads for maintenance", () => expect(searchTargets([cli, lead], "", "manutencao").map((x) => x.id)).toEqual(["c1"]));
});
