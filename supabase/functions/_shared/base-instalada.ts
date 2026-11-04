// Pure helpers for the installed base (Lote 11): maintenance plans, point checklist, occurrences and import.
// No Deno/npm imports so vitest can load it.
export const ESTADOS = ["verde", "amarelo", "vermelho"] as const;
export type Estado = typeof ESTADOS[number];
export const ESTADO_LABEL: Record<string, string> = { verde: "OK", amarelo: "Atenção", vermelho: "Ruim" };
export const MANUTENCOES = ["refil_reposto", "limpeza", "aparelho_trocado", "problema"] as const;
/** Also accepted from older clients. */
export const MANUTENCOES_ACEITAS = [...MANUTENCOES, "ajuste"] as const;
export const MANUTENCAO_LABEL: Record<string, string> = { refil_reposto: "Refil reposto", limpeza: "Limpeza", aparelho_trocado: "Aparelho trocado", problema: "Problema", ajuste: "Ajuste" };
export const FREQUENCIAS = ["semanal", "quinzenal", "mensal", "personalizada"] as const;
export type Frequencia = typeof FREQUENCIAS[number];
export const FREQ_LABEL: Record<string, string> = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal", personalizada: "Personalizada" };
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export interface Plano { frequencia: string; intervalo_dias?: number | null; dia_semana?: number | null; data_inicio: string }

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Interval in days for a plan; monthly is handled separately (same weekday ~4 weeks later). */
export function intervaloDias(p: Plano): number {
  if (p.frequencia === "semanal") return 7;
  if (p.frequencia === "quinzenal") return 14;
  if (p.frequencia === "mensal") return 28;
  return Math.max(1, Math.min(180, Number(p.intervalo_dias) || 14));
}

/** First on/after `from` matching the preferred weekday (or `from` itself). */
function alignWeekday(from: string, dia?: number | null): string {
  if (dia === null || dia === undefined) return from;
  let d = from;
  for (let i = 0; i < 7 && dow(d) !== dia; i++) d = addDays(d, 1);
  return d;
}

/**
 * Planned visit dates in [from, from+horizon). Dates fall on the preferred weekday, keep the plan rhythm
 * from data_inicio, and a blocked day (holiday/closure/Sunday) moves to the next open day without shifting the series.
 */
export function proximasDatas(p: Plano, from: string, horizonDias: number, blocked: (iso: string) => boolean): string[] {
  const step = intervaloDias(p);
  const end = addDays(from, horizonDias);
  let d = alignWeekday(p.data_inicio, p.dia_semana);
  // advance whole steps until within range
  while (d < from) d = addDays(d, step);
  const out: string[] = [];
  while (d < end) {
    let real = d;
    for (let i = 0; i < 7 && (blocked(real) || dow(real) === 0); i++) real = addDays(real, 1);
    const next = addDays(d, step);
    if (real < end && real < next && !out.includes(real)) out.push(real);
    d = next;
  }
  return out;
}

export interface AvaliacaoInput { estado?: string; foto_path?: string | null; precisa_substituir?: boolean; item?: string | null }

/** Error text for an invalid point evaluation, or null. Photo required when yellow/red. */
export function avaliacaoErro(a: AvaliacaoInput): string | null {
  if (!ESTADOS.includes(a.estado as Estado)) return "Escolha o estado do ponto";
  if (a.estado !== "verde" && !a.foto_path) return "Tire uma foto do ponto em atenção ou ruim";
  if (a.precisa_substituir && !(a.item ?? "").trim()) return "Informe o item a levar para substituir";
  return null;
}

/** New point: internal location and photo are mandatory. */
export function pontoErro(p: { localizacao_interna?: string | null; foto_path?: string | null; quantidade?: string | null }): string | null {
  if ((p.localizacao_interna ?? "").trim().length < 2) return "Informe o local interno do ponto";
  if (!p.foto_path) return "Tire a foto do ponto";
  if (p.quantidade !== undefined && p.quantidade !== null && !/^\d{1,4}$/.test(String(p.quantidade).trim())) return "Quantidade inválida";
  return null;
}

/** Frequencies the consultant can pick when closing a maintenance visit without a plan. */
export const FREQ_RAPIDAS = ["semanal", "quinzenal", "mensal"] as const;

/** Next planned visit date strictly after `today` (holidays are handled by the daily generator). */
export function proximaVisitaPlano(p: Plano, today: string): string {
  return proximasDatas(p, addDays(today, 1), 200, () => false)[0] ?? addDays(today, intervaloDias(p));
}

export interface Compativel { id: string; brand?: string | null; is_dispenser?: boolean | null; dispenser_family_id?: string | null;
  compatible_dispenser_families?: string[] | null; specifications?: unknown; linha_produto?: string | null; name?: string }
