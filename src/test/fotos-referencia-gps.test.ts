import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { fotoPrincipal, fotoRefPath, listaFotosRef, normalizarFotosRef, trocarFotoRef } from "@/lib/fotos-referencia";
import { checkinBloqueadoMensagem } from "../../supabase/functions/_shared/visit-exec";

describe("fotos de referência do aparelho (até 3: Frente, Lado, Plaqueta)", () => {
  it("keeps only the three known slots", () => {
    expect(normalizarFotosRef({ frente: "o/a.jpg", lado: "o/b.jpg", plaqueta: "o/c.jpg", extra: "o/d.jpg", costas: 1 })).toEqual({ frente: "o/a.jpg", lado: "o/b.jpg", plaqueta: "o/c.jpg" });
    expect(normalizarFotosRef(null)).toEqual({});
    expect(normalizarFotosRef(["o/a.jpg"])).toEqual({});
  });
  it("thumbnail is front, then side, then nameplate, then the catalogue image", () => {
    expect(fotoPrincipal({ fotos_referencia: { lado: "L", frente: "F" }, image_url: "I" })).toBe("F");
    expect(fotoPrincipal({ fotos_referencia: { plaqueta: "P", lado: "L" } })).toBe("L");
    expect(fotoPrincipal({ fotos_referencia: {}, image_url: "I" })).toBe("I");
    expect(fotoPrincipal({ fotos_referencia: {} })).toBeNull();
  });
  it("replacing a photo returns the old file to delete; removing clears the slot", () => {
    expect(trocarFotoRef({ frente: "old" }, "frente", "new")).toEqual({ fotos: { frente: "new" }, remover: "old" });
    expect(trocarFotoRef({ frente: "a", lado: "b" }, "lado", null)).toEqual({ fotos: { frente: "a" }, remover: "b" });
    expect(trocarFotoRef({}, "plaqueta", "p")).toEqual({ fotos: { plaqueta: "p" }, remover: null });
  });
  it("files live under the organization folder of the product photos", () => {
    expect(fotoRefPath("org1", "prod1", "plaqueta", 5)).toBe("org1/referencia/prod1/plaqueta-5.jpg");
    expect(listaFotosRef({ plaqueta: "p", frente: "f" }).map((f) => f.label)).toEqual(["Frente", "Plaqueta/código"]);
  });
});

describe("GPS: mensagem de bloqueio", () => {
  it("off-site block names the distance; without location it points to Flora's WhatsApp", () => {
    expect(checkinBloqueadoMensagem(null, "A visita de manutenção")).toContain("WhatsApp da Flora");
    expect(checkinBloqueadoMensagem(312000, "A visita de manutenção")).toContain("312 km");
  });
});

vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T14:00:00Z"));
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
function harness(tables: Record<string, any[]>) {
  const writes: any[] = [];
  const client = { from(table: string) {
    let op = "read", value: any; const f: Array<(r: any) => boolean> = [];
    const rows = () => (tables[table] ?? []).filter((r) => f.every((fn) => fn(r)));
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain, contains: () => chain,
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; },
      in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; },
      update: (v: any) => { op = "update"; value = v; return chain; }, insert: (v: any) => { op = "insert"; value = v; return chain; },
      maybeSingle: async () => { if (op !== "read") writes.push({ table, op, value }); return { data: rows()[0] ?? null, error: null }; },
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any) => { if (op !== "read") writes.push({ table, op, value, ids: rows().map((r) => r.id) }); return Promise.resolve({ data: rows(), error: null }).then(res); },
    };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: () => undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: () => {} }, fetch: vi.fn(), AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    Response, Request, URL, performance, TextEncoder, crypto, Date, Intl });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { writes, route: (method: string, params: any) => { context.method = method; context.params = params; return vm.runInContext("routeTool(method, params)", context); } };
}
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const chat = "3DF9D839DDCF463A3A350ADF91C40B89-5522999990003";
const visita = (over: Record<string, unknown> = {}) => ({ id: "s-man", organization_id: org, assigned_to: "tec", status: "em_atendimento", aguardando_localizacao: true,
  schedule_type: "manutencao", ocorrencia_codigo: "OC-000010", checkin_em: "2026-11-11T13:00:00Z", title: "Manutenção", latitude: -22.9, longitude: -42.0,
  clients: { name: "Hotel Mar" }, ...over });
