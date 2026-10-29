import { describe, expect, it } from "vitest";
import { scheduleEvent, scheduleMessage } from "../../supabase/functions/_shared/schedule-notify";
import { serviceKind } from "@/lib/service-kind";
import { readFileSync } from "node:fs";

describe("lote 4 — tipos de agendamento", () => {
  it("visita técnica interna dispara só agendamento_tecnico", () => {
    for (const t of ["instalacao_teste", "manutencao", "retirada", "visita_tecnica"]) expect(scheduleEvent(t, null, "manual")).toBe("agendamento_tecnico");
  });
  it("visita comercial interna dispara agendamento_comercial", () => {
    expect(scheduleEvent("visita_comercial", "PROSPECCAO", "manual")).toBe("agendamento_comercial");
  });
  it("entrega e Flora não disparam aviso interno", () => {
    expect(scheduleEvent("pre_emissao_nf", null, "manual")).toBeNull();
    expect(scheduleEvent("entrega", null, "manual")).toBeNull();
    expect(scheduleEvent("visita_comercial", "PROSPECCAO", "flora")).toBeNull();
  });
  it("mensagem técnica traz link da agenda e tipo de serviço", () => {
    const m = scheduleMessage("agendamento_tecnico", { id: "x", scheduled_date: "2026-11-03", start_time: "09:00:00", location: "Rua A, Cabo Frio", schedule_type: "manutencao", client_name: "Clínica", link_path: "/agenda?agendamento=x" });
    expect(m).toContain("Tipo de serviço: Manutenção");
    expect(m).toContain("/agenda?agendamento=x");
    expect(m).toContain("Mapa: https://www.google.com/maps");
  });
  it("Agenda diferencia os 4 tipos", () => {
    expect(serviceKind("visita_comercial", "PROSPECCAO")).toBe("Visita comercial");
    expect(serviceKind("visita_tecnica", null)).toBe("Visita técnica");
    expect(serviceKind("entrega", null)).toBe("Entrega");
    expect(serviceKind("manutencao", null)).toBe("Manutenção");
  });
  it("Flora grava visita comercial com evento comercial", () => {
    const src = readFileSync("supabase/functions/mcp/index.ts", "utf8");
    expect(src).toContain('schedule_type: "visita_comercial"');
    expect(src).toContain('queueTeamNotification(supabase, "agendamento_comercial"');
    expect(src).toContain("📅 Nova visita comercial agendada pela Flora");
    expect(src).toContain("Sua visita comercial está confirmada");
  });
  it("migração troca agendamento pelos dois eventos", () => {
    const sql = readFileSync("drizzle/migrations/0016_split_schedule_events.sql", "utf8");
    expect(sql).toContain("array_remove(eventos,'agendamento') || ARRAY['agendamento_comercial','agendamento_tecnico']");
  });
});
