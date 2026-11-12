// Concentrated revisit (12/11, part 2): ONE maintenance visit per client (service location), never one per device.
// Pure (no Deno/npm imports) so vitest, base-instalada, visita-acoes and confirmar-visitas share the same rule.
import { addDias } from "./agenda-slot.ts";
import { primeiroDiaRota } from "./base-instalada.ts";

export const MODOS_AGENDA = ["rota", "data"] as const;
export const REGRAS_DATA = ["manual", "dia_mes", "intervalo"] as const;
export type RegraData = typeof REGRAS_DATA[number];
export const REGRA_DATA_LABEL: Record<RegraData, string> = { manual: "Próxima data informada", dia_mes: "Dia X do mês", intervalo: "A cada N dias" };

const PERIODO_DIAS: Record<string, number> = { semanal: 7, quinzenal: 15, mensal: 30, bimestral: 60, trimestral: 90, semestral: 180, anual: 365 };
/** Device periodicity in days ("semanal" 7, "mensal" 30, "45" 45); unknown → 30. */
export function periodoDias(p?: string | null): number {
  const k = String(p ?? "").toLowerCase().trim();
  if (/^\d{1,3}$/.test(k) && Number(k) > 0) return Number(k);
  return PERIODO_DIAS[k] ?? 30;
}

/** How the client is served: city route day (rota) or specific dates outside the route (data). */
export interface AgendaCliente {
  modo: "rota" | "data";
  rota: number[];                 // route weekdays of the client's region (0 = Sun); empty = any Mon–Sat
  regra?: string | null;          // data mode: manual | dia_mes | intervalo
  proxima_data?: string | null;   // manual: next date informed by the manager
  dia_mes?: number | null;        // dia_mes: day of the month (1–31; short months use their last day)
  intervalo_dias?: number | null; // intervalo: every N days
  ancora?: string | null;         // intervalo: series anchor (last visit done, else plan start)
}

export interface PlanoAgenda { modo_agenda?: string | null; regra_data?: string | null; proxima_data?: string | null; dia_mes?: number | null; intervalo_dias?: number | null; data_inicio?: string | null }
export function agendaDoPlano(p: PlanoAgenda | null | undefined, rota: number[], ultimaVisita?: string | null): AgendaCliente {
  if (p?.modo_agenda !== "data") return { modo: "rota", rota };
  return { modo: "data", rota, regra: p.regra_data ?? "manual", proxima_data: p.proxima_data ?? null, dia_mes: p.dia_mes ?? null,
    intervalo_dias: p.intervalo_dias ?? null, ancora: ultimaVisita ?? p.data_inicio ?? null };
}

const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
/** Sunday or a holiday / Google all-day block moves the date forward to the next open day. */
function adiante(d: string, bloqueado: (iso: string) => boolean): string {
  let x = d;
  for (let i = 0; i < 15; i++, x = addDias(x, 1)) if (dow(x) !== 0 && !bloqueado(x)) return x;
  return d;
}
function diaDoMes(ano: number, mes0: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes0, Math.min(dia, ultimo), 12)).toISOString().slice(0, 10);
}
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * First pass on/after `desde`. Route mode: the region's route day (never Sunday/holiday).
 * Data mode ignores the route day: manual date as informed, "dia X do mês" or "a cada N dias" (moved off Sunday/holiday).
 * null = no date known (manual without a future date → the client waits for the manager).
 */
export function proximaPassagem(a: AgendaCliente, desde: string, bloqueado: (iso: string) => boolean = () => false): string | null {
  if (a.modo !== "data") return primeiroDiaRota(desde, a.rota, bloqueado);
  if (a.regra === "dia_mes") {
    const dia = Math.floor(Number(a.dia_mes));
    if (!(dia >= 1 && dia <= 31)) return null;
    const [y, m] = desde.split("-").map(Number);
    for (let k = 0; k < 14; k++) { const d = adiante(diaDoMes(y, m - 1 + k, dia), bloqueado); if (d >= desde) return d; }
    return null;
  }
  if (a.regra === "intervalo") {
    const n = Math.floor(Number(a.intervalo_dias));
    if (!(n >= 1 && n <= 365)) return null;
    const ancora = a.ancora && /^\d{4}-\d{2}-\d{2}$/.test(a.ancora) ? a.ancora : desde;
    if (ancora >= desde) return adiante(ancora, bloqueado);
    let d = addDias(ancora, Math.ceil(diasEntre(ancora, desde) / n) * n);
    for (let i = 0; i < 60; i++, d = addDias(d, n)) { const x = adiante(d, bloqueado); if (x >= desde) return x; }
    return null;
  }
  return a.proxima_data && a.proxima_data >= desde ? a.proxima_data : null;
}

export interface AparelhoRevisita { id: string; proxima?: string | null }
export interface RevisitaInput { desde: string; agenda: AgendaCliente; aparelhos: AparelhoRevisita[]; bloqueado?: (iso: string) => boolean }
export interface Revisita { data: string; aparelhos: string[]; proxima_passagem: string | null }

