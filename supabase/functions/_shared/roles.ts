// Shared role rules for user-management functions (pure, unit-tested).
export const ASSIGNABLE_ROLES = ["admin", "gestor", "vendedor", "consultor_tecnico", "operacional", "user", "financeiro", "visitante"];

export function isManager(roles: string[]): boolean {
  return roles.includes("super_admin") || roles.includes("admin");
}

/**
 * Validates a requested set of roles. Accepts `roles` (array) or legacy `role` (string).
 * Only super_admin may grant super_admin. Returns null when the request is invalid.
 */
export function resolveRequestedRoles(input: { roles?: unknown; role?: unknown }, callerRoles: string[]): string[] | null {
  const raw = Array.isArray(input.roles) ? input.roles : typeof input.role === "string" ? [input.role] : [];
  const list = Array.from(new Set(raw.filter((r): r is string => typeof r === "string")));
  if (list.length === 0) return null;
  const allowed = callerRoles.includes("super_admin") ? [...ASSIGNABLE_ROLES, "super_admin"] : ASSIGNABLE_ROLES;
  if (list.some((r) => !allowed.includes(r))) return null;
  return list;
}
