import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  CONFIRMACAO_MAX_TENTATIVAS,
  confirmationFailedMessage,
  confirmationTimelineResumo,
  DEFAULT_FLORA_WA_CHANNEL_ID,
  normalizeBrazilPhone,
  resolveConfirmationTarget,
} from "../../supabase/functions/_shared/visit-exec.ts";

const mcpSource = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const confirmarSource = readFileSync("supabase/functions/confirmar-visitas/index.ts", "utf8");

function buildMcpHarness() {
  const db: Record<string, Array<Record<string, unknown>>> = {
    organizations: [{ id: "org-1", matriz_cidades: ["Rio de Janeiro"], flora_default_lead_owner: "owner-1" }],
    pessoas: [],
    leads: [],
    schedules: [],
    atendimentos: [],
    lead_timeline: [],
    flora_interactions: [],
    notification_logs: [],
    notification_recipients: [],
    mcp_request_log: [],
  };
  let seq = 1;

  function query(table: string) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let limitN: number | null = null;
    let op: "select" | "insert" | "update" = "select";
    let payload: Record<string, unknown> | null = null;

    const apply = () => {
      const rows = db[table] ?? (db[table] = []);
      if (op === "insert") {
        const rec = { id: `${table}-${seq++}`, created_at: new Date().toISOString(), ...payload };
        rows.push(rec);
        return [rec];
      }
      if (op === "update") {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        matched.forEach((r) => Object.assign(r, payload));
        return matched;
      }
      let res = rows.filter((r) => filters.every((f) => f(r)));
      if (limitN != null) res = res.slice(0, limitN);
      return res;
    };

    const q: any = {
      select: () => q,
      insert: (p: Record<string, unknown>) => { op = "insert"; payload = p; return q; },
      update: (p: Record<string, unknown>) => { op = "update"; payload = p; return q; },
      eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return q; },
      neq: (col: string, val: unknown) => { filters.push((r) => r[col] !== val); return q; },
      ilike: (col: string, val: string) => { filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase()); return q; },
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return q; },
      not: (col: string, opName: string, val: string) => {
        if (opName === "in") {
          const items = val.replace(/[()]/g, "").split(",").map((s) => s.trim());
          filters.push((r) => !items.includes(String(r[col] ?? "")));
        }
        return q;
      },
      is: (col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return q; },
      or: () => q,
      gte: () => q,
      lte: () => q,
      contains: () => q,
      order: () => q,
      limit: (n: number) => { limitN = n; return q; },
      single: async () => { const rows = apply(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "not found" } }; },
      maybeSingle: async () => { const rows = apply(); return { data: rows[0] ?? null, error: null }; },
      then: (resolve: (v: unknown) => void) => resolve({ data: apply(), error: null }),
    };
    return q;
  }

  const client = { from: (t: string) => query(t) };
  let handler: ((req: Request) => Promise<Response>) | null = null;
  const stripped = mcpSource
    .replace(/^import .*$/gm, "")
    .replace(/createClient\([^)]*\)/g, "__mockClient");
  const compiled = ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const ctx = vm.createContext({
    console, fetch: vi.fn(), URL, Request, Response, Headers, setTimeout, clearTimeout, performance,
    AbortSignal, crypto, TextEncoder, TextDecoder,
    Deno: {
      env: { get: (k: string) => ({ SUPABASE_URL: "https://x.test", SUPABASE_SERVICE_ROLE_KEY: "srv", NITSCLEAN_ORG_ID: "org-1", MCP_BEARER_TOKEN: "tok" }[k]) },
      serve: (fn: (req: Request) => Promise<Response>) => { handler = fn; },
    },
    EdgeRuntime: { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) },
    __mockClient: client,
  });
  vm.runInContext(compiled, ctx);

  const call = async (method: string, params: Record<string, unknown>) => {
    const req = new Request("https://mcp.test", {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const res = await handler!(req);
    const json = await res.json();
    return json.result;
  };
  return { db, call };
}

describe("E-mail-tampão e criar_lead no mesmo chat_id", () => {
  it("nunca grava agenda@nitscleandistribuidora.com.br (case-insensitive) em leads ou pessoas", async () => {
    const { db, call } = buildMcpHarness();
    const res = await call("criar_lead", {
      chat_id: "3E081F8C517E26FF46107A02E12740D2-ig-user-1",
      nome: "Marina Silva",
      empresa: "Café Mar",
      cidade: "Cabo Frio",
      email: "Agenda@NitsCleanDistribuidora.com.br",
    });
    expect(res.success).toBe(true);
    expect(db.leads).toHaveLength(1);
    expect(db.leads[0].contact_email).toBeNull();
    expect(db.pessoas[0].email ?? null).toBeNull();
  });

  it("criar_lead chamado uma 2ª vez no mesmo chat_id completa telefone (DDI 55), cargo e e-mail sem duplicar nem apagar dados", async () => {
    const { db, call } = buildMcpHarness();
    const chatId = "3E081F8C517E26FF46107A02E12740D2-ig-user-2";
    const r1 = await call("criar_lead", {
      chat_id: chatId,
      nome: "Carlos Souza",
      empresa: "Pousada Sol",
      cidade: "Búzios",
      email: "agenda@nitscleandistribuidora.com.br",
    });
    expect(r1.success).toBe(true);
    expect(db.leads).toHaveLength(1);
    expect(db.leads[0].contact_phone).toBeNull();
    expect(db.leads[0].contact_email).toBeNull();

    const r2 = await call("criar_lead", {
      chat_id: chatId,
      nome: "Carlos Souza",
      telefone: "(22) 99988-7766",
      cargo_contato: "Gerente",
      email: "carlos@pousadasol.com.br",
    });
    expect(r2.success).toBe(true);
    expect(r2.data.criado).toBe(false);
    expect(db.leads).toHaveLength(1);
    expect(db.leads[0].contact_phone).toBe("5522999887766");
    expect(db.leads[0].cargo_contato).toBe("Gerente");
    expect(db.leads[0].contact_email).toBe("carlos@pousadasol.com.br");
    // Preserva dados já existentes
    expect(db.leads[0].empresa_nome).toBe("Pousada Sol");
    expect(db.leads[0].city).toBe("Búzios");
  });
});

describe("Confirmação de visita: canal WhatsApp vs origem e aviso de falha", () => {
  it("lead de Instagram com telefone recebe confirmação no chat WhatsApp da Flora", () => {
    const target = resolveConfirmationTarget(
      {
        canal_origem: "INSTAGRAM",
        gptmaker_chat_id: "3E081F8C517E26FF46107A02E12740D2-ig-999",
        contact_phone: "(22) 98877-6655",
      },
      DEFAULT_FLORA_WA_CHANNEL_ID,
    );
    expect(target).toEqual({
      chatId: `${DEFAULT_FLORA_WA_CHANNEL_ID}-5522988776655`,
      canal: "whatsapp",
      viaWhatsappFallback: true,
    });
    expect(confirmationTimelineResumo("d1", target!.canal)).toContain("WhatsApp");
  });

  it("lead de Instagram sem telefone vai ao chat de origem", () => {
    const target = resolveConfirmationTarget(
      {
        canal_origem: "INSTAGRAM",
        gptmaker_chat_id: "3E081F8C517E26FF46107A02E12740D2-ig-888",
        contact_phone: null,
        pessoas: { telefone: null, whatsapp: null },
      },
      DEFAULT_FLORA_WA_CHANNEL_ID,
    );
    expect(target).toEqual({
      chatId: "3E081F8C517E26FF46107A02E12740D2-ig-888",
      canal: "instagram",
      viaWhatsappFallback: false,
    });
    expect(confirmationTimelineResumo("dia", target!.canal)).toContain("instagram");
  });

  it("normaliza telefone brasileiro para dígitos com DDI 55 e formata aviso de falha ao consultor", () => {
    expect(normalizeBrazilPhone("(22) 99988-7766")).toBe("5522999887766");
    expect(normalizeBrazilPhone("+55 22 99988-7766")).toBe("5522999887766");
    const msg = confirmationFailedMessage("Pousada Sol", "2026-11-27", "10:00");
    expect(msg).toBe("Não consegui confirmar a visita de Pousada Sol em 27/11 às 10h — confirme por telefone");
    expect(CONFIRMACAO_MAX_TENTATIVAS).toBeGreaterThan(0);
    expect(confirmarSource).toContain("confirmationFailedMessage");
    expect(confirmarSource).toContain('dedupeKey: "falha_confirmacao_schedule_id"');
  });
});