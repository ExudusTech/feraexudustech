import { saveRoles, type RoleStore } from "./set-roles.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

for (const caller of ["super_admin", "admin"]) {
  Deno.test(`${caller} saves vendedor + consultor_tecnico after backup`, async () => {
    let roles = ["consultor_tecnico"];
    let backedUp = false;
    const store: RoleStore = {
      read: async () => ({ error: null, roles }),
      backup: async (old) => { backedUp = old.join() === "consultor_tecnico"; return { error: null }; },
      add: async (added) => { assert(backedUp, "Backup must precede writes"); roles = [...new Set([...roles, ...added])]; return { error: null }; },
      remove: async (removed) => { roles = roles.filter((r) => !removed.includes(r)); return { error: null }; },
    };
    const result = await saveRoles({ roles: ["vendedor", "consultor_tecnico"] }, [caller], store, () => {});
    assert(result.status === 200, "Both roles should save");
    assert(roles.length === 2 && roles.includes("vendedor") && roles.includes("consultor_tecnico"), "Both roles should persist");
  });
}

Deno.test("admin cannot grant super_admin", async () => {
  const forbidden = async () => { throw new Error("Must not access storage"); };
  const result = await saveRoles({ roles: ["super_admin"] }, ["admin"], { read: forbidden, backup: forbidden, add: forbidden, remove: forbidden }, () => {});
  assert(result.status === 400, "Admin cannot grant super_admin");
});