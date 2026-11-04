import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { allDayDates, blockCity, floraSplit, holidayBlocks, isPublicHoliday, listEvents } from "../../supabase/functions/_shared/google-calendar";

describe("Google Calendar — somente leitura", () => {
  it("nenhum código do Fera envia POST/PUT/PATCH/DELETE ao Google", () => {
    const shared = readFileSync("supabase/functions/_shared/google-calendar.ts", "utf8");
    const sync = readFileSync("supabase/functions/google-calendar-sync/index.ts", "utf8");
    const mcp = readFileSync("supabase/functions/mcp/index.ts", "utf8");
    const mcpGcal = mcp.slice(mcp.indexOf("const GCAL_BUSY_TTL_MS"), mcp.indexOf("function googleClash"));
    for (const src of [shared, mcpGcal]) expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    expect(sync).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    expect(mcpGcal).toMatch(/method:\s*"GET"/);
  });

  it("listEvents usa apenas GET e pagina", async () => {
    const calls: any[] = [];
    const fetchFn = vi.fn(async (url: string, init: any) => {
      calls.push(init.method);
      const page = calls.length === 1 ? { items: [{ id: "a" }], nextPageToken: "p2" } : { items: [{ id: "b" }] };
      return new Response(JSON.stringify(page), { status: 200 });
    });
    const items = await listEvents("primary", "2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z", { lovableKey: "k", connKey: "c" }, fetchFn as any);
    expect(items.map(i => i.id)).toEqual(["a", "b"]);
    expect(calls).toEqual(["GET", "GET"]);
  });
});

describe("Feriados no Brasil", () => {
  it("só 'Feriado' bloqueia; data comemorativa e ponto facultativo não", () => {
    expect(isPublicHoliday({ description: "Feriado" })).toBe(true);
    expect(isPublicHoliday({ description: "Data comemorativa\nPara ocultar..." })).toBe(false);
    expect(isPublicHoliday({ description: "Feriado facultativo" })).toBe(false);
    expect(isPublicHoliday({ description: "Ponto facultativo" })).toBe(false);
    const rows = holidayBlocks([
      { id: "1", summary: "Natal", description: "Feriado", start: { date: "2026-12-25" }, end: { date: "2026-12-26" } },
      { id: "2", summary: "Sábado de Carnaval", description: "Data comemorativa", start: { date: "2027-02-06" }, end: { date: "2027-02-07" } },
    ]);
    expect(rows).toEqual([{ date: "2026-12-25", name: "Natal", city: null, kind: "feriado", google_event_id: "1" }]);
  });
});

describe("Agenda principal da Flora", () => {
  it("dia inteiro bloqueia (fim exclusivo) e [Cidade: X] restringe à cidade", () => {
    expect(allDayDates({ start: { date: "2026-10-21" }, end: { date: "2026-10-24" } })).toEqual(["2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(blockCity({ summary: "Recesso [Cidade: Búzios]" })).toBe("Búzios");
    const { blocks, busy } = floraSplit([
      { id: "r", summary: "Recesso [Cidade: Búzios]", start: { date: "2026-11-09" }, end: { date: "2026-11-10" } },
      { id: "v", summary: "Visita", start: { dateTime: "2026-11-06T09:00:00-03:00" }, end: { dateTime: "2026-11-06T10:00:00-03:00" } },
      { id: "x", summary: "Cancelado", status: "cancelled", start: { dateTime: "2026-11-06T14:00:00-03:00" }, end: { dateTime: "2026-11-06T15:00:00-03:00" } },
      { id: "l", summary: "Livre", transparency: "transparent", start: { dateTime: "2026-11-06T16:00:00-03:00" }, end: { dateTime: "2026-11-06T17:00:00-03:00" } },
    ]);
    expect(blocks).toEqual([{ date: "2026-11-09", name: "Recesso", city: "Búzios", kind: "bloqueio", google_event_id: "r" }]);
    expect(busy).toEqual([{ google_event_id: "v", start_at: "2026-11-06T12:00:00.000Z", end_at: "2026-11-06T13:00:00.000Z" }]);
  });
});
