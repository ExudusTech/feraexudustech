import { describe, it, expect } from "vitest";
import { saveRoles, type RoleStore } from "../../supabase/functions/manage-user/set-roles";
import { userRoleError } from "@/lib/user-role-error";

function fixture(initial = ["consultor_tecnico"]) {
  let roles = [...initial];
  const backups: string[][] = [];
  const calls: string[] = [];
  const logs: string[] = [];
  const store: RoleStore = {
    read: async () => ({ roles: [...roles], error: null }),
    backup: async (old) => { calls.push("backup"); backups.push([...old]); return { error: null }; },
    add: async (added) => { calls.push("add"); roles = [...new Set([...roles, ...added])]; return { error: null }; },
    remove: async (removed) => { calls.push("remove"); roles = roles.filter((r) => !removed.includes(r)); return { error: null }; },
  };
  return { store, backups, calls, logs, log: (stage: string, code: string) => logs.push(`${stage}:${code}`), roles: () => roles };
}

describe("salvamento de vários perfis", () => {
  for (const caller of ["super_admin", "admin"]) {
    it(`${caller} salva vendedor + consultor técnico com backup anterior`, async () => {
      const f = fixture();
      const result = await saveRoles({ roles: ["vendedor", "consultor_tecnico"] }, [caller], f.store, f.log);
      expect(result.status).toBe(200);
      expect(f.roles()).toEqual(["consultor_tecnico", "vendedor"]);
      expect(f.backups).toEqual([["consultor_tecnico"]]);
      expect(f.calls).toEqual(["backup", "add"]);
    });
  }
  it("repetir o salvamento não duplica papéis nem backup", async () => {
    const f = fixture(["vendedor", "consultor_tecnico"]);
    expect((await saveRoles({ roles: ["vendedor", "consultor_tecnico", "vendedor"] }, ["super_admin"], f.store, f.log)).status).toBe(200);
    expect(f.calls).toEqual([]);
  });
  it("falha de backup impede qualquer alteração", async () => {
    const f = fixture();
    f.store.backup = async () => ({ error: { code: "42501" } });
    expect((await saveRoles({ roles: ["vendedor"] }, ["admin"], f.store, f.log)).status).toBe(500);
    expect(f.roles()).toEqual(["consultor_tecnico"]);
    expect(f.calls).toEqual([]);
    expect(f.logs).toEqual(["backup_roles:42501"]);
  });
  it("falha ao adicionar não remove o perfil anterior", async () => {
    const f = fixture();
    f.store.add = async () => ({ error: { code: "23505" } });
    expect((await saveRoles({ roles: ["vendedor"] }, ["admin"], f.store, f.log)).status).toBe(500);
    expect(f.roles()).toEqual(["consultor_tecnico"]);
    expect(f.logs).toEqual(["add_roles:23505"]);
  });
  it("admin não remove super_admin do usuário alvo", async () => {
    const f = fixture(["super_admin"]);
    expect((await saveRoles({ roles: ["vendedor"] }, ["admin"], f.store, f.log)).status).toBe(403);
    expect(f.calls).toEqual([]);
  });
  it("admin não concede super_admin", async () => {
    const f = fixture();
    expect((await saveRoles({ roles: ["super_admin"] }, ["admin"], f.store, f.log)).status).toBe(400);
    expect(f.calls).toEqual([]);
  });
  it("não confirma sucesso se o conjunto não persistiu", async () => {
    const f = fixture();
    f.store.add = async () => ({ error: null });
    expect((await saveRoles({ roles: ["consultor_tecnico", "vendedor"] }, ["super_admin"], f.store, f.log)).status).toBe(500);
    expect(f.logs).toEqual(["verify_roles:role_set_mismatch"]);
  });
});

describe("erros seguros da função", () => {
  it("extrai a recusa segura da resposta HTTP", async () => {
    expect(await userRoleError(null, { context: new Response(JSON.stringify({ error: "Permissão negada" }), { status: 403 }) })).toBe("Permissão negada");
  });
  it("não expõe erro interno do banco", async () => {
    expect(await userRoleError(null, { context: new Response(JSON.stringify({ error: "duplicate key value violates user_roles_user_id_role_key" }), { status: 500 }) })).not.toContain("user_roles");
  });
  it("sessão expirada orienta novo login", async () => {
    expect(await userRoleError(null, { context: new Response("{}", { status: 401 }) })).toBe("Sua sessão expirou. Entre novamente para salvar os perfis.");
  });
});