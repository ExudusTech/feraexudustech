import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organizations";

export type AppRole = "super_admin" | "admin" | "gestor" | "vendedor" | "consultor_tecnico" | "operacional" | "user" | "visitante" | "financeiro";

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
    routes: ["/dashboard", "/ekkoa", "/clientes", "/leads", "/propostas", "/produtos", "/financeiro", "/relatorios", "/areas-cobertura", "/agenda", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: true,
    canAccessEkkoa: true,
    canAccessRelatorios: true,
    canAccessConfiguracoes: false,
  },
  vendedor: {
    routes: ["/dashboard", "/clientes", "/leads", "/propostas", "/produtos", "/ekkoa", "/agenda", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: true,
    canAccessRelatorios: false,
    canAccessConfiguracoes: false,
  },
  consultor_tecnico: {
    routes: ["/dashboard", "/ekkoa", "/agenda", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: true,
    canAccessRelatorios: false,
    canAccessConfiguracoes: false,
  },
  operacional: {
    routes: ["/dashboard", "/ekkoa", "/suporte"],
    canWrite: true,
    canDelete: false,
    canManageUsers: false,
    canAccessFinanceiro: false,
    canAccessEkkoa: true,
    canAccessRelatorios: false,
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
  vendedor: "Vendedor",
  consultor_tecnico: "Consultor Técnico",
  operacional: "Operacional",
  user: "Usuário",
  financeiro: "Financeiro",
  visitante: "Visitante",
};

export function usePermissions() {
  const { user } = useAuth();
  const { data: organization } = useOrganization();
  const role = (user?.role as AppRole) || "visitante";
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.visitante;

  const orgHasEkkoaAccess = organization?.has_ekkoa_access === true;
  const isSuperAdmin = role === "super_admin";

  const canAccessRoute = (path: string): boolean => {
    // Profile page is always accessible
    if (path === "/meu-perfil") return true;
    // Block Ekkoa routes if org doesn't have access
    if (path.startsWith("/ekkoa") && !orgHasEkkoaAccess) {
      return false;
    }
    if (path.startsWith("/areas-cobertura") && !orgHasEkkoaAccess) {
      return false;
    }
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
    isSuperAdmin,
    isFinanceiro: role === "financeiro",
    orgHasEkkoaAccess: orgHasEkkoaAccess || isSuperAdmin,
    roleLabel: getRoleLabel(role),
  };
}
