// Pure funnel-timing math shared by Relatórios ("Tempo do funil") and Flora Equipe.
// mcp embeds an identical copy of the block below (test-enforced) because its test harness cannot load imports.
// BEGIN funil-tempos
export interface FtEtapa { id: string; nome: string; ordem: number; tipo?: string | null; chave?: string | null }
export interface FtMudanca { lead_id: string; etapa_anterior_id?: string | null; etapa_nova_id: string | null; mudou_em: string; estimado?: boolean | null }
export interface FtLead {
  id: string; created_at?: string | null; segmento?: string | null; porte?: string | null; cidade?: string | null; regiao?: string | null;
  canal?: string | null; vendedor?: string | null; teste_instalado_em?: string | null; teste_aprovado_em?: string | null;
}
export interface FtProposta {
  id: string; lead_id?: string | null; client_id?: string | null; status?: string | null; created_at?: string | null;
  enviada_em?: string | null; aceita_em?: string | null; rejeitada_em?: string | null; ativado_em?: string | null;
}
export interface FtEstat { n: number; media: number | null; mediana: number | null }
export interface FtEtapaTempo extends FtEstat { etapa_id: string; nome: string; ordem: number; parados: number; estimados: number }
export interface FtCiclos { entrada_aceita: FtEstat; enviada_aceita: FtEstat; aceita_ativacao: FtEstat; teste_aprovado: FtEstat }
export interface FtGrupo extends FtEstat { grupo: string }
export interface FtJanela { inicio?: string | null; fim?: string | null }
export type FtRecorte = "segmento" | "porte" | "cidade" | "regiao" | "canal" | "vendedor";

const FT_DIA = 86_400_000;
const ftMs = (iso?: string | null): number | null => { if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };
const ftNaJanela = (iso: string | null | undefined, j?: FtJanela): boolean => {
  const t = ftMs(iso); if (t == null) return false;
  const a = ftMs(j?.inicio ?? null); const b = ftMs(j?.fim ?? null);
  return (a == null || t >= a) && (b == null || t < b);
};

/** Days from a to b (fractional); null when either is missing or b is before a. */
export function diasEntre(a?: string | null, b?: string | null): number | null {
  const x = ftMs(a); const y = ftMs(b);
  if (x == null || y == null || y < x) return null;
  return (y - x) / FT_DIA;
}

export function estatDias(valores: number[]): FtEstat {
  const v = valores.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!v.length) return { n: 0, media: null, mediana: null };
  const meio = Math.floor(v.length / 2);
  const mediana = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  const media = v.reduce((s, n) => s + n, 0) / v.length;
  return { n: v.length, media: Math.round(media * 10) / 10, mediana: Math.round(mediana * 10) / 10 };
}

/** "3,5 dias", "1 dia", "6 h" (under one day), "—" when there is no value. */
export function fmtDias(d: number | null | undefined): string {
  if (d == null || !Number.isFinite(d)) return "—";
  if (d < 1) { const h = Math.max(1, Math.round(d * 24)); return `${h} h`; }
  const r = Math.round(d * 10) / 10;
  const txt = Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
  return `${txt} ${r === 1 ? "dia" : "dias"}`;
}

