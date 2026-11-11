import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { fotoPrincipal, fotoRefPath, listaFotosRef, normalizarFotosRef, trocarFotoRef } from "@/lib/fotos-referencia";
import { checkinBloqueadoMensagem, evaluateCheckin, posicaoWhatsapp, WA_LOCALIZACAO_MIN } from "../../supabase/functions/_shared/visit-exec";

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

describe("GPS: localização pelo WhatsApp libera o check-in", () => {
  const now = Date.parse("2026-11-11T14:00:00Z");
  const s = { wa_latitude: -22.9, wa_longitude: -42.0, wa_localizacao_em: "2026-11-11T13:50:00Z", wa_localizacao_por: "u1" };
  it("same consultant within 30 minutes stands in for the app GPS", () => {
    expect(WA_LOCALIZACAO_MIN).toBe(30);
    expect(posicaoWhatsapp(s, "u1", now)).toEqual({ lat: -22.9, lng: -42.0 });
  });
  it("another user, an old location or a missing one never counts", () => {
    expect(posicaoWhatsapp(s, "u2", now)).toBeNull();
    expect(posicaoWhatsapp({ ...s, wa_localizacao_em: "2026-11-11T13:29:00Z" }, "u1", now)).toBeNull();
    expect(posicaoWhatsapp({ ...s, wa_latitude: null }, "u1", now)).toBeNull();
    expect(posicaoWhatsapp({}, "u1", now)).toBeNull();
  });
  it("inside the radius it passes, outside it stays blocked", () => {
    const target = { lat: -22.9, lng: -42.0 };
    expect(evaluateCheckin(posicaoWhatsapp(s, "u1", now), target, 300).precisa_justificativa).toBe(false);
    expect(evaluateCheckin(posicaoWhatsapp({ ...s, wa_latitude: -22.95 }, "u1", now), target, 300).precisa_justificativa).toBe(true);
  });
  it("the app block without GPS tells the consultant to send the location on WhatsApp", () => {
    expect(checkinBloqueadoMensagem(null, "A visita de manutenção")).toContain("Sem GPS? Envie sua localização pelo WhatsApp da Flora");
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
      select: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain,
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
const base = (lat: number) => ({
  profiles: [{ user_id: "tec", name: "Paulo", phone: "5522999990003", organization_id: org, is_active: true }],
  user_roles: [{ user_id: "tec", role: "consultor_tecnico" }],
  organizations: [{ id: org, raio_checkin_m: 300 }],
  schedules: [{ id: "s-man", organization_id: org, assigned_to: "tec", status: "agendado", scheduled_date: "2026-11-11", start_time: "10:00:00", title: "Manutenção",
    latitude: lat, longitude: -42.0, clients: { name: "Hotel Mar" } }],
  schedule_checkins: [],
});

describe("mcp registrar_localizacao_checkin antes do check-in", () => {
  it("inside the radius: saves the WhatsApp location on today's visit and releases the app check-in", async () => {
    const h = harness(base(-22.9));
    const r = await h.route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.9005, longitude: -42.0 });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ checkin_liberado: true, dentro_do_raio: true, validade_minutos: 30 });
    expect(r.message).toContain("Check-in liberado");
    const w = h.writes.find((x) => x.table === "schedules");
    expect(w.ids).toEqual(["s-man"]);
    expect(w.value).toMatchObject({ wa_latitude: -22.9005, wa_longitude: -42.0, wa_localizacao_por: "tec" });
  });
  it("outside the radius: location saved but the check-in stays blocked", async () => {
    const h = harness(base(-22.0));
    const r = await h.route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.9, longitude: -42.0 });
    expect(r.data).toMatchObject({ checkin_liberado: false, dentro_do_raio: false });
    expect(r.message).toContain("só é liberado no local");
  });
  it("mcp uses the same 30-minute window as the app check-in", () => {
    expect(source).toContain(`const WA_LOCALIZACAO_MIN = ${WA_LOCALIZACAO_MIN};`);
  });
  it("no visit today: refuses", async () => {
    const t = base(-22.9); t.schedules[0].scheduled_date = "2026-11-12";
    const r = await harness(t).route("registrar_localizacao_checkin", { chat_id: chat, latitude: -22.9, longitude: -42.0 });
    expect(r.success).toBe(false);
  });
});
