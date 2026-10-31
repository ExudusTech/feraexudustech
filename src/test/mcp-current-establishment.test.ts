import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const chat = "3DF9D839DDCF463A3A350ADF91C40B89-5521979047667";
const company = "Médico da dor - Dr. André Carmo";
const address = "R. Raul Veiga, 15 - Sl 304 - Centro, Cabo Frio";
const maps = "https://maps.google.com/?cid=1805549597522206352";
function harness(existingB = false) {
  const person = { id: "person", nome: "Paulo Henrique", whatsapp: "5521979047667", chat_ids: [chat] };
  const leads: any[] = [{ id: "A", pessoa_id: "person", empresa_nome: "Belisquê Restaurante", city: "Araruama", category: "Suma Grill D9", endereco: "Rua Belisquê", stage: "novo" }];
  if (existingB) leads.push({ id: "B", pessoa_id: "person", empresa_nome: company, city: "Cabo Frio", stage: "novo" });
  const writes: any[] = [], tasks: Promise<void>[] = [];
  const fetch = vi.fn(async () => new Response("{}"));
  const client = { from(table: string) {
    let operation = "read", value: any; const filters: any[] = [];
    const result = (single = false) => {
      let data: any = null;
      if (operation !== "read") writes.push({ table, operation, value });
      if (table === "pessoas") data = person;
      if (table === "mcp_request_log") data = { response: { result: { data: { candidatos: [
        { nome: company, cidade: "Cabo Frio", endereco: address, bairro: "Centro", cep: "28907090", maps_url: maps, regiao: "Cabo Frio", place_id: "clinic" },
        { nome: "Outra clínica", cidade: "Cabo Frio", endereco: "Rua errada" },
      ] } } } };
      if (table === "leads") {
        if (operation === "insert") { data = { id: "B", ...value }; leads.push(data); }
        else { const found = leads.filter(l => filters.every(([k, v]) => k === "organization_id" || l[k] === v)); data = single ? found[0] ?? null : found; }
      }
      if (table === "holidays" || table === "notification_logs") data = [];
      if (table === "ekkoa_coverage_areas") data = [{ dia_semana: "2ª feira", horario_inicio: "13:30", horario_fim: "16:30", consultant_user_id: "consultant" }];
      if (table === "schedules") data = { id: "schedule", ...value };
      if (table === "notification_recipients") data = [{ id: "recipient", nome: "Equipe", whatsapp: "5521999999999" }];
      return { data, error: null };
    };
    const chain: any = { select: () => chain, eq: (k: string, v: any) => { filters.push([k, v]); return chain; },
      contains: () => chain, gte: () => chain, lte: () => chain, order: () => chain, limit: () => chain, or: () => chain, in: () => chain, ilike: () => chain,
      insert: (v: any) => { operation = "insert"; value = v; return chain; }, update: (v: any) => { operation = "update"; value = v; return chain; },
      maybeSingle: async () => result(true), single: async () => result(true), then: (resolve: any) => Promise.resolve(result()).then(resolve) };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: (k: string) => ["GPTMAKER_API_TOKEN", "GPTMAKER_WHATSAPP_CHANNEL_ID"].includes(k) ? "mock" : undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: (t: Promise<void>) => tasks.push(t) }, fetch, AbortSignal, Response, Request, URL, performance, crypto, console, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { writes, leads, fetch, async route(method: string, params: any) {
    context.method = method; context.params = params;
    const result = await vm.runInContext("routeTool(method, params)", context); await Promise.all(tasks); return result;
  } };
}
const visit = { chat_id: chat, lead_id: "A", nome_contato: "PH", empresa: company, cidade: "Cabo Frio", produto_interesse: "Oxivir TB Pronto Uso", email: "ph@example.com", data_visita: "2026-11-09", horario: "14:00" };
describe("Current establishment integrity", () => {
  it("A then B with A ID books and notifies B, linked to the same person", async () => {
    const h = harness(); const result = await h.route("agendar_visita_tecnica", visit);
    expect(result.success).toBe(true); expect(result.data.lead_id).toBe("B");
    expect(h.writes.find(w => w.table === "leads" && w.operation === "insert").value).toMatchObject({ pessoa_id: "person", empresa_nome: company, endereco: address, city: "Cabo Frio", category: "Oxivir TB Pronto Uso", contact_email: "ph@example.com" });
    const schedule = h.writes.find(w => w.table === "schedules").value;
    expect(schedule).toMatchObject({ lead_id: "B", location: address, zip_code: "28907090" });
    expect(schedule.title).toBe(`Visita Comercial — ${company} — Cabo Frio [Oxivir TB Pronto Uso]`);
    const message = JSON.parse(h.fetch.mock.calls[0][1].body).message;
    expect(message).toContain(address); expect(message).toContain(maps); expect(message).toContain("Oxivir TB Pronto Uso"); expect(message).not.toContain("Belisquê"); expect(message).not.toContain("Araruama");
    expect(result.data.mensagem_para_lead).toContain("Oxivir TB Pronto Uso");
    expect(h.leads[0].empresa_nome).toBe("Belisquê Restaurante");
  });
  it("same establishment rebooking reuses its open lead", async () => {
    const h = harness(true); const result = await h.route("agendar_visita_tecnica", visit);
    expect(result.data.lead_id).toBe("B"); expect(h.writes.filter(w => w.table === "leads" && w.operation === "insert")).toHaveLength(0);
    const again = await h.route("agendar_visita_tecnica", { ...visit, lead_id: "B" });
    expect(again.data.lead_id).toBe("B"); expect(h.writes.filter(w => w.table === "leads" && w.operation === "insert")).toHaveLength(0);
  });
  it.each(["PH", "não informado"])("prefers Paulo Henrique over %s", async nome_contato => {
    const h = harness(); await h.route("agendar_visita_tecnica", { ...visit, nome_contato });
    expect(h.writes.find(w => w.table === "schedules").value.notes).toContain("Contato: Paulo Henrique");
    expect(JSON.parse(h.fetch.mock.calls[0][1].body).message).toContain("Paulo Henrique");
  });
  it("handoff with stale A ID resolves B and keeps transfer event", async () => {
    const h = harness(); const r = await h.route("solicitar_atendimento_humano", { ...visit, motivo: "Pedido de preço" });
    expect(r.data.lead_id).toBe("B"); expect(r.data.lead_criado).toBe(true);
    const log = h.writes.find(w => w.table === "notification_logs").value;
    expect(log.event_type).toBe("transferencia"); expect(log.payload.message).toContain(company); expect(log.payload.message).toContain("Paulo Henrique"); expect(log.payload.message).toContain("Oxivir TB Pronto Uso"); expect(log.payload.message).not.toContain("Suma Grill");
    expect(h.writes.find(w => w.table === "leads" && w.operation === "update").value.precisa_humano).toBe(true);
  });
  it("missing current product/address never falls back to stale A", async () => {
    const h = harness(); await h.route("agendar_visita_tecnica", { ...visit, chat_id: undefined, empresa: "Belisquê Restaurante", cidade: "Araruama", produto_interesse: undefined });
    const s = h.writes.find(w => w.table === "schedules").value;
    expect(s.title).not.toContain("Suma Grill"); expect(s.location).toBe("Araruama");
  });
});