const base = (schedules: any[]) => ({
  profiles: [{ user_id: "tec", name: "Paulo", phone: "5522999990003", organization_id: org, is_active: true }],
  user_roles: [{ user_id: "tec", role: "consultor_tecnico" }],
  organizations: [{ id: org, raio_checkin_m: 300 }],
  schedules,
  schedule_checkins: [{ id: "ck", schedule_id: "s-man" }],
});
const escritas = (h: ReturnType<typeof harness>, table: string) => h.writes.filter((x) => x.table === table && x.op === "update");

describe("18/11: localização pelo WhatsApp vai para a visita aberta aguardando localização", () => {
  it("inside the radius: 'no local', clears the pending mark on that visit", async () => {
    const h = harness(base([visita()]));
    const r = await h.route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.9005, longitude: -42.0 });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ status_localizacao: "no_local", aguardando_localizacao: false, pode_encerrar: true, codigo: "#OC-000010" });
    expect(escritas(h, "schedules")[0]).toMatchObject({ value: { aguardando_localizacao: false }, ids: ["s-man"] });
    expect(escritas(h, "schedule_checkins")[0].value).toMatchObject({ latitude: -22.9005, fora_do_raio: false, localizacao_origem: "whatsapp" });
  });
  it("maintenance far away: 'fora do local' in km, stays blocked to close", async () => {
    const h = harness(base([visita()]));
    const r = await h.route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.0, longitude: -42.0 });
    expect(r.data).toMatchObject({ status_localizacao: "fora_do_local", fora_do_raio: true, aguardando_localizacao: true, pode_encerrar: false });
    expect(r.message).toMatch(/km do cliente — fora do local/);
    expect(r.message).toContain("só encerra no local");
    expect(escritas(h, "schedules")[0].value).toMatchObject({ aguardando_localizacao: true });
  });
  it("commercial visit far away: 'fora do local' but may close", async () => {
    const h = harness(base([visita({ schedule_type: "visita_comercial", ocorrencia_tipo: null })]));
    const r = await h.route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.0, longitude: -42.0 });
    expect(r.data).toMatchObject({ status_localizacao: "fora_do_local", aguardando_localizacao: false, pode_encerrar: true });
  });
  it("several waiting: the cited #OC wins, without one the most recent (and says which)", async () => {
    const dois = [visita({ id: "s-old", ocorrencia_codigo: "OC-000007", checkin_em: "2026-11-11T09:00:00Z", clients: { name: "Padaria Sol" } }), visita()];
    const h1 = harness(base(dois));
    const r1 = await h1.route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.9, longitude: -42.0, texto: "localização da OC 7" });
    expect(r1.data.codigo).toBe("#OC-000007");
    expect(escritas(h1, "schedules")[0].ids).toEqual(["s-old"]);
    const h2 = harness(base(dois));
    const r2 = await h2.route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.9, longitude: -42.0 });
    expect(r2.data.codigo).toBe("#OC-000010");
    expect(r2.message).toContain("usei a mais recente: #OC-000010 Hotel Mar");
  });
  it("never guesses by distance or time: visits not awaiting location are ignored", async () => {
    const h = harness(base([visita({ aguardando_localizacao: false }), visita({ id: "s-ag", status: "agendado" })]));
    const r = await h.route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.9, longitude: -42.0 });
    expect(r.success).toBe(false);
    expect(r.message).toContain("aguardando localização");
    expect(h.writes.filter((w) => w.op === "update")).toHaveLength(0);
  });
  it("the old 30-minute release is gone", () => {
    expect(source).not.toContain("WA_LOCALIZACAO_MIN");
    expect(source).not.toContain("wa_latitude");
  });
});
