import { describe, expect, it } from "vitest";
import { homeRoute, legacyEkkoaTarget, mergePermissions, routeAllowed, routeWritable } from "@/lib/permissions";
const MENU = ["/dashboard", "/agenda", "/leads", "/clientes", "/propostas", "/produtos", "/comodatos", "/manutencoes", "/inventario", "/financeiro", "/relatorios", "/areas-cobertura", "/configuracoes"];
const visible = (roles: string[]) => MENU.filter((r) => routeAllowed(mergePermissions(roles), r));
describe("Menu by role", () => {
  it("gestor sees the full management menu", () => expect(visible(["gestor"])).toEqual(MENU));
  it("vendedor sees Agenda, Leads, Clientes, Propostas, Produtos", () =>
    expect(visible(["vendedor"])).toEqual(["/agenda", "/leads", "/clientes", "/propostas", "/produtos"]));
  it("consultor técnico sees Agenda, Comodatos, Manutenções, Inventário, Produtos", () =>
    expect(visible(["consultor_tecnico"])).toEqual(["/agenda", "/produtos", "/comodatos", "/manutencoes", "/inventario"]));
  it("consultor técnico cannot see billing or revenue", () => {
    const p = mergePermissions(["consultor_tecnico"]);
    expect(p.canAccessFinanceiro).toBe(false); expect(routeAllowed(p, "/financeiro")).toBe(false);
  });
  it("consultor técnico only consults Inventário and Produtos", () => {
    const p = mergePermissions(["consultor_tecnico"]);
    expect(routeWritable(p, "/inventario")).toBe(false); expect(routeWritable(p, "/produtos")).toBe(false);
    expect(routeWritable(p, "/comodatos")).toBe(true); expect(routeWritable(p, "/manutencoes")).toBe(true);
  });
  it("vendedor + consultor técnico sums both menus and keeps Produtos editable via vendedor", () => {
    const p = mergePermissions(["vendedor", "consultor_tecnico"]);
    expect(visible(["vendedor", "consultor_tecnico"])).toEqual(["/agenda", "/leads", "/clientes", "/propostas", "/produtos", "/comodatos", "/manutencoes", "/inventario"]);
    expect(routeWritable(p, "/produtos")).toBe(true); expect(routeWritable(p, "/inventario")).toBe(false);
    expect(p.canAccessFinanceiro).toBe(false);
  });
  it("nobody has the old Ekkoa menu", () => {
    for (const r of ["gestor", "vendedor", "consultor_tecnico", "operacional", "user", "financeiro"]) expect(routeAllowed(mergePermissions([r]), "/ekkoa")).toBe(false);
  });
  it("lands each profile on a screen it can open", () => {
    expect(homeRoute((r) => routeAllowed(mergePermissions(["gestor"]), r))).toBe("/dashboard");
    expect(homeRoute((r) => routeAllowed(mergePermissions(["vendedor"]), r))).toBe("/agenda");
    expect(homeRoute((r) => routeAllowed(mergePermissions(["consultor_tecnico"]), r))).toBe("/agenda");
  });
  it.each([["instalacoes", "/comodatos"], ["contratos", "/comodatos"], ["operacoes", "/manutencoes"], ["agendamentos", "/agenda"], ["faturamento", "/financeiro"], ["fragancias", "/produtos"], ["dashboard", "/dashboard"], [null, "/comodatos"]])
    ("old Ekkoa tab %s opens %s", (tab, target) => expect(legacyEkkoaTarget(tab)).toBe(target));
});
