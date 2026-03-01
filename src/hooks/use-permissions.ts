import { useAuth } from "@/hooks/use-auth";

export type AppRole = "super_admin" | "admin" | "gestor" | "user" | "visitante" | "financeiro";

interface PermissionConfig {
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
}

const ROLE_PERMISSIONS: Record<AppRole, PermissionConfig> = {
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
    routes: ["/dashboard", "/ekkoa", "/clientes", "/leads", "/propostas", "/produtos", "/financeiro", "/relatorios", "/areas-cobertura", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: true,
    canAccessEkkoa: true,
    canAccessRelatorios: true,
    canAccessConfiguracoes: false,
  },
  user: {
    routes: ["/dashboard", "/clientes", "/leads", "/propostas", "/produtos", "/ekkoa", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: true,
    canAccessRelatorios: false,
    canAccessConfiguracoes: false,
  },
  financeiro: {
    routes: ["/dashboard", "/financeiro", "/clientes", "/propostas", "/relatorios", "/suporte"],
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

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  gestor: "Gestor",
  user: "Usuário",
  financeiro: "Financeiro",
  visitante: "Visitante",
};

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role as AppRole) || "visitante";
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.visitante;

  const canAccessRoute = (path: string): boolean => {
    if (permissions.routes.includes("*")) return true;
    return permissions.routes.some((r) => path.startsWith(r));
  };

  const getRoleLabel = (r?: string): string => {
    return ROLE_LABELS[(r as AppRole)] || r || "Desconhecido";
  };

  return {
    role,
    permissions,
    canAccessRoute,
    getRoleLabel,
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
    roleLabel: getRoleLabel(role),
  };
}
