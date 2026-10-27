import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const org = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";
const allEvents = ["agendamento", "transferencia", "lead_matriz"];
function harness(options: { fetch?: any; logFailure?: boolean; configured?: boolean; recipients?: any[]; lead?: any; recent?: boolean; places?: any[] } = {}) {
  const recipients = options.recipients ?? [
    { id: "all", nome: "PH", whatsapp: "5521995367752", organization_id: org, ativo: true, eventos: allEvents },
    { id: "handoff", nome: "Comercial", whatsapp: "5521999999999", organization_id: org, ativo: true, eventos: ["transferencia"] },
    { id: "inactive", nome: "Inactive", whatsapp: "5521999999999", organization_id: org, ativo: false, eventos: allEvents },
    { id: "foreign", nome: "Foreign", whatsapp: "5521999999999", organization_id: "other", ativo: true, eventos: allEvents },
  ];
  const writes: any[] = [], reads: any[] = [], tasks: Promise<void>[] = [];
  const fetchMock = options.fetch ?? vi.fn(async () => new Response("{}", { status: 200 }));
  const client = { from(table: string) {
    let operation = "read", value: any; const filters: any[] = [];
    const result = () => {
      if (operation !== "read") writes.push({ table, operation, value }); else reads.push({ table, filters });
      let data: any = null;
      if (table === "notification_recipients") data = recipients.filter(r => filters.every(([op, key, val]) => op === "contains" ? val.every((v: string) => r[key].includes(v)) : r[key] === val));
      if (table === "holidays") data = [];
      if (table === "ekkoa_coverage_areas") data = [{ dia_semana: "6ª feira", horario_inicio: "13:30", horario_fim: "16:30" }];
      if (table === "notification_logs" && operation === "read") data = options.recent ? [{ id: "old" }] : [];
      if (table === "pessoas") data = operation === "read" ? null : { id: "pessoa", nome: value?.nome ?? "Contato", ...value };
      if (table === "leads" && "lead" in options) data = operation === "read" ? options.lead : { id: "new-lead", ...value };
      else if (table === "leads") data = { id: "lead", contact_name: "Contato", empresa_nome: "Empresa", contact_phone: "5521988888888", endereco: "Rua A, 10", bairro: "Centro", city: "Cabo Frio", zip_code: "28900000", regiao: "Cabo Frio", maps_url: "https://maps.google.com/example", category: "Produto", pessoa: null };
      if (table === "schedules") data = { id: "schedule", ...value };
      return { data, error: options.logFailure && table === "notification_logs" ? { message: "failed" } : null };
    };
    const chain: any = { select: () => chain, eq: (key: string, val: any) => { filters.push(["eq", key, val]); return chain; },
      contains: (key: string, val: any) => { filters.push(["contains", key, val]); return chain; },
      or: () => chain, in: () => chain, order: () => chain, limit: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain,
      insert: (v: any) => { operation = "insert"; value = v; return chain; }, update: (v: any) => { operation = "update"; value = v; return chain; },
      upsert: (v: any) => { operation = "upsert"; value = v; return chain; }, single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: any) => Promise.resolve(result()).then(resolve) };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: (name: string) => options.configured === false ? undefined : name === "GPTMAKER_API_TOKEN" ? "mock-private-token" : name === "GPTMAKER_WHATSAPP_CHANNEL_ID" ? "channel" : undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: (task: Promise<void>) => tasks.push(task) }, fetch: fetchMock, AbortSignal: { timeout: () => undefined }, console: { warn: vi.fn(), error: vi.fn() }, Response, Request, URL, performance, TextEncoder, crypto, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { writes, reads, tasks, fetchMock,
    route: (method: string, params: any) => { context.method = method; context.params = params; return vm.runInContext("routeTool(method, params)", context); },
    queue: (event: string) => { context.event = event; vm.runInContext('queueTeamNotification(getClient(), event, {}, "lead")', context); },
    flush: async () => { await Promise.all(tasks); } };
}
const visit = { lead_id: "lead", nome_contato: "Contato", empresa: "Empresa", cidade: "Cabo Frio", data_visita: "2026-10-16", horario: "13:30", produto_interesse: "Produto" };
describe("MCP team WhatsApp notifications", () => {
  it.each(allEvents)("selects only active tenant recipients subscribed to %s", async event => {
    const h = harness(); h.queue(event); await h.flush();
    const logs = h.writes.filter(w => w.table === "notification_logs");
    expect(logs.map(w => w.value.recipient_id)).toEqual(event === "transferencia" ? ["all", "handoff"] : ["all"]);
    expect(logs.every(w => w.value.event_type === event && w.value.status === "SENT")).toBe(true);
  });
  it("sends a successful booking with the exact endpoint, body and direct schedule link", async () => {
    const h = harness(); const result = await h.route("agendar_visita_tecnica", visit); await h.flush();
    expect(result.success).toBe(true); expect(h.tasks).toHaveLength(1);
    const [url, request] = h.fetchMock.mock.calls[0];
    expect(url).toBe("https://api.gptmaker.ai/v2/channel/channel/start-conversation");
    expect(request.method).toBe("POST"); expect(request.headers.Authorization).toBe("Bearer mock-private-token");
    const body = JSON.parse(request.body); expect(body.phone).toBe("5521995367752");
    expect(body.message).toContain("Onde: Rua A, 10, Centro, Cabo Frio"); expect(body.message).toContain("sexta-feira, 16/10 às 13:30");
    expect(body.message).toContain("Mapa: https://maps.google.com/example");
    expect(body.message).toContain("https://fera.exudustech.com.br/agenda?agendamento=schedule");
    expect(JSON.stringify(h.writes)).not.toContain("mock-private-token");
  });
  it.each(["MATRIZ encaminhou", "Recebido da matriz", "Atendimento comercial"])("routes handoff reason %s", async motivo => {
    const h = harness(); const result = await h.route("solicitar_atendimento_humano", { lead_id: "lead", motivo }); await h.flush();
    expect(result.success).toBe(true);
    const log = h.writes.find(w => w.table === "notification_logs").value;
    expect(log.event_type).toBe(/matriz/i.test(motivo) ? "lead_matriz" : "transferencia");
    expect(log.payload.message).toContain(motivo); expect(log.payload.message).toContain("/leads?lead=lead");
  });
  it("registers outside coverage without any team notification", async () => {
    const h = harness(); expect((await h.route("registrar_fora_cobertura", { nome: "Contato", cidade: "Cidade fora" })).success).toBe(true); await h.flush();
    expect(h.writes.some(w => w.table === "leads")).toBe(true);
    expect(h.tasks).toHaveLength(0);
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.reads.some(r => r.table === "notification_recipients")).toBe(false);
    expect(h.writes.some(w => w.table === "notification_logs")).toBe(false);
  });
  it("does not dispatch rejected bookings", async () => {
    const h = harness(); expect((await h.route("agendar_visita_tecnica", { ...visit, horario: "10:00" })).success).toBe(false);
    expect(h.tasks).toHaveLength(0); expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it("returns before provider completes", async () => {
    let release: (response: Response) => void = () => {};
    const h = harness({ fetch: vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) });
    expect((await h.route("agendar_visita_tecnica", visit)).success).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0)); expect(h.fetchMock).toHaveBeenCalled();
    release(new Response("{}")); await h.flush();
  });
  it.each(["http", "network", "missing"])("logs %s failure without breaking tool", async failure => {
    const h = harness({ configured: failure !== "missing", fetch: vi.fn(async () => { if (failure === "network") throw new Error("provider secret echo"); return new Response("provider secret echo", { status: 403 }); }) });
    expect((await h.route("agendar_visita_tecnica", visit)).success).toBe(true); await h.flush();
    const log = h.writes.find(w => w.table === "notification_logs").value;
    expect(log.status).toBe("FAILED"); expect(JSON.stringify(log)).not.toContain("secret echo");
  });
  it("continues to next recipient when delivery logging fails", async () => {
    const h = harness({ logFailure: true }); h.queue("transferencia"); await h.flush(); expect(h.fetchMock).toHaveBeenCalledTimes(2);
  });
  const wa = "3DF9D839DDCF463A3A350ADF91C40B89-5522988887777";
  const sent = (h: any) => h.writes.filter((w: any) => w.table === "notification_logs").map((w: any) => w.value.payload.message);
  it("creates a visible lead when none exists and notifies with wa.me and exact link", async () => {
    const h = harness({ lead: null });
    const r = await h.route("solicitar_atendimento_humano", { chat_id: wa, nome_contato: "Ana", empresa: "não informado", cidade: "Búzios", produto_interesse: "Papel toalha", resumo: "Quer preço de papel toalha", motivo: "Pedido de preço" });
    await h.flush();
    expect(r.success).toBe(true); expect(r.data.lead_id).toBe("new-lead"); expect(r.data.lead_criado).toBe(true);
    expect(r.next_action_hint).toBeUndefined(); expect(JSON.stringify(r)).not.toContain("Informe ao cliente");
    const insert = h.writes.find((w: any) => w.table === "leads" && w.operation === "insert").value;
    expect(insert).toMatchObject({ stage: "novo", canal_origem: "WHATSAPP", contact_phone: "5522988887777", gptmaker_chat_id: wa, pessoa_id: "pessoa", company: null, city: "Búzios" });
    const msg = sent(h)[0];
    expect(msg).toContain("👤 Atendimento transferido pela Flora"); expect(msg).toContain("Cliente: Ana");
    expect(msg).toContain("WhatsApp: https://wa.me/5522988887777"); expect(msg).toContain("O que o cliente pediu: Quer preço de papel toalha");
    expect(msg).toContain("Urgência: media"); expect(msg).toContain("/leads?lead=new-lead");
  });
  it("reuses the chat lead and appends the note without overwriting description", async () => {
    const h = harness({ lead: { id: "old-lead", description: "Descrição original", canal_origem: "WHATSAPP" } });
    const r = await h.route("solicitar_atendimento_humano", { chat_id: wa, motivo: "Preço", resumo: "Quer tabela" });
    expect(r.data.lead_id).toBe("old-lead"); expect(r.data.lead_criado).toBe(false);
    const update = h.writes.find((w: any) => w.table === "leads" && w.operation === "update").value;
    expect(update.precisa_humano).toBe(true);
    expect(update.description.startsWith("Descrição original\n[")).toBe(true); expect(update.description).toContain("Resumo: Quer tabela");
  });
  it("does not notify again within 30 minutes unless urgency is alta", async () => {
    const h = harness({ lead: { id: "old-lead", description: "" }, recent: true });
    const r = await h.route("solicitar_atendimento_humano", { chat_id: wa, motivo: "Preço" }); await h.flush();
    expect(r.data.notificado).toBe(false); expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.writes.some((w: any) => w.table === "leads" && w.operation === "update")).toBe(true);
    const h2 = harness({ lead: { id: "old-lead", description: "" }, recent: true });
    const r2 = await h2.route("solicitar_atendimento_humano", { chat_id: wa, motivo: "Preço", urgencia: "alta" }); await h2.flush();
    expect(r2.data.notificado).toBe(true); expect(sent(h2)[0]).toContain("⏰ Cliente cobrando retorno");
  });
  it("shows Instagram handle instead of wa.me", async () => {
    const h = harness({ lead: { id: "ig-lead", description: "", instagram_handle: "padaria.lagos", canal_origem: "INSTAGRAM" } });
    await h.route("solicitar_atendimento_humano", { chat_id: "3E081F8C517E26FF46107A02E12740D2-998877", motivo: "Preço" }); await h.flush();
    const msg = sent(h)[0]; expect(msg).toContain("Instagram: @padaria.lagos"); expect(msg).not.toContain("wa.me");
  });
});
