import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organizations";
import { MODULE_ROUTES, ROLE_LABELS, homeRoute, mergePermissions, pickPrimaryRole, routeAllowed, routeWritable, sortRoles, type AppRole } from "@/lib/permissions";

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
    if (path === "/meu-perfil") return true;
    // Loan/installed-base module (comodatos, OS, coverage) is enabled per organization
    if (!isSuperAdmin && !orgHasEkkoaAccess && MODULE_ROUTES.some((r) => path.startsWith(r))) return false;
    return routeAllowed(permissions, path);
  };
  const canWriteRoute = (path: string): boolean => canAccessRoute(path) && routeWritable(permissions, path);

  const getRoleLabel = (r?: string): string => {
    return ROLE_LABELS[(r as AppRole)] || r || "Desconhecido";
  };

  return {
    role,
    roles,
    hasRole,
    permissions,
    canAccessRoute,
    canWriteRoute,
    homeRoute: homeRoute(canAccessRoute),
    getRoleLabel,
    isAdmin: hasRole("admin") || isSuperAdmin,
    isSuperAdmin,
    isFinanceiro: hasRole("financeiro"),
    orgHasEkkoaAccess: orgHasEkkoaAccess || isSuperAdmin,
    roleLabel: roles.map((r) => getRoleLabel(r)).join(" + "),
  };
}
