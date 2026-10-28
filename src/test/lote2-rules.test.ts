import { describe, it, expect } from "vitest";
import { mergePermissions, pickPrimaryRole } from "@/lib/permissions";
import { resolveRequestedRoles } from "../../supabase/functions/_shared/roles";
import { contrastRatio, readableForeground, isCustomBrand, buildBrandCss } from "@/lib/brand";
import { serviceKind, normalizePhoneBR } from "@/lib/service-kind";
import { validateLogoFile } from "@/components/settings/LogoUpload";

const can = (roles: string[], path: string) => {
  const p = mergePermissions(roles);
  return p.routes.includes("*") || p.routes.some((r) => path.startsWith(r));
};

describe("vários perfis: permissões somadas", () => {
  it("vendedor + consultor técnico abre leads, clientes e agenda", () => {
    expect(can(["vendedor", "consultor_tecnico"], "/leads")).toBe(true);
    expect(can(["vendedor", "consultor_tecnico"], "/clientes")).toBe(true);
    expect(can(["vendedor", "consultor_tecnico"], "/agenda")).toBe(true);
  });
  it("consultor técnico sozinho não abre leads", () => {
    expect(can(["consultor_tecnico"], "/leads")).toBe(false);
  });
  it("gestor + vendedor acessa configurações e relatórios", () => {
    const p = mergePermissions(["gestor", "vendedor"]);
    expect(p.canAccessConfiguracoes).toBe(true);
    expect(p.canAccessRelatorios).toBe(true);
  });
  it("papel principal é o mais privilegiado", () => {
    expect(pickPrimaryRole(["vendedor", "gestor"])).toBe("gestor");
    expect(pickPrimaryRole(["consultor_tecnico", "vendedor"])).toBe("vendedor");
    expect(pickPrimaryRole([])).toBe("visitante");
  });
});

describe("regras do servidor para perfis", () => {
  it("admin não concede super_admin", () => {
    expect(resolveRequestedRoles({ roles: ["vendedor", "super_admin"] }, ["admin"])).toBeNull();
  });
  it("super_admin pode conceder super_admin", () => {
    expect(resolveRequestedRoles({ roles: ["super_admin"] }, ["super_admin"])).toEqual(["super_admin"]);
  });
  it("aceita vários perfis e o formato antigo de um perfil", () => {
    expect(resolveRequestedRoles({ roles: ["vendedor", "consultor_tecnico"] }, ["admin"])).toEqual(["vendedor", "consultor_tecnico"]);
    expect(resolveRequestedRoles({ role: "gestor" }, ["admin"])).toEqual(["gestor"]);
  });
  it("recusa lista vazia ou perfil inexistente", () => {
    expect(resolveRequestedRoles({ roles: [] }, ["admin"])).toBeNull();
    expect(resolveRequestedRoles({ roles: ["dono"] }, ["admin"])).toBeNull();
  });
});

describe("marca por organização", () => {
  it("texto sobre as cores da NitsClean atinge contraste AA", () => {
    for (const c of ["#025159", "#91BF4B", "#5EB5BF", "#182859"]) {
      expect(contrastRatio(c, readableForeground(c))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("principal #025159 usa texto branco", () => {
    expect(readableForeground("#025159")).toBe("#ffffff");
  });
  it("cores padrão antigas não substituem a marca Exudus", () => {
    expect(isCustomBrand("#1B365D")).toBe(false);
    expect(isCustomBrand("#025159")).toBe(true);
    expect(isCustomBrand(null)).toBe(false);
  });
  it("gera variáveis para tema claro e escuro", () => {
    const css = buildBrandCss({ primary: "#025159", secondary: "#91BF4B", accent: "#5EB5BF" });
    expect(css).toContain(":root{--primary:");
    expect(css).toContain(".dark{--primary:");
  });
  it("logo aceita PNG/JPG/SVG até 2 MB", () => {
    expect(validateLogoFile({ type: "image/png", size: 2 * 1024 * 1024 })).toBeNull();
    expect(validateLogoFile({ type: "image/svg+xml", size: 1000 })).toBeNull();
    expect(validateLogoFile({ type: "image/png", size: 2 * 1024 * 1024 + 1 })).not.toBeNull();
    expect(validateLogoFile({ type: "image/gif", size: 1000 })).not.toBeNull();
  });
});

describe("agenda no celular", () => {
  it("tipo de serviço", () => {
    expect(serviceKind("visita_tecnica", "PROSPECCAO")).toBe("Visita comercial");
    expect(serviceKind("instalacao_teste", null)).toBe("Visita técnica");
    expect(serviceKind("pre_emissao_nf", null)).toBe("Entrega");
    expect(serviceKind("visita_tecnica", "MANUTENCAO")).toBe("Manutenção");
  });
  it("telefone para Ligar/WhatsApp", () => {
    expect(normalizePhoneBR("(21) 99536-7752")).toBe("5521995367752");
    expect(normalizePhoneBR("5521995367752")).toBe("5521995367752");
    expect(normalizePhoneBR("123")).toBeNull();
  });
});
