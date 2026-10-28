import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organizations";
import { ROLE_LABELS, mergePermissions, pickPrimaryRole, sortRoles, type AppRole } from "@/lib/permissions";

export type { AppRole } from "@/lib/permissions";

export function usePermissions() {
  const { user } = useAuth();
  const { data: organization } = useOrganization();
  const roles = sortRoles(user?.roles?.length ? user.roles : [user?.role || "visitante"]);
  const role = pickPrimaryRole(roles);
  const permissions = mergePermissions(roles);
  const hasRole = (r: AppRole) => roles.includes(r);
  const orgHasEkkoaAccess = organization?.has_ekkoa_access === true;
  const isSuperAdmin = hasRole("super_admin");

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
    roles,
    hasRole,
    permissions,
    canAccessRoute,
    getRoleLabel,
    isAdmin: hasRole("admin") || isSuperAdmin,
    isSuperAdmin,
    isFinanceiro: hasRole("financeiro"),
    orgHasEkkoaAccess: orgHasEkkoaAccess || isSuperAdmin,
    roleLabel: roles.map((r) => getRoleLabel(r)).join(" + "),
  };
}
