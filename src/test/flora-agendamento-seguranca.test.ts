import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { isVisitaComercialDeLead, PORTE_INFO } from "@/components/agenda/OcorrenciaCores";

const source = readFileSync("supabase/functions/mcp/index.ts", "utf8");

function buildHarness(initial?: {
  offeredLogs?: Array<Record<string, unknown>>;
  leads?: Array<Record<string, unknown>>;
  products?: Array<Record<string, unknown>>;
}) {
  const db: Record<string, Array<Record<string, unknown>>> = {
    ekkoa_coverage_areas: [
      { id: "area-cf", organization_id: "org-1", name: "Cabo Frio", city: "Cabo Frio", dia_semana: "Segunda-feira, Sexta-feira", horario_inicio: "08:00", horario_fim: "17:00", is_active: true, consultant_user_id: "cons-1" },
    ],
    holidays: [],
    google_calendar_busy: [],
    organizations: [{ id: "org-1", matriz_cidades: ["Rio de Janeiro"], flora_default_lead_owner: "owner-1" }],
    lead_stages: [{ id: "st-agendado", organization_id: "org-1", name: "Visita agendada", chave: "visita_agendada", ordem: 2 }],
    pessoas: [],
    leads: initial?.leads ? [...initial.leads] : [],
    schedules: [],
    atendimentos: [],
    lead_timeline: [],
    flora_interactions: [],
    notification_logs: [],
    notification_recipients: [],
    mcp_request_log: initial?.offeredLogs ? [...initial.offeredLogs] : [],
    products: initial?.products ? [...initial.products] : [
      { id: "p1", organization_id: "org-1", is_active: true, disponibilidade: "estoque", name: "Suma Break Up D3.5", brand: "DIVERSEY", category: "Desengordurante", fornecedor: "DIVERSEY", unit: "GL", description: "Cozinha", price: "89.90", specifications: { segmentos: ["Hotelaria", "Cozinhas"] } },
      { id: "p2", organization_id: "org-1", is_active: true, disponibilidade: "estoque", name: "Clax Personril", brand: "DIVERSEY", category: "Lavanderia", fornecedor: "DIVERSEY", unit: "GL", description: "Roupas", price: "120.00", specifications: { segmentos: ["Hotelaria", "Lavanderias"] } },
      { id: "p3", organization_id: "org-1", is_active: true, disponibilidade: "estoque", name: "Taski Jontec", brand: "DIVERSEY", category: "Pisos", fornecedor: "DIVERSEY", unit: "GL", description: "Pisos", price: "75.00", specifications: { segmentos: ["Hotelaria"] } },
    ],
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
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
      not: (k: string, _op: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
      or: () => q,
      in: (k: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[k])); return q; },
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return q; },
      gte: () => q,
      lte: () => q,
      order: () => q,
      limit: (n: number) => { limitN = n; return q; },
      contains: (k: string, obj: Record<string, unknown>) => {
        filters.push((r) => {
          const val = r[k] as Record<string, unknown> | undefined;
          if (!val || typeof val !== "object") return false;
          return Object.entries(obj).every(([ok, ov]) => val[ok] === ov);
        });
        return q;
      },
      maybeSingle: () => { const rows = apply(); return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      single: () => { const rows = apply(); return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve({ data: apply(), error: null }).then(res, rej),
    };
    return q;
  }

  const supabase = {
    from: (t: string) => query(t),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
  };
  const stripped = source
    .replace(/^import .*$/gm, "")
    .replace(/Deno\.serve\([\s\S]*$/m, "")
    .replace(/function getClient\([\s\S]*?\n\}/, "function getClient() { return __supabase; }");
  const js = ts.transpileModule(
    `${stripped}\nmodule.exports = { solicitarAtendimentoHumano, verificarCoberturaRegiao, consultarRotaConsultor, agendarVisitaTecnica, consultarProduto };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const mod = { exports: {} as any };
  const envMap: Record<string, string> = { NITSCLEAN_ORG_ID: "org-1" };
  vm.runInNewContext(js, {
    module: mod, exports: mod.exports, __supabase: supabase,
    Deno: { env: { get: (k: string) => envMap[k] } },
    EdgeRuntime: { waitUntil: (p: Promise<unknown>) => { void p; } },
    fetch: vi.fn(), console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, URL, URLSearchParams, Set, Map, RegExp, Array, Object, String, Number, Boolean, Error, Promise,
  });
  return { ...mod.exports, db };
}

describe("Ajustes de agendamento da Flora e porte na Agenda", () => {
  it("1) transferência recusada por ser agendamento cria lead + atendimento de alta gravidade", async () => {
    const h = buildHarness();
    const res = await h.solicitarAtendimentoHumano({
      chat_id: "whatsapp-5521999990001",
      empresa: "Porto Brew",
      nome_contato: "Ana",
      cidade: "Cabo Frio",
      motivo: "agendamento de visita presencial confirmado",
      resumo: "Cliente escolheu 30/11 às 11h",
    });
    expect(res.success).toBe(false);
    expect(res.data.acao_correta).toBe("agendar");
    expect(res.data.mensagem_para_lead).toContain("Vou confirmar seu horário");
    expect(res.next_action_hint).toContain("NÃO diga ao cliente que a visita está confirmada");
    expect(h.db.leads.length).toBe(1);
    expect(h.db.leads[0].empresa_nome).toBe("Porto Brew");
    expect(h.db.atendimentos.length).toBe(1);
    expect(h.db.atendimentos[0].urgencia).toBe("alta");
    expect(h.db.atendimentos[0].motivo).toBe("Agendamento não concluído pela Flora — confirmar com o cliente");
  });

  it("2) verificar_cobertura com empresa cria lead Novo e agendar_visita_tecnica reaproveita o mesmo lead", async () => {
    const offeredDate = "2026-11-30"; // segunda-feira
    const h = buildHarness({
      offeredLogs: [{
        method: "consultar_rota_consultor",
        success: true,
        params: { chat_id: "whatsapp-5521970108321" },
        response: { result: { data: { opcoes_horario: [{ data: offeredDate, hora: "10:00", texto: "Segunda 30/11 às 10h" }] } } },
      }],
    });
    const cov = await h.verificarCoberturaRegiao({
      cidade: "Cabo Frio",
      chat_id: "whatsapp-5521970108321",
      empresa: "Grupo Mykonos",
      nome_contato: "Carlos",
      porte_indicio: "bom_porte",
    });
    expect(cov.success).toBe(true);
    expect(h.db.leads.length).toBe(1);
    expect(h.db.leads[0].stage).toBe("novo");
    expect(h.db.leads[0].created_by_flora).toBe(true);
    expect(h.db.leads[0].porte_indicio).toBe("bom_porte");
    const earlyLeadId = h.db.leads[0].id;

    const booked = await h.agendarVisitaTecnica({
      chat_id: "whatsapp-5521970108321",
      nome_contato: "Carlos",
      empresa: "Grupo Mykonos",
      cidade: "Cabo Frio",
      data_visita: offeredDate,
      horario: "10:00",
    });
    expect(booked.success).toBe(true);
    expect(h.db.leads.length).toBe(1);
    expect(booked.data.lead_id).toBe(earlyLeadId);
  });

  it("3) agendar com horário não oferecido é recusado com as opções e instrução de não confirmar", async () => {
    const h = buildHarness();
    const res = await h.agendarVisitaTecnica({
      chat_id: "whatsapp-5521977011240",
      nome_contato: "Maria",
      empresa: "Ikitus",
      cidade: "Cabo Frio",
      data_visita: "2026-11-30",
      horario: "13:30",
    });
    expect(res.success).toBe(false);
    expect(res.next_action_hint).toContain("Ofereça antes as opções de consultar_rota_consultor e deixe o cliente escolher");
    expect(res.next_action_hint).toContain("NÃO diga ao cliente que a visita está confirmada");
    expect(res.data.mensagem_para_lead).toBe("Vou confirmar seu horário e já te retorno");
    expect(Array.isArray(res.data.opcoes_horario)).toBe(true);
    expect(h.db.schedules.length).toBe(0);
  });

  it("4) agendar com opção oferecida e sem e-mail grava e devolve confirmação sem prometer convite", async () => {
    const offeredDate = "2026-11-30";
    const h = buildHarness({
      offeredLogs: [{
        method: "consultar_rota_consultor",
        success: true,
        params: { chat_id: "whatsapp-5521988887777" },
        response: { result: { data: { opcoes_horario: [{ data: offeredDate, hora: "11:00" }] } } },
      }],
    });
    const res = await h.agendarVisitaTecnica({
      chat_id: "whatsapp-5521988887777",
      nome_contato: "João",
      empresa: "Padaria Central",
      cidade: "Cabo Frio",
      data_visita: offeredDate,
      horario: "11:00",
    });
    expect(res.success).toBe(true);
    expect(h.db.schedules.length).toBe(1);
    expect(res.data.mensagem_para_lead).toContain("confirmada");
    expect(res.data.mensagem_para_lead).toContain("11:00");
    expect(res.data.mensagem_para_lead).toContain("Cabo Frio");
    expect(res.data.mensagem_para_lead.toLowerCase()).not.toContain("convite");
  });

  it("5) indicador de porte aparece para visita comercial de lead com rótulos corretos", () => {
    expect(isVisitaComercialDeLead({ lead_id: "l1", schedule_type: "visita_comercial" })).toBe(true);
    expect(isVisitaComercialDeLead({ lead_id: null, schedule_type: "visita_comercial" })).toBe(false);
    expect(isVisitaComercialDeLead({ lead_id: "l1", schedule_type: "manutencao" })).toBe(false);
    expect(PORTE_INFO.bom_porte.label).toBe("Bom porte");
    expect(PORTE_INFO.a_confirmar.label).toBe("A confirmar");
    expect(PORTE_INFO.pequeno.label).toBe("Pequeno");
  });

  it('6) "produtos para hotel" devolve categorias_do_segmento sem preço e pergunta de categoria', async () => {
    const h = buildHarness();
    const res = await h.consultarProduto({ termo: "produtos para hotel" });
    expect(res.success).toBe(true);
    expect(res.data.correspondencia).toBe("segmento");
    expect(Array.isArray(res.data.categorias_do_segmento)).toBe(true);
    expect(res.data.categorias_do_segmento.length).toBeGreaterThanOrEqual(2);
    expect(res.data.categorias_do_segmento[0]).toHaveProperty("categoria");
    expect(res.data.categorias_do_segmento[0]).toHaveProperty("exemplo_nome");
    expect(res.data.categorias_do_segmento[0]).toHaveProperty("exemplo_marca");
    expect(res.data.categorias_do_segmento[0]).not.toHaveProperty("price");
    expect(res.data.mensagem_para_lead).toContain("soluções mais pedidas são:");
    expect(res.data.mensagem_para_lead).toContain("Quer ver alguma dessas categorias?");
  });
});