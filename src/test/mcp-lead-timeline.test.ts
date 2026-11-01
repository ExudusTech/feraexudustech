import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");
const WA = "3DF9D839DDCF463A3A350ADF91C40B89-5521979047667";
const IG = "3E081F8C517E26FF46107A02E12740D2-ig998877";
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000, DAY = 86_400_000;

type Row = Record<string, any>;
function harness(seed: Record<string, Row[]> = {}, options: { timelineError?: boolean } = {}) {
  const db: Record<string, Row[]> = {
    pessoas: [{ id: "person", nome: "Paulo Henrique", whatsapp: "5521979047667", chat_ids: [WA] }],
    leads: [], lead_timeline: [], notification_logs: [], schedules: [], holidays: [], mcp_request_log: [],
    ekkoa_coverage_areas: [{ dia_semana: "2ª feira", horario_inicio: "13:30", horario_fim: "16:30", city: "Cabo Frio", is_active: true }],
    notification_recipients: [{ id: "r", nome: "Equipe", whatsapp: "5521999999999", ativo: true, eventos: ["agendamento_comercial", "transferencia"] }],
    products: [{ id: "p", name: "SUMA GRILL D9", brand: "DIVERSEY", disponibilidade: "estoque", is_active: true }],
    organizations: [{ flora_default_lead_owner: null }],
    ...seed,
  };
  const writes: Row[] = [], tasks: Promise<void>[] = [];
  const fetch = vi.fn(async () => new Response("{}"));
  let seq = 0;
  const client = { from(table: string) {
    let op = "read", value: any; const filters: Array<(r: Row) => boolean> = []; let limit = Infinity;
    const run = (single: boolean) => {
      const rows = db[table] ?? (db[table] = []);
      if (op === "insert") {
        writes.push({ table, op, value });
        if (table === "lead_timeline" && options.timelineError) return { data: null, error: { code: "XX" } };
        const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...value };
        if (table === "notification_logs") row.sent_at = row.sent_at ?? new Date().toISOString();
        rows.push(row); return { data: row, error: null };
      }
      const found = rows.filter(r => filters.every(f => f(r)));
      if (op === "update") { writes.push({ table, op, value, ids: found.map(r => r.id) }); found.forEach(r => Object.assign(r, value)); return { data: found[0] ?? null, error: null }; }
      const out = found.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const chain: any = {
      select: () => chain, order: (k: string, o?: any) => { (db[table] ?? []).sort((a, b) => o?.ascending === false ? String(b[k]).localeCompare(String(a[k])) : 0); return chain; },
      limit: (n: number) => { limit = n; return chain; }, or: () => chain, ilike: () => chain, neq: () => chain, lte: () => chain,
      eq: (k: string, v: any) => { if (k !== "organization_id") filters.push(r => r[k] === v); return chain; },
      in: (k: string, v: any[]) => { filters.push(r => v.includes(r[k])); return chain; },
      gte: (k: string, v: any) => { filters.push(r => r[k] == null || String(r[k]) >= String(v)); return chain; },
      contains: (k: string, v: any) => { filters.push(r => Array.isArray(r[k]) ? v.every((x: any) => r[k].includes(x)) : Object.entries(v).every(([kk, vv]) => r[k]?.[kk] === vv)); return chain; },
      insert: (v: any) => { op = "insert"; value = v; return chain; }, update: (v: any) => { op = "update"; value = v; return chain; },
      single: async () => run(true), maybeSingle: async () => run(true), then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return chain;
  } };
  const context = vm.createContext({ createClient: () => client, Deno: { env: { get: (k: string) => ["GPTMAKER_API_TOKEN", "GPTMAKER_WHATSAPP_CHANNEL_ID"].includes(k) ? "mock" : undefined }, serve: () => {} },
    EdgeRuntime: { waitUntil: (t: Promise<void>) => tasks.push(t) }, fetch, AbortSignal: { timeout: () => undefined }, Response, Request, URL, performance, crypto, console: { error: vi.fn(), warn: vi.fn(), log: vi.fn() }, Date });
  vm.runInContext(ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { db, writes, fetch, async route(method: string, params: Row) {
    context.method = method; context.params = params;
    const r = await vm.runInContext("routeTool(method, params)", context);
    await Promise.all(tasks); return r;
  } };
}

describe("lead timeline writes", () => {
  it("criar_lead records a masked, bounded summary on the new lead", async () => {
    const h = harness();
    const r = await h.route("criar_lead", { nome: "Paulo", chat_id: WA, telefone: "5521979047667", empresa: "Brisa", cidade: "Cabo Frio",
      interaction_id: "i1", produto_interesse: "papel toalha", canal: "WHATSAPP",
      resumo_conversa: `Quer cotação, e-mail pa@x.com, tel (21) 97904-7667. ${"x".repeat(700)}`, proximo_passo: "Enviar catálogo" });
    expect(r.success).toBe(true);
    const item = h.db.lead_timeline[0];
    expect(item).toMatchObject({ lead_id: r.data.lead.id, pessoa_id: "person", tipo: "criar_lead", canal: "WHATSAPP", proximo_passo: "Enviar catálogo" });
    expect(item.resumo.length).toBeLessThanOrEqual(500);
    expect(item.resumo).toContain("Novo lead — Brisa: papel toalha");
    expect(item.resumo).not.toContain("pa@x.com"); expect(item.resumo).not.toContain("97904");
  });
  it("placeholder summary keeps only the generated text", async () => {
    const h = harness({ leads: [{ id: "L", pessoa_id: "person", empresa_nome: "Brisa", stage: "novo" }] });
    await h.route("registrar_interacao", { lead_id: "L", tipo: "encerramento", notas: "Cliente vai pensar", resumo_conversa: "não informado" });
    expect(h.db.lead_timeline[0]).toMatchObject({ tipo: "encerramento", resumo: "Encerramento: Cliente vai pensar", pessoa_id: "person" });
  });
  it("atualizar_lead never writes summary fields into lead columns", async () => {
    const h = harness({ leads: [{ id: "L", pessoa_id: "person", contact_name: "Paulo", stage: "novo" }] });
    await h.route("atualizar_lead", { lead_id: "L", produto_interesse: "Oxivir", resumo_conversa: "Prefere galão 5L", proximo_passo: "Ligar sexta" });
    const update = h.writes.find(w => w.table === "leads" && w.op === "update")!.value;
    expect(update).not.toHaveProperty("resumo_conversa"); expect(update).not.toHaveProperty("proximo_passo");
    expect(h.db.lead_timeline[0].resumo).toContain("Prefere galão 5L");
  });
  it("timeline failure never changes the tool response", async () => {
    const h = harness({ leads: [{ id: "L", pessoa_id: "person", stage: "novo" }] }, { timelineError: true });
    const r = await h.route("registrar_interacao", { lead_id: "L", tipo: "resumo", notas: "ok" });
    expect(r.success).toBe(true); expect(r.data).toMatchObject({ registrado: true, lead_id: "L" });
  });
  it("booking writes an agendamento item on the current company's lead, never the old company", async () => {
    const h = harness({ leads: [{ id: "A", pessoa_id: "person", empresa_nome: "Belisquê", city: "Araruama", stage: "novo" }] });
    const r = await h.route("agendar_visita_tecnica", { chat_id: WA, lead_id: "A", nome_contato: "Paulo", empresa: "Clínica Dor", cidade: "Cabo Frio",
      produto_interesse: "Oxivir", data_visita: "2026-11-09", horario: "14:00", resumo_conversa: "Clínica com 3 salas" });
    expect(r.success).toBe(true);
    const item = h.db.lead_timeline.find(i => i.tipo === "agendamento")!;
    expect(item.lead_id).toBe(r.data.lead_id); expect(item.lead_id).not.toBe("A");
    expect(item.resumo).toBe("Visita comercial 09/11 14:00, Oxivir. Clínica com 3 salas");
    expect(item.referencia_id).toBe(r.data.agendamento_id);
  });
});

describe("handoff follow-up limit (15 min per lead)", () => {
  const base = { leads: [{ id: "L", pessoa_id: "person", empresa_nome: "Brisa", city: "Cabo Frio", stage: "novo", gptmaker_chat_id: WA, canal_origem: "WHATSAPP" }] };
  const call = { chat_id: WA, empresa: "Brisa", cidade: "Cabo Frio", motivo: "Preço", urgencia: "alta" };
  it("first transfer notifies normally", async () => {
    const h = harness(structuredClone(base)); const r = await h.route("solicitar_atendimento_humano", call);
    expect(r.data.notificado).toBe(true);
    expect(h.db.lead_timeline[0]).toMatchObject({ tipo: "transferencia", lead_id: "L" });
    expect(h.db.lead_timeline[0].resumo).toContain("Transferido p/ equipe (urgência alta)");
  });
  it("a follow-up within 15 minutes does not notify but is recorded", async () => {
    const h = harness({ ...structuredClone(base), notification_logs: [{ id: "n", event_type: "transferencia", payload: { lead_id: "L" }, sent_at: ago(5 * MIN) }] });
    const r = await h.route("solicitar_atendimento_humano", call);
    expect(r.data.notificado).toBe(false); expect(h.fetch).not.toHaveBeenCalled();
    expect(h.db.lead_timeline[0].resumo).toContain("Cliente cobrou novamente");
  });
  it("a follow-up after 15 minutes notifies once as 'cobrando retorno'", async () => {
    const h = harness({ ...structuredClone(base), notification_logs: [{ id: "n", event_type: "transferencia", payload: { lead_id: "L" }, sent_at: ago(20 * MIN) }] });
    const r = await h.route("solicitar_atendimento_humano", call);
    expect(r.data.notificado).toBe(true);
    expect(JSON.parse((h.fetch.mock.calls[0] as any)[1].body).message).toContain("⏰ Cliente cobrando retorno");
  });
  it("transfer no longer writes into lead description", async () => {
    const h = harness({ leads: [{ ...base.leads[0], description: "Original" }] });
    await h.route("solicitar_atendimento_humano", call);
    expect(h.db.leads[0].description).toBe("Original");
  });
});

describe("registrar_fora_cobertura company/city isolation", () => {
  const viareggio = { id: "32c8a6af", pessoa_id: "person", empresa_nome: "Hotel Viareggio", city: "Niterói", stage: "novo", gptmaker_chat_id: WA, created_at: ago(MIN) };
  it("never reuses another company's lead; creates its own SEM_COBERTURA lead", async () => {
    const h = harness({ leads: [{ ...viareggio }] });
    const r = await h.route("registrar_fora_cobertura", { chat_id: WA, nome: "Paulo", cidade: "Vitória", estado: "ES", telefone: "5521979047667" });
    expect(r.success).toBe(true); expect(r.data.lead_id).not.toBe("32c8a6af");
    expect(h.db.leads.find(l => l.id === "32c8a6af")).toMatchObject({ empresa_nome: "Hotel Viareggio", city: "Niterói" });
    const created = h.db.leads.find(l => l.id === r.data.lead_id)!;
    expect(created).toMatchObject({ pessoa_id: "person", city: "Vitória", vinculo: "SEM_COBERTURA", fora_cobertura: true });
    expect(created.description).toContain("Vitória — ES");
    expect(h.db.lead_timeline[0]).toMatchObject({ tipo: "fora_perfil", lead_id: r.data.lead_id });
  });
  it("reuses the same outside-coverage city lead for the same person", async () => {
    const h = harness({ leads: [{ ...viareggio }, { id: "vit", pessoa_id: "person", city: "Vitória", fora_cobertura: true, stage: "fechado_perdido" }] });
    const r = await h.route("registrar_fora_cobertura", { chat_id: WA, cidade: "Vitória", estado: "ES", telefone: "5521979047667" });
    expect(r.data.lead_id).toBe("vit"); expect(h.writes.some(w => w.table === "leads" && w.op === "insert")).toBe(false);
  });
  it("with a company, reuses only that company's lead", async () => {
    const h = harness({ leads: [{ ...viareggio }, { id: "vh", pessoa_id: "person", empresa_nome: "Vitória Hotel", city: "Vitória", stage: "novo" }] });
    const r = await h.route("registrar_fora_cobertura", { chat_id: WA, empresa: "Vitória Hotel", cidade: "Vitória", telefone: "5521979047667" });
    expect(r.data.lead_id).toBe("vh");
  });
});

describe("contexto_anterior", () => {
  const leads = [{ id: "B", empresa_nome: "Restaurante Brisa" }, { id: "S", empresa_nome: "Smart Fit São Pedro" }, { id: "X", empresa_nome: "Outra Pessoa SA" }];
  const timeline = [
    { lead_id: "B", pessoa_id: "person", canal: "WHATSAPP", tipo: "transferencia", resumo: "papel toalha, transferido p/ equipe (urgência alta)", created_at: ago(3 * MIN) },
    { lead_id: "S", pessoa_id: "person", canal: "WHATSAPP", tipo: "agendamento", resumo: "visita 04/11 10h, dispenser MOD Interfoliado", proximo_passo: "levar amostra", created_at: ago(2 * MIN) },
    { lead_id: "S", pessoa_id: "person", canal: "WHATSAPP", tipo: "resumo", resumo: "pediu catálogo", created_at: ago(1 * MIN) },
    { lead_id: "B", pessoa_id: "person", canal: "WHATSAPP", tipo: "resumo", resumo: "item antigo demais", created_at: ago(5 * MIN) },
    { lead_id: "B", pessoa_id: "person", canal: "WHATSAPP", tipo: "resumo", resumo: "fora da janela", created_at: ago(91 * DAY) },
    { lead_id: "X", pessoa_id: "other", canal: "WHATSAPP", tipo: "resumo", resumo: "segredo de outra pessoa", created_at: ago(0) },
  ];
  it("consultar_produto returns the 3 latest items of this person, ≤400 chars", async () => {
    const h = harness({ leads: structuredClone(leads), lead_timeline: structuredClone(timeline) });
    const r = await h.route("consultar_produto", { termo: "Suma Grill D9", chat_id: WA });
    const ctx: string = r.data.contexto_anterior;
    expect(r.data.contato_conhecido).toEqual({ nome: "Paulo Henrique" });
    expect(ctx.length).toBeLessThanOrEqual(400);
    expect(ctx).toContain("WhatsApp — Smart Fit São Pedro: pediu catálogo.");
    expect(ctx).toContain("dispenser MOD Interfoliado, próximo passo: levar amostra.");
    expect(ctx).toContain("Restaurante Brisa: papel toalha");
    expect(ctx).not.toContain("item antigo demais"); expect(ctx).not.toContain("fora da janela"); expect(ctx).not.toContain("segredo");
  });
  it("unknown phone returns null", async () => {
    const h = harness({ leads: structuredClone(leads), lead_timeline: structuredClone(timeline) });
    const r = await h.route("localizar_estabelecimento", { nome: "x", chat_id: "3DF9D839DDCF463A3A350ADF91C40B89-5521900000000" });
    expect(r.data.contexto_anterior).toBeNull(); expect(r.data.contato_conhecido).toBeNull();
  });
  it("Instagram identifies the person by instagram_user_id", async () => {
    const h = harness({ pessoas: [{ id: "igp", nome: "Ana", instagram_user_id: "ig998877" }], leads: structuredClone(leads),
      lead_timeline: [{ lead_id: "B", pessoa_id: "igp", canal: "INSTAGRAM", tipo: "resumo", resumo: "quer amostra", created_at: ago(MIN) }] });
    const r = await h.route("consultar_produto", { termo: "Suma Grill D9", chat_id: IG });
    expect(r.data.contexto_anterior).toMatch(/Instagram — Restaurante Brisa: quer amostra\.$/);
  });
  it("long history is cut at a whole item within 400 chars", async () => {
    const long = Array.from({ length: 3 }, (_, i) => ({ lead_id: "B", pessoa_id: "person", canal: "WHATSAPP", tipo: "resumo", resumo: `${i} ${"palavra ".repeat(30)}`, created_at: ago(i * MIN) }));
    const h = harness({ leads: structuredClone(leads), lead_timeline: long });
    const r = await h.route("consultar_produto", { termo: "Suma Grill D9", chat_id: WA });
    expect(r.data.contexto_anterior.length).toBeLessThanOrEqual(400); expect(r.data.contexto_anterior.endsWith(".")).toBe(true);
  });
});
