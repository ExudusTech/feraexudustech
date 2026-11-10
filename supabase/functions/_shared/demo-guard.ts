// Demo scenario guard: real WhatsApp/e-mail must never go out for records of the demo scenario (Configurações → Dados de demonstração).
// Pure helpers + two thin database calls; errors count as "not demo" only for the lookup itself, never block real alerts.

// deno-lint-ignore no-explicit-any
type Admin = any;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Payload keys that point at a business record. */
export const DEMO_PAYLOAD_KEYS = ["schedule_id", "lead_id", "client_id", "tarefa_id", "atendimento_id", "comodato_id", "maintenance_id", "proposal_id", "pedido_id"];

/** Record ids referenced by a notification payload. */
export function idsDoPayload(payload: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  for (const k of DEMO_PAYLOAD_KEYS) { const v = payload?.[k]; if (typeof v === "string" && UUID.test(v)) out.push(v); }
  return out;
}

/** Every id of the demo scenario (all organizations) as a Set, for filtering lists in bulk jobs. */
export async function idsDemo(admin: Admin): Promise<Set<string>> {
  try {
    const { data, error } = await admin.rpc("demo_conjunto", { _org: null });
    if (error || !data) return new Set();
    const out = new Set<string>();
    for (const v of Object.values(data as Record<string, unknown>)) if (Array.isArray(v)) for (const id of v) out.add(String(id));
    return out;
  } catch { return new Set(); }
}

/** True when any id belongs to the demo scenario. */
export async function demoEnvolvido(admin: Admin, ids: Array<string | null | undefined>): Promise<boolean> {
  const list = ids.filter((v): v is string => typeof v === "string" && UUID.test(v));
  if (!list.length) return false;
  try {
    const { data, error } = await admin.rpc("demo_envolvido", { _ids: list });
    return !error && data === true;
  } catch { return false; }
}

/** Pure filter used by bulk jobs: keeps rows whose own id and linked ids are outside the demo set. */
export function semDemo<T extends Record<string, unknown>>(rows: T[] | null | undefined, demo: Set<string>, keys: string[] = ["id", "lead_id", "client_id", "schedule_id"]): T[] {
  if (!demo.size) return rows ?? [];
  return (rows ?? []).filter((r) => !keys.some((k) => typeof r[k] === "string" && demo.has(r[k] as string)));
}
