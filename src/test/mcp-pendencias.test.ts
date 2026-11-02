import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { calcularMetricas, ordenarAgora } from "@/lib/atendimento-metrics";
import { normalizeHumanHours } from "@/lib/business-hours";

vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-03T14:00:00Z"));
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");

/** Table-driven mock: filters eq/in/or on in-memory rows so role scoping is really exercised. */
function harness(tables: Record<string, any[]>) {
  const writes: any[] = [];
  const client = { from(table: string) {
    let op = "read", value: any; const f: Array<(r: any) => boolean> = [];
    const rows = () => (tables[table] ?? []).filter((r) => f.every((fn) => fn(r)));
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain, upsert: (v: any) => { op = "upsert"; value = v; return chain; },
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; },
      neq: (k: string, v: any) => { f.push((r) => r[k] !== v); return chain; },
      in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; },
      or: (expr: string) => { const parts = expr.split(",").map((p) => p.split(".eq.")); f.push((r) => parts.some(([k, v]) => r[k] === v)); return chain; },
      update: (v: any) => { op = "update"; value = v; return chain; }, insert: (v: any) => { op = "insert"; value = v; return chain; },
      maybeSingle: async () => { if (op !== "read") writes.push({ table, op, value }); return { data: rows()[0] ?? null, error: null }; },
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any) => { if (op !== "read") writes.push({ table, op, value }); return Promise.resolve({ data: rows(), error: null }).then(res); },
    };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch: vi.fn(), AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn() },
    Response, Request, URL, performance, TextEncoder, crypto, Date, Intl });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { writes, route: (method: string, params: any) => { context.method = method; context.params = params; return vm.runInContext("routeTool(method, params)", context); } };
}

const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const tables = () => ({
  profiles: [
    { user_id: "vend", name: "Marcos", phone: "5522999990001", organization_id: org, is_active: true },
    { user_id: "gest", name: "Arilson", phone: "5522999990002", organization_id: org, is_active: true },
  ],
  user_roles: [{ user_id: "vend", role: "vendedor" }, { user_id: "gest", role: "gestor" }],
  atendimentos: [
    { id: "a1", organization_id: org, empresa: "Padaria", status: "aberto", urgencia: "media", relogio_inicia_em: "2026-11-03T13:00:00Z", responsavel_id: "vend", assumido_por: null },
    { id: "a2", organization_id: org, empresa: "Hotel", status: "aberto", urgencia: "alta", relogio_inicia_em: "2026-11-03T13:50:00Z", responsavel_id: "gest", assumido_por: null },
    { id: "a3", organization_id: org, empresa: "Antigo", status: "resolvido", urgencia: "media", relogio_inicia_em: "2026-11-01T13:00:00Z", responsavel_id: "vend", assumido_por: null },
  ],
  schedules: [
    { id: "s1", organization_id: org, title: "Visita Padaria", scheduled_date: "2026-11-03", start_time: "14:00:00", status: "agendado", assigned_to: "vend" },
    { id: "s2", organization_id: org, title: "Visita Hotel", scheduled_date: "2026-11-03", start_time: "10:00:00", status: "agendado", assigned_to: "gest" },
  ],
  organizations: [{ id: org, human_hours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }, human_timezone: "America/Sao_Paulo" }],
  holidays: [],
});

