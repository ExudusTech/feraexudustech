import { describe, expect, it, beforeAll } from "vitest";
import { teamAlert } from "../../supabase/functions/_shared/team-alert.ts";

// teamAlert reads Deno.env inside sendWhatsapp; without a token it logs FAILED but still records the log row.
beforeAll(() => {
  (globalThis as Record<string, unknown>).Deno = { env: { get: () => undefined } };
});

const ORG = "org-1";
const U_DESLIGADO = "11111111-1111-4111-8111-111111111111";
const U_SEM_REGISTRO = "22222222-2222-4222-8222-222222222222";

function makeAdmin(inativos: string[]) {
  const logs: Array<{ destination: string | null; recipient_name: string; event_type: string }> = [];
  const admin = {
    from(table: string) {
      if (table === "notification_recipients") {
        return {
          select: () => ({
            eq() { return this; },
            contains: async () => ({ data: [] }), // nenhum assinante ativo do evento
            in: async (_col: string, ids: string[]) => ({ data: inativos.filter((u) => ids.includes(u)).map((u) => ({ user_id: u })) }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq() { return this; },
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((u) => ({ user_id: u, name: `Pessoa ${u.slice(0, 1)}`, phone: `552290000${u.slice(0, 4)}`, is_active: true })),
            }),
          }),
        };
      }
      if (table === "notification_logs") {
        return { insert: async (row: Record<string, unknown>) => { logs.push(row as never); return { error: null }; } };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
  return { admin, logs };
}

describe("teamAlert extraUserIds respeita o liga/desliga", () => {
  it("não envia nem enfileira para usuário com destinatário ativo=false", async () => {
    const { admin, logs } = makeAdmin([U_DESLIGADO]);
    await teamAlert(admin, ORG, "manutencao_do_dia", "msg", {}, { immediate: true, extraUserIds: [U_DESLIGADO] });
    expect(logs).toHaveLength(0);
  });

  it("usuário sem nenhum registro continua recebendo", async () => {
    const { admin, logs } = makeAdmin([]);
    await teamAlert(admin, ORG, "visita_aberta", "msg", {}, { immediate: true, extraUserIds: [U_SEM_REGISTRO] });
    expect(logs).toHaveLength(1);
    expect(logs[0].destination).toBe(`552290000${U_SEM_REGISTRO.slice(0, 4)}`);
  });

  it("na mesma chamada, desligado é pulado e sem registro recebe", async () => {
    const { admin, logs } = makeAdmin([U_DESLIGADO]);
    await teamAlert(admin, ORG, "visita_sem_confirmacao", "msg", {}, { immediate: true, extraUserIds: [U_DESLIGADO, U_SEM_REGISTRO] });
    expect(logs).toHaveLength(1);
    expect(logs[0].destination).toBe(`552290000${U_SEM_REGISTRO.slice(0, 4)}`);
  });
});
