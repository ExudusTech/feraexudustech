// Pure helpers for the installed base (Lote 11): maintenance plans, point checklist, occurrences and import.
// No Deno/npm imports so vitest can load it.
export const ESTADOS = ["verde", "amarelo", "vermelho"] as const;
export type Estado = typeof ESTADOS[number];
export const ESTADO_LABEL: Record<string, string> = { verde: "OK", amarelo: "Atenção", vermelho: "Ruim" };
export const MANUTENCOES = ["refil_reposto", "limpeza", "aparelho_trocado", "problema"] as const;
/** Also accepted from older clients. */
export const MANUTENCOES_ACEITAS = [...MANUTENCOES, "ajuste", "consertado"] as const;
export const MANUTENCAO_LABEL: Record<string, string> = { refil_reposto: "Refil reposto", limpeza: "Limpeza", aparelho_trocado: "Aparelho trocado", problema: "Problema", ajuste: "Ajuste", consertado: "Consertado no local" };
export const FREQUENCIAS = ["semanal", "quinzenal", "mensal", "personalizada"] as const;
export type Frequencia = typeof FREQUENCIAS[number];
export const FREQ_LABEL: Record<string, string> = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal", personalizada: "Personalizada" };
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export interface Plano { frequencia: string; intervalo_dias?: number | null; dia_semana?: number | null; data_inicio: string }

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Interval in days: weekly 7, fortnightly 15, monthly 30 (decided 05/11), custom 1–180. */
export function intervaloDias(p: Plano): number {
  if (p.frequencia === "semanal") return 7;
  if (p.frequencia === "quinzenal") return 15;
  if (p.frequencia === "mensal") return 30;
  return Math.max(1, Math.min(180, Number(p.intervalo_dias) || 15));
}

/** Route weekdays (JS 0–6) from a coverage area's text, e.g. "3ª feira e 5ª feira" → [2, 4]. */
export function parseDiaSemana(text?: string | null): number[] {
  return ((text ?? "").match(/(\d)ª/g) ?? []).map((m) => parseInt(m[0], 10) - 1).filter((d) => d >= 1 && d <= 5);
}