/** Size band from levantamento.porte (rooms/tables/people). */
export function faixaPorte(porte: unknown): string {
  const n = typeof porte === "number" ? porte : Number(String(porte ?? "").replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "Sem levantamento";
  if (n <= 20) return "Pequeno (até 20)";
  if (n <= 80) return "Médio (21–80)";
  return "Grande (81+)";
}

function ftOrdenarHistorico(historico: FtMudanca[]): Map<string, FtMudanca[]> {
  const por = new Map<string, FtMudanca[]>();
  for (const h of historico) { if (!h?.lead_id || ftMs(h.mudou_em) == null) continue; (por.get(h.lead_id) ?? por.set(h.lead_id, []).get(h.lead_id)!).push(h); }
  for (const lista of por.values()) lista.sort((a, b) => ftMs(a.mudou_em)! - ftMs(b.mudou_em)!);
  return por;
}

/**
 * Time spent in each open stage: the interval from entering a stage to the next change.
 * An interval counts in the window when it ends inside it; leads still sitting in a stage count as "parados".
 */
export function temposPorEtapa(etapas: FtEtapa[], historico: FtMudanca[], janela?: FtJanela): FtEtapaTempo[] {
  const abertas = etapas.filter((e) => (e.tipo ?? "aberta") === "aberta");
  const dur = new Map<string, number[]>(); const parados = new Map<string, number>(); const est = new Map<string, number>();
  for (const lista of ftOrdenarHistorico(historico).values()) {
    lista.forEach((h, i) => {
      if (!h.etapa_nova_id) return;
      const prox = lista[i + 1];
      if (!prox) { parados.set(h.etapa_nova_id, (parados.get(h.etapa_nova_id) ?? 0) + 1); return; }
      if (!ftNaJanela(prox.mudou_em, janela)) return;
      const d = diasEntre(h.mudou_em, prox.mudou_em); if (d == null) return;
      (dur.get(h.etapa_nova_id) ?? dur.set(h.etapa_nova_id, []).get(h.etapa_nova_id)!).push(d);
      if (h.estimado || prox.estimado) est.set(h.etapa_nova_id, (est.get(h.etapa_nova_id) ?? 0) + 1);
    });
  }
  return abertas.sort((a, b) => a.ordem - b.ordem).map((e) => ({
    etapa_id: e.id, nome: e.nome, ordem: e.ordem, ...estatDias(dur.get(e.id) ?? []), parados: parados.get(e.id) ?? 0, estimados: est.get(e.id) ?? 0,
  }));
}

/** Stage where leads take longest (by median, then mean), among stages with data. */
export function etapaMaisDemorada(tempos: FtEtapaTempo[]): FtEtapaTempo | null {
  const com = tempos.filter((t) => t.n > 0);
  if (!com.length) return null;
  return [...com].sort((a, b) => (b.mediana ?? 0) - (a.mediana ?? 0) || (b.media ?? 0) - (a.media ?? 0))[0];
}

/** Entry of the lead in the funnel: first history row, else created_at. */
export function entradaLead(lead: FtLead, historico: FtMudanca[]): string | null {
  let menor: number | null = null; let iso: string | null = null;
  for (const h of historico) { if (h.lead_id !== lead.id) continue; const t = ftMs(h.mudou_em); if (t != null && (menor == null || t < menor)) { menor = t; iso = h.mudou_em; } }
  return iso ?? lead.created_at ?? null;
}

/** First accepted proposal of each lead. */
function ftAceitaPorLead(propostas: FtProposta[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of propostas) {
    if (!p.lead_id || !p.aceita_em) continue;
    const atual = m.get(p.lead_id);
    if (!atual || ftMs(p.aceita_em)! < ftMs(atual)!) m.set(p.lead_id, p.aceita_em);
  }
  return m;
}

/** Durations (days) lead entry → first accepted proposal, per lead id; counted when the acceptance is in the window. */
export function ciclosEntradaAceita(leads: FtLead[], historico: FtMudanca[], propostas: FtProposta[], janela?: FtJanela): Map<string, number> {
  const aceitas = ftAceitaPorLead(propostas); const out = new Map<string, number>();
  const hist = ftOrdenarHistorico(historico);
  for (const l of leads) {
    const aceita = aceitas.get(l.id); if (!aceita || !ftNaJanela(aceita, janela)) continue;
    const d = diasEntre(entradaLead(l, hist.get(l.id) ?? []), aceita); if (d != null) out.set(l.id, d);
  }
  return out;
}

export function ciclos(leads: FtLead[], historico: FtMudanca[], propostas: FtProposta[], janela?: FtJanela): FtCiclos {
  const enviadaAceita: number[] = []; const aceitaAtiv: number[] = []; const teste: number[] = [];
  for (const p of propostas) {
    if (p.aceita_em && ftNaJanela(p.aceita_em, janela)) { const d = diasEntre(p.enviada_em, p.aceita_em); if (d != null) enviadaAceita.push(d); }
    if (p.ativado_em && ftNaJanela(p.ativado_em, janela)) { const d = diasEntre(p.aceita_em, p.ativado_em); if (d != null) aceitaAtiv.push(d); }
  }
  for (const l of leads) {
    if (l.teste_aprovado_em && ftNaJanela(l.teste_aprovado_em, janela)) { const d = diasEntre(l.teste_instalado_em, l.teste_aprovado_em); if (d != null) teste.push(d); }
  }
  return {
    entrada_aceita: estatDias([...ciclosEntradaAceita(leads, historico, propostas, janela).values()]),
    enviada_aceita: estatDias(enviadaAceita), aceita_ativacao: estatDias(aceitaAtiv), teste_aprovado: estatDias(teste),
  };
}

export const FT_RECORTE_LABEL: Record<FtRecorte, string> = {
  segmento: "Segmento", porte: "Porte", cidade: "Cidade", regiao: "Região", canal: "Canal de origem", vendedor: "Vendedor",
};

export function grupoDoLead(l: FtLead, recorte: FtRecorte): string {
  const v = recorte === "porte" ? (l.porte ?? "Sem levantamento") : (l[recorte] as string | null | undefined);
  const txt = String(v ?? "").trim();
  if (txt) return txt;
  return recorte === "segmento" ? "Sem segmento" : recorte === "vendedor" ? "Sem responsável" : recorte === "canal" ? "Sem canal" : "Sem cidade";
}

/** Cycle lead entry → accepted proposal grouped by a slice, fastest first. */
export function ciclosPorRecorte(leads: FtLead[], historico: FtMudanca[], propostas: FtProposta[], recorte: FtRecorte, janela?: FtJanela): FtGrupo[] {
  const ciclo = ciclosEntradaAceita(leads, historico, propostas, janela); const por = new Map<string, number[]>();
  for (const l of leads) { const d = ciclo.get(l.id); if (d == null) continue; const g = grupoDoLead(l, recorte); (por.get(g) ?? por.set(g, []).get(g)!).push(d); }
  return [...por.entries()].map(([grupo, v]) => ({ grupo, ...estatDias(v) }))
    .sort((a, b) => (a.mediana ?? Infinity) - (b.mediana ?? Infinity) || b.n - a.n || a.grupo.localeCompare(b.grupo));
}

/** "Who decides faster": fastest and slowest groups by median cycle (groups with at least `minimo` closed leads). */
export function rankingDecisao(grupos: FtGrupo[], minimo = 1): { rapidos: FtGrupo[]; lentos: FtGrupo[] } {
  const ok = grupos.filter((g) => g.n >= minimo && g.mediana != null);
  const rapidos = [...ok].sort((a, b) => a.mediana! - b.mediana! || b.n - a.n).slice(0, 3);
  const lentos = [...ok].sort((a, b) => b.mediana! - a.mediana! || b.n - a.n).slice(0, 3);
  return { rapidos, lentos };
}
// END funil-tempos