const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Refills compatible with a dispenser: refill specifications naming the dispenser, else the family mapping
 * (compatible_dispenser_families ∋ dispenser family), else the same brand. `mapeado` tells whether a real mapping was used.
 */
export function refisCompativeis<T extends Compativel>(disp: Compativel | null | undefined, refis: T[]): { lista: T[]; mapeado: boolean } {
  if (!disp) return { lista: refis, mapeado: false };
  const fam = disp.dispenser_family_id;
  const byFam = fam ? refis.filter((r) => (r.compatible_dispenser_families ?? []).includes(fam)) : [];
  const dn = norm(disp.name);
  const bySpec = dn.length >= 4 ? refis.filter((r) => norm(JSON.stringify(r.specifications ?? "")).includes(dn)) : [];
  // The catalog naming this exact dispenser is the most specific mapping; the family mapping comes next.
  const mapped = bySpec.length ? bySpec : byFam;
  if (mapped.length) return { lista: mapped, mapeado: true };
  const brand = norm(disp.brand);
  return { lista: brand ? refis.filter((r) => norm(r.brand) === brand) : refis, mapeado: false };
}

/** Ids of active points still without an evaluation in this visit. */
export function pontosPendentes(pontos: { id: string; status?: string | null }[], avaliados: string[]): string[] {
  const done = new Set(avaliados);
  return pontos.filter((p) => (p.status ?? "ATIVO").toUpperCase() === "ATIVO" && !done.has(p.id)).map((p) => p.id);
}

export function piorEstado(estados: (string | null | undefined)[]): Estado | null {
  if (estados.includes("vermelho")) return "vermelho";
  if (estados.includes("amarelo")) return "amarelo";
  if (estados.includes("verde")) return "verde";
  return null;
}

/** Client location from a check-in only overwrites an existing one when explicitly confirmed. */
export function podeGravarLocalizacao(existente: { latitude?: number | null } | null, confirmado: boolean): boolean {
  void existente;
  return confirmado === true;
}

export interface ImportRow { cliente: string; cidade: string; frequencia: string; dia_semana: number | null; consultor?: string; erro?: string }
const norm = (s: unknown) => String(s ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Validates spreadsheet rows (cliente, cidade, frequência, dia); flags duplicates by name+city within the file and vs. existing clients. */
export function parseImportRows(rows: Record<string, unknown>[], existentes: { name: string; city: string | null }[]): ImportRow[] {
  const seen = new Set(existentes.map((c) => `${norm(c.name)}|${norm(c.city)}`));
  return rows.map((r) => {
    const get = (k: string) => { const key = Object.keys(r).find((x) => norm(x).startsWith(k)); return key ? r[key] : ""; };
    const cliente = String(get("cliente") ?? "").trim(); const cidade = String(get("cidade") ?? "").trim();
    const f = norm(get("freq")); const diaTxt = norm(get("dia"));
    const frequencia = FREQUENCIAS.find((x) => f.startsWith(x.slice(0, 4))) ?? "";
    const idx = DIAS_SEMANA.findIndex((d) => diaTxt && norm(d).startsWith(diaTxt.slice(0, 3)));
    const row: ImportRow = { cliente, cidade, frequencia, dia_semana: idx >= 0 ? idx : null, consultor: String(get("consultor") ?? "").trim() || undefined };
    const key = `${norm(cliente)}|${norm(cidade)}`;
    if (cliente.length < 2) row.erro = "Cliente sem nome";
    else if (!cidade) row.erro = "Cidade vazia";
    else if (!frequencia) row.erro = "Frequência inválida";
    else if (seen.has(key)) row.erro = "Cliente duplicado";
    if (!row.erro) seen.add(key);
    return row;
  });
}

export function ocorrenciaUrgenteMessage(v: { cliente: string; consultor: string; local: string; item: string; pedidoId: string }): string {
  return `🚨 Ocorrência urgente\nCliente: ${v.cliente}\nPonto: ${v.local}\nItem: ${v.item}\nAberta por: ${v.consultor}\nO gestor precisa aprovar uma visita emergencial: https://fera.exudustech.com.br/dashboard?tab=campo&pedido=${v.pedidoId}`;
}

export function manutencaoDoDiaMessage(nome: string, visitas: { hora: string; cliente: string }[], levar: string[]): string {
  const l = visitas.map((v) => `• ${v.hora.slice(0, 5)} ${v.cliente}`).join("\n");
  return `Bom dia, ${nome}! Manutenções de hoje:\n${l}${levar.length ? `\n\nLevar:\n${levar.map((x) => `• ${x}`).join("\n")}` : ""}\nhttps://fera.exudustech.com.br/hoje`;
}
