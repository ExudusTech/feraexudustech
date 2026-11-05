import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as helpers from "../../supabase/functions/_shared/visit-exec";
import * as base from "../../supabase/functions/_shared/base-instalada";
import * as prontidao from "../../supabase/functions/_shared/prontidao";
import * as coleta from "../../supabase/functions/_shared/coleta";

const id = "8261d0f0-4287-427e-b90b-52c705ed4b58";
async function execute(body: Record<string, unknown>) {
  const saved: Record<string, unknown>[] = [];
  const schedule = { id, organization_id: "org", status: "agendado", assigned_to: "consultant", client_id: "client", lead_id: null, latitude: -22.88, longitude: -42.02 };
  const from = (table: string) => {
    const result = { data: table === "schedules" ? schedule : table === "user_roles" ? [{ role: "vendedor" }] : table === "profiles" ? { name: "Consultor" } : { raio_checkin_m: 300 }, error: null };
    const chain: any = {
      select: () => chain, eq: () => chain, maybeSingle: async () => result,
      insert: async (row: Record<string, unknown>) => { if (table === "schedule_checkins") saved.push(row); return { error: null }; },
      update: () => chain,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  };
  const client = { from, auth: { getUser: async () => ({ data: { user: { id: "consultant" } } }) } };
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const source = readFileSync("supabase/functions/visita-acoes/index.ts", "utf8").replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];/g, "");
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  const deps = { ...helpers, ...base, ...prontidao, ...coleta, serviceLabel: () => "", geocodeClient: async () => null, geocodeLead: async () => null, geocodeSchedule: async () => null, createClient: () => client, teamAlert: async () => undefined, Deno: { env: { get: () => "test" }, serve: (fn: typeof handler) => { handler = fn; } } };
  new Function(...Object.keys(deps), js)(...Object.values(deps));
  if (!handler) throw new Error("Missing request handler");
  const response = await handler(new Request("http://localhost/checkin", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "checkin", ...body }) }));
  return { response, saved };
}

describe("check-in function persistence", () => {
  it.each(["PERMISSION_DENIED", "POSITION_UNAVAILABLE", "TIMEOUT"])("persists %s with truthful permission flag", async (error) => {
    const { response, saved } = await execute({ geolocation_error: error, justificativa: "GPS indisponível" });
    expect(response.status).toBe(200);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ latitude: null, longitude: null, geolocation_error: error, sem_permissao: error === "PERMISSION_DENIED" });
  });
  it("missing position without justification never inserts", async () => {
    const { response, saved } = await execute({ geolocation_error: "TIMEOUT" });
    expect(response.status).toBe(422);
    expect(saved).toHaveLength(0);
  });
  it("recovered position persists coordinates, accuracy and diagnostic without a reason", async () => {
    const { response, saved } = await execute({ lat: -22.88, lng: -42.02, precisao: 18, geolocation_error: "TIMEOUT" });
    expect(response.status).toBe(200);
    expect(saved[0]).toMatchObject({ latitude: -22.88, longitude: -42.02, precisao_m: 18, geolocation_error: "TIMEOUT", sem_permissao: false });
  });
  it("legacy sem_permissao never proves denial", async () => {
    const { saved } = await execute({ sem_permissao: true, justificativa: "Sem GPS" });
    expect(saved[0]).toMatchObject({ sem_permissao: false, geolocation_error: "UNKNOWN" });
  });
  it("rejects unrecognized diagnostic before writing", async () => {
    const { response, saved } = await execute({ geolocation_error: "arbitrary text", justificativa: "Sem GPS" });
    expect(response.status).toBe(400);
    expect(saved).toHaveLength(0);
  });
});