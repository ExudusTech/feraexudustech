/** Role permission matrix and multi-role merging (pure, testable). */
export type AppRole = "super_admin" | "admin" | "gestor" | "vendedor" | "consultor_tecnico" | "operacional" | "user" | "visitante" | "financeiro";

export interface PermissionConfig {
  /** Routes the role can access */
  routes: string[];
  /** Whether the role can create/edit/delete records */
  canWrite: boolean;
  /** Whether the role can delete records */
  canDelete: boolean;
  /** Whether the role can manage users */
  canManageUsers: boolean;
  /** Whether the role can access financial data */
  canAccessFinanceiro: boolean;
  /** Whether the role can access Ekkoa module */
  canAccessEkkoa: boolean;
  /** Whether the role can access reports */
  canAccessRelatorios: boolean;
  /** Whether the role can access settings */
  canAccessConfiguracoes: boolean;
  /** Routes this role may only view (no create/edit/delete) */
  readOnlyRoutes?: string[];
}

export const ROLE_PERMISSIONS: Record<AppRole, PermissionConfig> = {
  super_admin: {
    routes: ["*"],
    canWrite: true,
    canDelete: true,
    canManageUsers: true,
    canAccessFinanceiro: true,
    canAccessEkkoa: true,
    canAccessRelatorios: true,
    canAccessConfiguracoes: true,
  },
  admin: {
    routes: ["*"],
    canWrite: true,
    canDelete: true,
    canManageUsers: true,
    canAccessFinanceiro: true,
    canAccessEkkoa: true,
    canAccessRelatorios: true,
    canAccessConfiguracoes: true,
  },
  gestor: {
    routes: ["/dashboard", "/agenda", "/leads", "/clientes", "/propostas", "/produtos", "/comodatos", "/manutencoes", "/inventario", "/equipamentos", "/financeiro", "/relatorios", "/areas-cobertura", "/configuracoes", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: true,
    canAccessEkkoa: true,
    canAccessRelatorios: true,
    canAccessConfiguracoes: true,
  },
  vendedor: {
    routes: ["/agenda", "/leads", "/clientes", "/propostas", "/produtos", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: true,
    canAccessRelatorios: false,
    canAccessConfiguracoes: false,
  },
  consultor_tecnico: {
    routes: ["/agenda", "/comodatos", "/manutencoes", "/inventario", "/produtos", "/suporte"],
    readOnlyRoutes: ["/inventario", "/produtos"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: true,
    canAccessRelatorios: false,
    canAccessConfiguracoes: false,
  },
  operacional: {
    routes: ["/dashboard", "/agenda", "/suporte", "/equipamentos", "/comodatos", "/inventario", "/manutencoes"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: true,
    canAccessRelatorios: false,
    canAccessConfiguracoes: false,
  },
  user: {
    routes: ["/agenda", "/leads", "/clientes", "/propostas", "/produtos", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: true,
    canAccessRelatorios: false,
    canAccessConfiguracoes: false,
  },
  financeiro: {
    routes: ["/dashboard", "/financeiro", "/clientes", "/propostas", "/relatorios", "/agenda", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: true,
    canAccessEkkoa: false,
    canAccessRelatorios: true,
    canAccessConfiguracoes: false,
  },
  visitante: {
    routes: ["/dashboard", "/suporte"],
    canWrite: false,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: false,
    canAccessRelatorios: false,
    canAccessConfiguracoes: false,
  },
};

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  gestor: "Gestor",
  vendedor: "Vendedor",
  consultor_tecnico: "Consultor Técnico",
  operacional: "Operacional",
  user: "Usuário",
  financeiro: "Financeiro",
  visitante: "Visitante",
};


/** Most-privileged first; used to pick the "primary" role for legacy single-role checks. */
export const ROLE_PRIORITY: AppRole[] = ["super_admin", "admin", "gestor", "financeiro", "vendedor", "consultor_tecnico", "operacional", "user", "visitante"];

export function sortRoles(roles: string[]): AppRole[] {
  const valid = Array.from(new Set(roles)).filter((r): r is AppRole => (ROLE_PRIORITY as string[]).includes(r));
  return valid.sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b));
}

export function pickPrimaryRole(roles: string[]): AppRole {
  return sortRoles(roles)[0] ?? "visitante";
}

/** Union of permissions of all roles: routes are summed, flags are true if any role grants them. */
export function mergePermissions(roles: string[]): PermissionConfig {
  const list = sortRoles(roles);
  const configs = (list.length ? list : ["visitante" as AppRole]).map((r) => ROLE_PERMISSIONS[r]);
  const routes = Array.from(new Set(configs.flatMap((c) => c.routes)));
  return {
    routes: routes.includes("*") ? ["*"] : routes,
    canWrite: configs.some((c) => c.canWrite),
    canDelete: configs.some((c) => c.canDelete),
    canManageUsers: configs.some((c) => c.canManageUsers),
    canAccessFinanceiro: configs.some((c) => c.canAccessFinanceiro),
    canAccessEkkoa: configs.some((c) => c.canAccessEkkoa),
    canAccessRelatorios: configs.some((c) => c.canAccessRelatorios),
    canAccessConfiguracoes: configs.some((c) => c.canAccessConfiguracoes),
    // A route is read-only only when every role that grants it marks it read-only.
    readOnlyRoutes: routes.includes("*") ? [] : routes.filter((r) =>
      configs.filter((c) => c.routes.includes(r)).every((c) => (c.readOnlyRoutes ?? []).includes(r))),
  };
}

const routeMatches = (route: string, path: string) => path === route || path.startsWith(`${route}/`) || path.startsWith(`${route}?`);

/** Whether the merged permissions allow opening a path. */
export function routeAllowed(perms: PermissionConfig, path: string): boolean {
  if (path === "/meu-perfil") return true;
  if (perms.routes.includes("*")) return true;
  return perms.routes.some((r) => routeMatches(r, path));
}

/** Whether the merged permissions allow creating/editing on a path. */
export function routeWritable(perms: PermissionConfig, path: string): boolean {
  return perms.canWrite && routeAllowed(perms, path) && !(perms.readOnlyRoutes ?? []).some((r) => routeMatches(r, path));
}

/** Modules hidden when the organization does not have the loan/installed-base module enabled. */
export const MODULE_ROUTES = ["/comodatos", "/manutencoes", "/areas-cobertura"];

/** First screen the user may open, used as landing page and when a route is denied. */
export const HOME_CANDIDATES = ["/dashboard", "/agenda", "/leads", "/comodatos", "/financeiro", "/suporte"];
export function homeRoute(allowed: (path: string) => boolean): string {
  return HOME_CANDIDATES.find((r) => allowed(r)) ?? "/meu-perfil";
}

/** Old Ekkoa tabs mapped to their new screens. */
export const LEGACY_EKKOA_TABS: Record<string, string> = {
  dashboard: "/dashboard", instalacoes: "/comodatos", contratos: "/comodatos", faturamento: "/financeiro",
  operacoes: "/manutencoes", agendamentos: "/agenda", fragancias: "/produtos", fragrancias: "/produtos",
};
export function legacyEkkoaTarget(tab: string | null): string {
  return (tab && LEGACY_EKKOA_TABS[tab]) || "/comodatos";
}