export interface AreaRota { name: string; city?: string | null; dia_semana?: string | null; zip_code_start?: string | null; zip_code_end?: string | null }
/** Client's route region: narrowest CEP interval, else exact city name. */
export function areaDoCliente<T extends AreaRota>(areas: T[], cep?: string | null, city?: string | null): T | null {
  const d = (v?: string | null) => (v ?? "").replace(/\D/g, "");
  const pc = d(cep);
  if (pc.length === 8) {
    const hit = areas.map((a) => ({ a, s: d(a.zip_code_start), e: d(a.zip_code_end ?? a.zip_code_start) }))
      .filter((x) => x.s.length === 8 && x.e.length === 8 && pc >= x.s && pc <= x.e)
      .sort((x, y) => (Number(x.e) - Number(x.s)) - (Number(y.e) - Number(y.s)))[0];
    if (hit) return hit.a;
  }
  const norm = (v?: string | null) => (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const c = norm(city);
  return c ? areas.find((a) => norm(a.city) === c) ?? null : null;
}

/** First open route day on/after `from`: on a route weekday (any Mon–Sat without a route) and not blocked (holiday / Google all-day). */
export function primeiroDiaRota(from: string, rota: number[], blocked: (iso: string) => boolean): string {
  let d = from;
  for (let i = 0; i < 120; i++, d = addDays(d, 1)) {
    const w = dow(d);
    if (w === 0 || (rota.length && !rota.includes(w)) || blocked(d)) continue;
    return d;
  }
  return from;
}

/**
 * Planned visit dates in [from, from+horizon). Each date is the first open route day on/after (previous visit + interval);
 * the series starts after the plan's last visit (`ultima`) or at data_inicio. Never a holiday or Google block.
 */
export function proximasDatas(p: Plano, from: string, horizonDias: number, blocked: (iso: string) => boolean, rota: number[] = [], ultima?: string | null): string[] {
  const step = intervaloDias(p);
  const end = addDays(from, horizonDias);
  const pick = (x: string) => primeiroDiaRota(x, rota, blocked);
  let d = ultima ? pick(addDays(ultima, step)) : pick(p.data_inicio > from ? p.data_inicio : from);
  const out: string[] = [];
  for (let i = 0; i < 200 && d < end; i++) {
    if (d >= from && !out.includes(d)) out.push(d);
    d = pick(addDays(d, step));
  }
  return out;
}


export const FREQ_RAPIDAS = ["semanal", "quinzenal", "mensal"] as const;

/** Next plan visit after a visit done on `today`. */
export function proximaVisitaPlano(p: Plano, today: string, rota: number[] = [], blocked: (iso: string) => boolean = () => false): string {
  return primeiroDiaRota(addDays(today, intervaloDias(p)), rota, blocked);
}

export interface AvaliacaoInput { estado?: string; foto_path?: string | null; precisa_substituir?: boolean; item?: string | null }

/** Error text for an invalid point evaluation, or null. Photo required when yellow/red. */
export function avaliacaoErro(a: AvaliacaoInput): string | null {
  if (!ESTADOS.includes(a.estado as Estado)) return "Escolha o estado do ponto";
  if (a.estado !== "verde" && !a.foto_path) return "Tire uma foto do ponto em atenção ou ruim";
  if (a.precisa_substituir && !(a.item ?? "").trim()) return "Informe o item a levar para substituir";
  return null;
}

/** Revisit of an existing point in attention/defect: must say what was done (fixed on site or needs replacement). */
export function acaoRevisitaErro(estado: string, consertado: boolean, substituir: boolean): string | null {
  return estado !== "verde" && !consertado && !substituir ? "Diga o que foi feito: consertado no local ou precisa substituir" : null;
}

/** New point: internal location and photo are mandatory. */
export function pontoErro(p: { localizacao_interna?: string | null; foto_path?: string | null; quantidade?: string | null }): string | null {
  if ((p.localizacao_interna ?? "").trim().length < 2) return "Informe o local interno do ponto";
  if (!p.foto_path) return "Tire a foto do ponto";
  if (p.quantidade !== undefined && p.quantidade !== null && !/^\d{1,4}$/.test(String(p.quantidade).trim())) return "Quantidade inválida";
  return null;
}

/** Frequencies the consultant can pick when closing a maintenance visit without a plan. */

/** Next planned visit date strictly after `today` (holidays are handled by the daily generator). */

export interface Compativel { id: string; brand?: string | null; is_dispenser?: boolean | null; dispenser_family_id?: string | null;
  compatible_dispenser_families?: string[] | null; specifications?: unknown; linha_produto?: string | null; name?: string }
const normTxt = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Refills compatible with a dispenser: refill specifications naming the dispenser, else the family mapping
 * (compatible_dispenser_families ∋ dispenser family), else the same brand. `mapeado` tells whether a real mapping was used.
 */
export function refisCompativeis<T extends Compativel>(disp: Compativel | null | undefined, refis: T[]): { lista: T[]; mapeado: boolean } {
  if (!disp) return { lista: refis, mapeado: false };
  const fam = disp.dispenser_family_id;
  const byFam = fam ? refis.filter((r) => (r.compatible_dispenser_families ?? []).includes(fam)) : [];
  const dn = normTxt(disp.name);
  const bySpec = dn.length >= 4 ? refis.filter((r) => normTxt(JSON.stringify(r.specifications ?? "")).includes(dn)) : [];
  // The catalog naming this exact dispenser is the most specific mapping; the family mapping comes next.
  const mapped = bySpec.length ? bySpec : byFam;
  if (mapped.length) return { lista: mapped, mapeado: true };
  const brand = normTxt(disp.brand);
  return { lista: brand ? refis.filter((r) => normTxt(r.brand) === brand) : refis, mapeado: false };
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