describe("mcp listar_pendencias (read-only)", () => {
  it("seller sees only own open atendimentos and visits", async () => {
    const r = await harness(tables()).route("listar_pendencias", { telefone: "22999990001" });
    expect(r.data.usuario).toEqual({ nome: "Marcos", visao: "propria" });
    expect(r.data.atendimentos.map((a: any) => a.empresa)).toEqual(["Padaria"]);
    expect(r.data.atendimentos[0]).toMatchObject({ espera_minutos_uteis: 60, gravidade: "amarelo", link: "https://fera.exudustech.com.br/atendimentos?id=a1" });
    expect(r.data.visitas_hoje.map((v: any) => v.titulo)).toEqual(["Visita Padaria"]);
    expect(JSON.stringify(r)).not.toContain("Hotel");
  });
  it("manager sees the organization", async () => {
    const r = await harness(tables()).route("listar_pendencias", { chat_id: "3DF9D839DDCF463A3A350ADF91C40B89-5522999990002" });
    expect(r.data.usuario.visao).toBe("organizacao");
    expect(r.data.atendimentos).toHaveLength(2);
    expect(r.data.visitas_hoje).toHaveLength(2);
  });
  it("unknown phone returns nothing", async () => {
    const r = await harness(tables()).route("listar_pendencias", { telefone: "21911112222" });
    expect(r.data).toEqual({ usuario: null, atendimentos: [], visitas_hoje: [] });
  });
});

describe("pipeline auto-move on booking", () => {
  it("booked visit moves the lead to the 'Visita agendada' stage", async () => {
    const t: any = tables();
    t.lead_stages = [{ id: "st-va", organization_id: org, chave: "visita_agendada", ativo: true }];
    t.ekkoa_coverage_areas = [{ dia_semana: "3ª feira", horario_inicio: "08:00", horario_fim: "17:00", city: "Cabo Frio", is_active: true, organization_id: org }];
    t.leads = [{ id: "lead", organization_id: org, empresa_nome: "Empresa", city: "Cabo Frio" }];
    const h = harness(t);
    await h.route("agendar_visita_tecnica", { lead_id: "lead", nome_contato: "Contato", empresa: "Empresa", cidade: "Cabo Frio", data_visita: "2026-11-10", horario: "09:00" });
    const upd = h.writes.find((w) => w.table === "leads" && w.op === "update" && w.value.stage === "agendado");
    expect(upd?.value.stage_id).toBe("st-va");
  });
});

describe("atendimento metrics in business minutes", () => {
  const svc = { config: normalizeHumanHours(undefined), closed: [], city: null, amarelo: 15, vermelho: 60 };
  const base = { lead_id: null, tipo: "transferencia", canal: "WHATSAPP", resultado: null, resolvido_em: null, aberto_em: "2026-11-03T12:00:00Z" };
  it("orders open items by severity then wait, and counts % assumed within 10 min", () => {
    const items = [
      { ...base, id: "green", status: "aberto", relogio_inicia_em: "2026-11-03T13:55:00Z", assumido_em: null },
      { ...base, id: "red", status: "aberto", relogio_inicia_em: "2026-11-03T12:00:00Z", assumido_em: null },
      { ...base, id: "fast", status: "resolvido", relogio_inicia_em: "2026-11-03T12:00:00Z", assumido_em: "2026-11-03T12:08:00Z", resolvido_em: "2026-11-03T12:30:00Z", resultado: "duvida_resolvida" },
      { ...base, id: "slow", status: "resolvido", relogio_inicia_em: "2026-11-03T12:00:00Z", assumido_em: "2026-11-03T12:40:00Z", resolvido_em: "2026-11-03T13:00:00Z", resultado: "perdido" },
    ];
    expect(ordenarAgora(items, svc).map((i) => i.id)).toEqual(["red", "green"]);
    const m = calcularMetricas(items, svc);
    expect(m.respondidosAte10Pct).toBe(25);
    expect(m.assumirMediano).toBe(24); // (8 + 40) / 2
    expect(m.resolverMedio).toBe(45); // (30 + 60) / 2
    expect(m.porResultado).toEqual({ duvida_resolvida: 1, perdido: 1 });
  });
  it("clock outside hours starts only at the next opening", () => {
    const sunday = { ...base, id: "x", status: "aberto", relogio_inicia_em: "2026-11-09T11:00:00Z", assumido_em: null };
    expect(calcularMetricas([sunday], svc, [], new Date("2026-11-09T11:10:00Z")).porGravidade).toEqual({ verde: 1 });
  });
});
