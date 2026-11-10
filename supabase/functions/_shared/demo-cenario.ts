// Demo scenario (Configurações → Dados de demonstração): pure planning rules shared by the demo-cenario function and tests.
// No Deno/npm imports so vitest can load it. Records are written by the function through the real tables.

export const DEMO_PREFIX = "[DEMO]";
export const demoNome = (nome: string) => `${DEMO_PREFIX} ${nome}`;
export const NITSCLEAN_ORG_ID = "7fd8333b-578a-4db8-b1be-fdcb8339d4e8";

/** Fictitious WhatsApp "55 22 90000-00nn" (13 digits, valid format, nobody's number). */
export function telefoneDemo(n: number): string { return `55229000000${String(n % 100).padStart(2, "0")}`; }

/** `qtd` fictitious numbers, skipping any that matches a team phone (with or without 55). */
export function telefonesDemo(qtd: number, equipe: Iterable<string> = []): string[] {
  const team = new Set<string>();
  for (const p of equipe) { const d = String(p ?? "").replace(/\D/g, ""); if (d) { team.add(d); team.add(d.startsWith("55") ? d : `55${d}`); } }
  const out: string[] = [];
  for (let n = 1; n < 100 && out.length < qtd; n++) { const t = telefoneDemo(n); if (!team.has(t)) out.push(t); }
  return out;
}

