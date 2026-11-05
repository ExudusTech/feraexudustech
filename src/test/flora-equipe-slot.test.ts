import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { primeiroSlotLivre, pendenciaAgendar } from "../../supabase/functions/_shared/agenda-slot";
import { temPendenciaColeta } from "@/lib/coleta";

// Rio das Ostras route: Tuesday/Thursday, band 08:00–12:00.
const base = { rota: [2, 4], inicio: "08:00", fim: "12:00", duracao: 60, ocupados: [], google: [], bloqueado: () => false };

describe("próximos agendamentos da coleta: primeiro horário livre", () => {
  it("spoken Monday moves to the first route day (Tuesday) at band start", () => {
    expect(primeiroSlotLivre({ ...base, from: "2026-11-09" })).toEqual({ data: "2026-11-10", hora: "08:00" });
  });
  it("skips times taken in the Fera agenda", () => {
    const ocupados = [{ data: "2026-11-10", inicio: "08:00", fim: "09:30" }];
    expect(primeiroSlotLivre({ ...base, from: "2026-11-10", ocupados })).toEqual({ data: "2026-11-10", hora: "09:30" });
  });
  it("skips Google busy events", () => {
    const google = [{ start: Date.parse("2026-11-10T08:00:00-03:00"), end: Date.parse("2026-11-10T12:00:00-03:00") }];
    expect(primeiroSlotLivre({ ...base, from: "2026-11-10", google })).toEqual({ data: "2026-11-12", hora: "08:00" });
  });
  it("skips holidays / Google all-day blocks", () => {
    expect(primeiroSlotLivre({ ...base, from: "2026-11-10", bloqueado: (d) => d === "2026-11-10" || d === "2026-11-12" }))
      .toEqual({ data: "2026-11-17", hora: "08:00" });
  });
  it("returns null when nothing is free (caller must not book)", () => {
    expect(primeiroSlotLivre({ ...base, from: "2026-11-10", bloqueado: () => true })).toBeNull();
    expect(primeiroSlotLivre({ ...base, from: "2026-11-10", inicio: "08:00", fim: "08:30" })).toBeNull();
  });
  it("no slot → pending task text with the occurrence code, shown on Hoje", () => {
    expect(pendenciaAgendar("proposta", "OC-000123")).toBe("Agendar proposta — #OC-000123");
    expect(temPendenciaColeta({ coleta_status: "confirmada", coleta_pendencias: ["Agendar proposta — #OC-000123"] })).toBe(true);
    expect(temPendenciaColeta({ coleta_status: "confirmada", coleta_pendencias: [] })).toBe(false);
  });
});

vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-03T14:00:00Z"));
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";

function harness() {
  const tables: Record<string, any[]> = {
    profiles: [{ user_id: "vend", name: "Marcos", phone: "5522999990001", organization_id: org, is_active: true }],
    user_roles: [{ user_id: "vend", role: "vendedor" }],
    schedules: [{ id: "s1", organization_id: org, title: "Visita Padaria", scheduled_date: "2026-11-03", start_time: "14:00:00", status: "agendado", assigned_to: "vend", ocorrencia_codigo: "OC-000007" }],
    leads: [], clients: [], holidays: [], atendimentos: [], tarefas_faturamento: [],
    organizations: [{ id: org, human_hours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }, human_timezone: "America/Sao_Paulo" }],
  };
  const writes: any[] = [];
  const client = { from(table: string) {
    let op = "read", value: any; const f: Array<(r: any) => boolean> = [];
    const rows = () => (tables[table] ?? []).filter((r) => f.every((fn) => fn(r)));
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain, is: () => chain, not: () => chain,
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; }, neq: (k: string, v: any) => { f.push((r) => r[k] !== v); return chain; },
      in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; }, or: () => chain,
      update: (v: any) => { op = "update"; value = v; return chain; }, insert: (v: any) => { op = "insert"; value = v; return chain; },
      maybeSingle: async () => { if (op !== "read") writes.push({ table, op, value }); return { data: rows()[0] ?? null, error: null }; },
      single: async () => { if (op !== "read") writes.push({ table, op, value }); return { data: op === "insert" ? { id: "new1" } : rows()[0] ?? null, error: null }; },
      then: (res: any) => { if (op !== "read") writes.push({ table, op, value }); return Promise.resolve({ data: rows(), error: null }).then(res); },
    };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch: vi.fn(), AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn() },
    Response, Request, URL, performance, TextEncoder, crypto, Date, Intl });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { writes, context, route: (method: string, params: any) => { context.method = method; context.params = params; return vm.runInContext("routeTool(method, params)", context); } };
}
const TEAM_CHAT = "3DF9D839DDCF463A3A350ADF91C40B89-5522999990001";
const CLIENT_CHAT = "3DF9D839DDCF463A3A350ADF91C40B89-5521988887777";

