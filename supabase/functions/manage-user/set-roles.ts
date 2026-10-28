import { resolveRequestedRoles } from "../_shared/roles.ts";

type Result = { error: { code?: string } | null };
export interface RoleStore {
  read(): Promise<Result & { roles: string[] }>;
  backup(roles: string[]): Promise<Result>;
  add(roles: string[]): Promise<Result>;
  remove(roles: string[]): Promise<Result>;
}

export async function saveRoles(
  input: { roles?: unknown; role?: unknown },
  callerRoles: string[],
  store: RoleStore,
  log: (stage: string, code: string) => void,
): Promise<{ status: number; body: { error?: string; success?: boolean; roles?: string[] } }> {
  const roles = resolveRequestedRoles(input, callerRoles);
  if (!roles) return { status: 400, body: { error: "Selecione perfis válidos para sua permissão." } };
  const fail = (stage: string, error: { code?: string }) => {
    log(stage, error.code ?? "unknown");
    return { status: 500, body: { error: "Não foi possível salvar os perfis. Tente novamente; se persistir, informe o responsável pelo sistema." } };
  };
  const current = await store.read();
  if (current.error) return fail("read_roles", current.error);
  if (!callerRoles.includes("super_admin") && current.roles.includes("super_admin")) {
    return { status: 403, body: { error: "Somente um super administrador pode alterar os perfis de outro super administrador." } };
  }
  const toAdd = roles.filter((r) => !current.roles.includes(r));
  const toRemove = current.roles.filter((r) => !roles.includes(r));
  if (toAdd.length || toRemove.length) {
    if (current.roles.length) {
      const backup = await store.backup(current.roles);
      if (backup.error) return fail("backup_roles", backup.error);
    }
    // Insert idempotently before removing: a failed insert cannot erase existing access.
    if (toAdd.length) {
      const added = await store.add(toAdd);
      if (added.error) return fail("add_roles", added.error);
    }
    if (toRemove.length) {
      const removed = await store.remove(toRemove);
      if (removed.error) return fail("remove_roles", removed.error);
    }
  }
  const saved = await store.read();
  if (saved.error) return fail("verify_roles", saved.error);
  if (saved.roles.length !== roles.length || roles.some((r) => !saved.roles.includes(r))) {
    return fail("verify_roles", { code: "role_set_mismatch" });
  }
  return { status: 200, body: { success: true, roles } };
}