/** Valid-format CNPJ in the 90.000.xxx range used only by the demo (check digits computed). */
export function cnpjDemo(seq: number): string {
  const base = `90000${String(seq % 1000).padStart(3, "0")}0001`;
  const dv = (s: string) => {
    const w = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = w.reduce((a, wi, i) => a + Number(s[i]) * wi, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base); const d2 = dv(`${base}${d1}`);
  return `${base}${d1}${d2}`;
}

export const addDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const fold = (v?: string | null) => (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export interface AreaDemo { name: string; city?: string | null; dia_semana?: string | null; horario_inicio?: string | null; horario_fim?: string | null; zip_code_start?: string | null }

/** Covered cities used by the demo, with a central point and a CEP inside the region. */
export const CIDADES_DEMO: Record<string, { lat: number; lng: number; cep: string; bairro: string }> = {
  "Armação dos Búzios": { lat: -22.7469, lng: -41.8817, cep: "28950-000", bairro: "Centro" },
  "Cabo Frio": { lat: -22.8894, lng: -42.0286, cep: "28905-000", bairro: "Centro" },
  "Rio das Ostras": { lat: -22.5269, lng: -41.945, cep: "28890-000", bairro: "Centro" },
  "Saquarema": { lat: -22.9292, lng: -42.5099, cep: "28990-000", bairro: "Centro" },
  "São Pedro da Aldeia": { lat: -22.8392, lng: -42.1028, cep: "28940-000", bairro: "Centro" },
};
export const CIDADES = Object.keys(CIDADES_DEMO);

/** Route weekdays (JS 0–6) from "2ª feira e 6ª feira". */
export function diasDaRota(text?: string | null): number[] {
  return ((text ?? "").match(/(\d)ª/g) ?? []).map((m) => parseInt(m[0], 10) - 1).filter((d) => d >= 1 && d <= 5);
}
export function areaDaCidade(areas: AreaDemo[], cidade: string): AreaDemo | null {
  return areas.find((a) => fold(a.city) === fold(cidade)) ?? null;
}

export type Bloqueado = (iso: string, cidade: string) => boolean;

/** Nearest date from `desde` (walking `passo` days) that is a route day for at least one of `cidades`; returns the cities routed that day. */
export function diaComRota(areas: AreaDemo[], cidades: string[], desde: string, passo: 1 | -1, bloqueado: Bloqueado = () => false): { data: string; cidades: string[] } | null {
  let d = desde;
  for (let i = 0; i < 60; i++, d = addDias(d, passo)) {
    const ok = cidades.filter((c) => { const a = areaDaCidade(areas, c); return !!a && diasDaRota(a.dia_semana).includes(dow(d)) && !bloqueado(d, c); });
    if (ok.length) return { data: d, cidades: ok };
  }
  return null;
}

const toMin = (h?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(h ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60; };
const toHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** k-th 1-hour slot inside the city's route window (wraps inside the window). */
export function horaNaJanela(area: AreaDemo | null, k: number): string {
  const ini = toMin(area?.horario_inicio), fim = Math.max(ini + 60, toMin(area?.horario_fim));
  const slots = Math.max(1, Math.floor((fim - ini) / 60));
  return toHora(ini + (k % slots) * 60);
}

export interface VisitaPlano { data: string; cidade: string; hora: string }
export interface PlanoDatas {
  ontem_concluida: VisitaPlano; ontem_nao_realizada: VisitaPlano;
  hoje_andamento: VisitaPlano; hoje_agendada: VisitaPlano;
  amanha_teste: VisitaPlano; amanha_comercial: VisitaPlano;
  cliente_atrasada: VisitaPlano; cliente_retorno_teste: VisitaPlano;
}

/**
 * Dates relative to `hoje` (São Paulo), always on the route day of the visit's city:
 * "ontem" = latest route day before today, "hoje" = today when routed (in-progress falls back to the latest earlier route day,
 * the scheduled one to the next), "amanhã" = first route day after today. The client lives in `cidadeCliente`.
 */
export function planejarDatas(hoje: string, areas: AreaDemo[], bloqueado: Bloqueado = () => false, cidadeCliente = "Armação dos Búzios"): PlanoDatas | null {
  const ontem = diaComRota(areas, CIDADES, addDias(hoje, -1), -1, bloqueado);
  const andamento = diaComRota(areas, CIDADES, hoje, -1, bloqueado);
  const agendada = diaComRota(areas, CIDADES, hoje, 1, bloqueado);
  const amanha = diaComRota(areas, CIDADES, addDias(hoje, 1), 1, bloqueado);
  const atrasada = diaComRota(areas, [cidadeCliente], addDias(hoje, -3), -1, bloqueado);
  const antiga = diaComRota(areas, [cidadeCliente], addDias(hoje, -14), -1, bloqueado);
  if (!ontem || !andamento || !agendada || !amanha || !atrasada || !antiga) return null;
  const pick = (d: { data: string; cidades: string[] }, i: number, k: number): VisitaPlano => {
    const cidade = d.cidades[i % d.cidades.length];
    return { data: d.data, cidade, hora: horaNaJanela(areaDaCidade(areas, cidade), k) };
  };
  // Two visits on the same day and city get different hours.
  const segunda = (d: { data: string; cidades: string[] }) => d.cidades.length > 1 ? pick(d, 1, 0) : pick(d, 0, 1);
  const hojeAg = agendada.data === andamento.data
    ? (agendada.cidades.length > 1 ? pick(agendada, 1, 0) : pick(agendada, 0, 1)) : pick(agendada, 0, 0);
  return {
    ontem_concluida: pick(ontem, 0, 0), ontem_nao_realizada: segunda(ontem),
    hoje_andamento: pick(andamento, 0, 0), hoje_agendada: hojeAg,
    amanha_teste: pick(amanha, 0, 0), amanha_comercial: segunda(amanha),
    cliente_atrasada: pick(atrasada, 0, 0), cliente_retorno_teste: pick(antiga, 0, 1),
  };
}

export interface ProdutoDemo { id: string; name: string; price?: number | string | null; brand?: string | null; is_dispenser?: boolean | null;
  dispenser_family_id?: string | null; compatible_dispenser_families?: string[] | null; is_active?: boolean | null }
export interface ParDemo { refil: ProdutoDemo; aparelho: ProdutoDemo | null }

/** Up to `n` refill/device pairs from the catalog (refill with price; compatible device by family), preferring distinct families. */
export function escolherPares(catalogo: ProdutoDemo[], n: number): ParDemo[] {
  const ativos = catalogo.filter((p) => p.is_active !== false);
  const preco = (p: ProdutoDemo) => Number(String(p.price ?? "0").replace(",", ".")) || 0;
  const refis = ativos.filter((p) => !p.is_dispenser && preco(p) > 0).sort((a, b) => a.name.localeCompare(b.name));
  const out: ParDemo[] = []; const familias = new Set<string>();
  for (const r of refis) {
    if (out.length >= n) break;
    const fams = r.compatible_dispenser_families ?? [];
    const ap = ativos.find((d) => d.is_dispenser && d.dispenser_family_id && fams.includes(d.dispenser_family_id) && !familias.has(d.dispenser_family_id));
    if (ap) { familias.add(ap.dispenser_family_id!); out.push({ refil: r, aparelho: ap }); }
  }
  for (const r of refis) { if (out.length >= n) break; if (!out.some((p) => p.refil.id === r.id)) out.push({ refil: r, aparelho: null }); }
  return out;
}
export const precoDe = (p: ProdutoDemo | null | undefined): number | null => {
  const v = Number(String(p?.price ?? "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
};

// ─── Funnel history for the timing metrics (Relatórios → Tempo do funil, Flora Equipe) ───
export interface PassoDemo { chave: string; em: string }
export interface PropostaHistDemo { status: "rascunho" | "enviada" | "aceita" | "rejeitada"; passos: Array<{ status: string; em: string }>; ativado_em?: string }
export interface HistoricoDemo {
  leads: Record<string, PassoDemo[]>;
  propostas: Record<"cliente" | "proposta" | "perdido", PropostaHistDemo>;
  teste: Record<string, { instalado_em: string; aprovado_em?: string }>;
  ativacao_cliente: string; teste_cliente_inicio: string;
}
const emSP = (iso: string, hora = "10:00") => new Date(`${iso}T${hora}:00-03:00`).toISOString();

/**
 * Coherent stage/proposal dates spread over the last weeks, tied to the visit plan:
 * every lead ends in its current stage, steps are strictly increasing and never in the future.
 */
export function planejarHistorico(hoje: string, plano: PlanoDatas): HistoricoDemo {
  const h = (n: number, hora?: string) => emSP(addDias(hoje, n), hora);
  const pr = plano.cliente_retorno_teste.data, pc = plano.ontem_concluida.data;
  const r = (n: number, hora?: string) => emSP(addDias(pr, n), hora);
  const passos = (...xs: Array<[string, string]>) => xs.map(([chave, em]) => ({ chave, em }));
  return {
    leads: {
      cliente: passos(["novo", r(-30, "09:00")], ["qualificado", r(-27)], ["visita_agendada", r(-24)], ["visita_realizada", r(-20, "15:00")], ["teste_amostra", r(-15, "11:00")],
        ["proposta_enviada", r(1, "15:00")], ["ganho", r(5, "10:00")], ["cliente_ativo", r(5, "10:30")]),
      andamento: passos(["novo", h(-12)], ["qualificado", h(-9)], ["visita_agendada", h(-6)]),
      concluida: passos(["novo", emSP(addDias(pc, -14))], ["qualificado", emSP(addDias(pc, -10))], ["visita_agendada", emSP(addDias(pc, -6))], ["visita_realizada", emSP(pc, "18:00")]),
      nao_realizada: passos(["novo", h(-10)], ["visita_agendada", h(-5)]),
      hoje_agendada: passos(["novo", h(-8)], ["qualificado", h(-6)], ["visita_agendada", h(-3)]),
      teste: passos(["novo", h(-25)], ["qualificado", h(-22)], ["visita_agendada", h(-19)], ["visita_realizada", h(-15, "15:00")], ["teste_amostra", h(-4)]),
      amanha: passos(["novo", h(-6)], ["visita_agendada", h(-2)]),
      em_teste: passos(["novo", h(-28)], ["qualificado", h(-24)], ["visita_agendada", h(-20)], ["visita_realizada", h(-16, "15:00")], ["teste_amostra", h(-5, "11:00")]),
      atendimento: passos(["novo", h(-2)]),
      qualificado: passos(["novo", h(-9)], ["qualificado", h(-4)]),
      proposta: passos(["novo", h(-21)], ["qualificado", h(-18)], ["visita_agendada", h(-15)], ["visita_realizada", h(-11, "15:00")], ["proposta_enviada", h(-6, "16:00")]),
      perdido: passos(["novo", h(-30)], ["qualificado", h(-27)], ["visita_agendada", h(-24)], ["visita_realizada", h(-20, "15:00")], ["proposta_enviada", h(-14, "16:00")], ["perdido", h(-7)]),
    },
    propostas: {
      cliente: { status: "aceita", passos: [{ status: "rascunho", em: r(1, "09:00") }, { status: "enviada", em: r(1, "15:00") }, { status: "aceita", em: r(5, "10:00") }], ativado_em: r(7, "10:00") },
      proposta: { status: "enviada", passos: [{ status: "rascunho", em: h(-7) }, { status: "enviada", em: h(-6, "16:00") }] },
      perdido: { status: "rejeitada", passos: [{ status: "rascunho", em: h(-15) }, { status: "enviada", em: h(-14, "16:00") }, { status: "rejeitada", em: h(-7) }] },
    },
    teste: { cliente: { instalado_em: r(-15, "11:00"), aprovado_em: r(0, "15:00") }, em_teste: { instalado_em: h(-5, "11:00") } },
    ativacao_cliente: r(7, "10:00"), teste_cliente_inicio: addDias(pr, -15),
  };
}

/** What the scenario creates (shown on the settings screen and in the reply). */
export const CENARIO_RESUMO = [
  "12 leads [DEMO] em etapas diferentes do funil (Búzios, Cabo Frio, Rio das Ostras, Saquarema e São Pedro), cada um com contato e telefone fictício",
  "1 cliente [DEMO] (convertido de lead) com 2 aparelhos ativos em comodato e manutenção atrasada",
  "Visitas do PH e do Marcos: ontem 1 concluída (boa) e 1 não realizada com motivo; hoje 1 em andamento com coleta com informações pendentes e 1 agendada; amanhã 2 agendadas, uma instalação de teste com material e nota pendentes",
  "1 manutenção atrasada do cliente (visita não feita) e 1 retorno de teste antigo",
  "1 proposta aberta gerada da coleta, com pontos previstos e preços do catálogo",
  "2 tarefas de faturamento: emitir Simples Remessa (teste de amanhã) e emitir NF de Comodato (aparelho aprovado no teste)",
  "1 lead com aparelho em teste",
  "1 atendimento aberto aguardando humano",
  "Estoque de 8 aparelhos (alguns abaixo do mínimo), com a reserva da instalação de teste de amanhã e 1 aparelho já separado com etiqueta",
  "Aparelhos demo com etiqueta numerada da faixa 900001 em diante e 4 avaliações do QR (uma nota baixa)",
  "Histórico do funil nas últimas semanas (mudanças de etapa e de proposta) e mais 2 propostas — 1 enviada e 1 rejeitada — para o “Tempo do funil”",
];

/** Demo stock (10/11): up to 8 dispensers, the first ones being the devices reserved for tomorrow's test; some end up at or below the minimum. */
export const ESTOQUE_DEMO = [
  { stock: 3, min_stock: 2 }, { stock: 6, min_stock: 2 }, { stock: 10, min_stock: 4 }, { stock: 1, min_stock: 3 },
  { stock: 0, min_stock: 2 }, { stock: 8, min_stock: 3 }, { stock: 2, min_stock: 4 }, { stock: 15, min_stock: 5 },
];
export function planoEstoqueDemo(ids: string[]): Array<{ product_id: string; stock: number; min_stock: number }> {
  return [...new Set(ids)].slice(0, ESTOQUE_DEMO.length).map((product_id, i) => ({ product_id, ...ESTOQUE_DEMO[i] }));
}