describe("mcp flora_equipe dispatcher", () => {
  it("unknown number → equipe:false and nothing runs", async () => {
    const h = harness();
    const r = await h.route("flora_equipe", { chat_id: CLIENT_CHAT, acao: "criar_lead", texto: "empresa: X; cidade: Búzios; contato: Ana" });
    expect(r.data.equipe).toBe(false);
    expect(r.data.mensagem_para_equipe).toMatch(/não está cadastrado/);
    expect(h.writes).toHaveLength(0);
  });
  it("ignores phone/name sent in params: identity is the chat_id phone", async () => {
    const r = await harness().route("flora_equipe", { chat_id: CLIENT_CHAT, acao: "minha_agenda", dados: { telefone: "5522999990001" } });
    expect(r.data.equipe).toBe(false);
  });
  it("minha_agenda routes to the team tool and returns a ready Portuguese message", async () => {
    const r = await harness().route("flora_equipe", { chat_id: TEAM_CHAT, acao: "minha_agenda" });
    expect(r.success).toBe(true);
    expect(r.data.equipe).toBe(true);
    expect(r.data.mensagem_para_equipe).toContain("14:00");
    expect(r.data.mensagem_para_equipe).toContain("#OC-000007");
  });
  it("criar_lead reads free fields from texto and creates the lead", async () => {
    const h = harness();
    const r = await h.route("flora_equipe", { chat_id: TEAM_CHAT, acao: "criar_lead", texto: "empresa: Pousada 7 Mares; cidade: Búzios; contato: Ana; telefone: 22999998888" });
    expect(r.data.mensagem_para_equipe).toMatch(/Pousada 7 Mares/);
    expect(h.writes.some((w) => w.table === "leads" && w.op === "insert")).toBe(true);
  });
  it("missing fields → asks only for what is missing, writes nothing", async () => {
    const h = harness();
    const r = await h.route("flora_equipe", { chat_id: TEAM_CHAT, acao: "criar_lead", dados: { nome: "Bar do Zé" } });
    expect(r.data.mensagem_para_equipe).toBe("Preciso de: cidade, nome do contato.");
    expect(h.writes).toHaveLength(0);
  });
  it("invalid acao lists nothing executed", async () => {
    const r = await harness().route("flora_equipe", { chat_id: TEAM_CHAT, acao: "apagar_tudo" });
    expect(r.success).toBe(false);
    expect(r.data.acoes).toContain("confirmar_coleta");
  });
  it("interprets coordinates, dates and times on the server", () => {
    const h = harness();
    h.context.t = "estou aqui -22.7469, -41.8817";
    expect(vm.runInContext("interpretarCamposEquipe(t, null)", h.context)).toMatchObject({ latitude: -22.7469, longitude: -41.8817 });
    h.context.t = "tipo: comercial; cliente: La Gare; 10/11 às 9h";
    expect(vm.runInContext("interpretarCamposEquipe(t, null)", h.context)).toMatchObject({ tipo: "visita_comercial", termo: "La Gare", data: "2026-11-10", horario: "09:00" });
  });
  it("individual team tools still work", async () => {
    const r = await harness().route("minha_agenda", { chat_id: TEAM_CHAT });
    expect(r.success).toBe(true);
    expect(r.data.visitas).toHaveLength(1);
  });
});