/**
 * The client's next visit: the LAST pass on or before the earliest due date (never before `desde`; overdue → first pass),
 * carrying every device due before the following pass. Devices without a date (or overdue) count as due on `desde`.
 * Example: weekly route, devices of 7/10/14 days → weekly visits showing only the devices that are due.
 */
export function planejarRevisita(i: RevisitaInput): Revisita | null {
  if (!i.aparelhos.length) return null;
  const bloq = i.bloqueado ?? (() => false);
  const venc = (a: AparelhoRevisita) => (a.proxima && a.proxima > i.desde ? a.proxima : i.desde);
  const primeiro = i.aparelhos.map(venc).sort()[0];
  let p = proximaPassagem(i.agenda, i.desde, bloq);
  if (!p) return null;
  for (let k = 0; k < 400; k++) {
    const n = proximaPassagem(i.agenda, addDias(p, 1), bloq);
    if (!n || n > primeiro) break;
    p = n;
  }
  const prox = proximaPassagem(i.agenda, addDias(p, 1), bloq);
  return { data: p, aparelhos: i.aparelhos.filter((a) => !prox || venc(a) < prox).map((a) => a.id), proxima_passagem: prox };
}

/** Next maintenance dates after a visit: devices serviced in it move to today + their periodicity, the others keep theirs. */
export function aposVisita<T extends AparelhoRevisita & { periodicidade?: string | null }>(aparelhos: T[], atendidos: Iterable<string>, hoje: string,
  proxima: (hoje: string, per?: string | null) => string): T[] {
  const s = new Set(atendidos);
  return aparelhos.map((a) => (s.has(a.id) ? { ...a, proxima: proxima(hoje, a.periodicidade) } : a));
}

/** Client cadence for display: the shortest device periodicity rounded down to whole route weeks (data mode: the rule itself). */
export function cadenciaTexto(periodos: (string | null | undefined)[], a: AgendaCliente): string | null {
  if (a.modo === "data") {
    if (a.regra === "dia_mes" && a.dia_mes) return `Todo dia ${a.dia_mes} do mês (fora da rota)`;
    if (a.regra === "intervalo" && a.intervalo_dias) return `A cada ${a.intervalo_dias} dias (fora da rota)`;
    return a.proxima_data ? `Data marcada: ${a.proxima_data.split("-").reverse().join("/")} (fora da rota)` : "Aguardando data (fora da rota)";
  }
  if (!periodos.length) return null;
  const menor = Math.min(...periodos.map(periodoDias));
  const semanas = Math.max(1, Math.floor(menor / 7));
  if (menor < 7 && a.rota.length > 1) return `A cada passagem da rota (menor periodicidade: ${menor} dias)`;
  return `${semanas === 1 ? "Semanal" : semanas === 2 ? "Quinzenal" : `A cada ${semanas} semanas`} (menor periodicidade: ${menor} dias)`;
}

/** Outside-the-route client still without a usable next date: listed in "Aguardando data" for the manager. */
export function aguardandoData(p: PlanoAgenda & { ativo?: boolean | null }, hoje: string, temVisitaAberta: boolean): boolean {
  if (p.ativo === false || p.modo_agenda !== "data" || temVisitaAberta) return false;
  const a = agendaDoPlano(p, []);
  return proximaPassagem(a, hoje) === null;
}

/** Validated "Atendimento por data" settings from the form (error text or the plan fields). */
export function agendaDataErro(v: { regra?: unknown; proxima_data?: unknown; dia_mes?: unknown; intervalo_dias?: unknown }, hoje: string): string | null {
  if (!REGRAS_DATA.includes(v.regra as RegraData)) return "Escolha como definir as datas";
  if (v.regra === "manual") {
    const d = String(v.proxima_data ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "Informe a próxima data";
    if (d < hoje) return "A próxima data não pode estar no passado";
    if (dow(d) === 0) return "A próxima data cai num domingo";
  }
  if (v.regra === "dia_mes") { const n = Number(v.dia_mes); if (!Number.isInteger(n) || n < 1 || n > 31) return "Dia do mês entre 1 e 31"; }
  if (v.regra === "intervalo") { const n = Number(v.intervalo_dias); if (!Number.isInteger(n) || n < 1 || n > 180) return "Intervalo entre 1 e 180 dias"; }
  return null;
}

/** Devices an already-open visit on `data` should carry: those due before the pass after it (all of them when no later pass is known). */
export function aparelhosDaVisita(data: string, i: RevisitaInput): string[] {
  const venc = (a: AparelhoRevisita) => (a.proxima && a.proxima > i.desde ? a.proxima : i.desde);
  const prox = proximaPassagem(i.agenda, addDias(data, 1), i.bloqueado ?? (() => false));
  return i.aparelhos.filter((a) => !prox || venc(a) < prox).map((a) => a.id);
}
