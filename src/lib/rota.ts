import { parseDiaSemana } from "@/lib/scheduling-utils";

export interface Ponto { latitude: number; longitude: number }
export interface RotaBase extends Ponto { nome: string }

/** Default departure point when the organization has not set one (organizations.rota_base). */
export const ROTA_BASE_PADRAO: RotaBase = { nome: "Base Cabo Frio", latitude: -22.8794, longitude: -42.0186 };

export function rotaBaseDe(value: unknown): RotaBase {
  const v = value as Partial<RotaBase> | null;
  return v && Number.isFinite(Number(v.latitude)) && Number.isFinite(Number(v.longitude))
    ? { nome: String(v.nome || "Base"), latitude: Number(v.latitude), longitude: Number(v.longitude) } : ROTA_BASE_PADRAO;
}

export const temCoordenadas = (p: { latitude?: unknown; longitude?: unknown } | null | undefined): p is Ponto =>
  !!p && typeof p.latitude === "number" && typeof p.longitude === "number" && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

/** Great-circle distance in km. */
export function distanciaKm(a: Ponto, b: Ponto): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Greedy nearest-neighbor order starting at `inicio`. Ties keep the input order. */
export function vizinhoMaisProximo<T extends Ponto>(inicio: Ponto, pontos: T[]): T[] {
  const resto = [...pontos], ordem: T[] = [];
  let atual: Ponto = inicio;
  while (resto.length) {
    let melhor = 0;
    for (let i = 1; i < resto.length; i++) if (distanciaKm(atual, resto[i]) < distanciaKm(atual, resto[melhor])) melhor = i;
    atual = resto.splice(melhor, 1)[0];
    ordem.push(atual as T);
  }
  return ordem;
}

export interface Parada extends Ponto { id: string; checkin_em?: string | null }

/**
 * Stop order for one consultant's day: visits already checked in come first in real check-in order;
 * the rest follow a nearest-neighbor suggestion from the last check-in (or from the base when none).
 * `reais` = how many leading stops are real.
 */
export function ordemDaRota<T extends Parada>(base: Ponto, paradas: T[]): { ordem: T[]; reais: number } {
  const feitas = paradas.filter((p) => p.checkin_em).sort((a, b) => String(a.checkin_em).localeCompare(String(b.checkin_em)));
  const pendentes = paradas.filter((p) => !p.checkin_em);
  const inicio = feitas.length ? feitas[feitas.length - 1] : base;
  return { ordem: [...feitas, ...vizinhoMaisProximo(inicio, pendentes)], reais: feitas.length };
}

export const DIAS_UTEIS = [
  { dow: 1, curto: "Seg", nome: "segunda" }, { dow: 2, curto: "Ter", nome: "terça" }, { dow: 3, curto: "Qua", nome: "quarta" },
  { dow: 4, curto: "Qui", nome: "quinta" }, { dow: 5, curto: "Sex", nome: "sexta" },
] as const;

/** Coverage areas that route on a weekday (JS 0–6), optionally only those of a consultant (or with none set). */
export function regioesDoDia<A extends { dia_semana: string | null; is_active?: boolean; consultant_user_id?: string | null }>(
  areas: A[], dow: number, consultor?: string | null): A[] {
  return areas.filter((a) => a.is_active !== false && parseDiaSemana(a.dia_semana).includes(dow)
    && (!consultor || !a.consultant_user_id || a.consultant_user_id === consultor));
}

const fold = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
/** Same city, tolerant to accents and notes like "Bacaxá (Saquarema)" / "Cabo Frio 2º Distrito". */
export function cidadeNaRegiao(cidade: unknown, regiaoCidade: unknown): boolean {
  const c = fold(cidade), r = fold(regiaoCidade);
  if (!c || !r) return false;
  return c === r || r.startsWith(`${c} `) || c.startsWith(`${r} `);
}
