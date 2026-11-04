import { lateMinutes } from "@/lib/visit-exec";

export interface OpsSchedule { id: string; assigned_to: string | null; scheduled_date: string; start_time: string | null; status: string;
  duracao_min?: number | null; resultado?: string | null }
export interface OpsCheckin { schedule_id: string; fora_do_raio: boolean; sem_permissao: boolean; geolocation_error?: string | null; latitude?: number | null }

export type OpsFilter = "realizadas" | "nao_realizadas" | "atrasadas" | "fora_do_local" | `resultado:${string}`;

/** Week metrics and today's alerts for the manager dashboard. */
export function fieldMetrics(schedules: OpsSchedule[], checkins: OpsCheckin[], now: Date, today: string, weekStart: string) {
  const week = schedules.filter((s) => s.scheduled_date >= weekStart && s.scheduled_date <= today);
  const realizadas = week.filter((s) => s.status === "concluido");
  const durations = realizadas.map((s) => s.duracao_min ?? 0).filter((d) => d > 0);
  const resultados: Record<string, number> = {};
  for (const s of realizadas) if (s.resultado) resultados[s.resultado] = (resultados[s.resultado] ?? 0) + 1;
  const todayList = schedules.filter((s) => s.scheduled_date === today && s.status !== "cancelado");
  const fora = new Set(checkins.filter((c) => c.fora_do_raio || c.sem_permissao || (c.geolocation_error && c.latitude == null)).map((c) => c.schedule_id));
  return {
    realizadas: realizadas.length,
    naoRealizadas: week.filter((s) => s.status === "nao_realizado").length,
    duracaoMedia: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    resultados,
    atrasadas: todayList.filter((s) => lateMinutes(now, s) >= 15).map((s) => s.id),
    foraDoLocal: todayList.filter((s) => fora.has(s.id)).map((s) => s.id),
  };
}

export function matchesFilter(s: OpsSchedule, f: OpsFilter | null, ctx: { atrasadas: string[]; foraDoLocal: string[] }): boolean {
  if (!f) return true;
  if (f === "realizadas") return s.status === "concluido";
  if (f === "nao_realizadas") return s.status === "nao_realizado";
  if (f === "atrasadas") return ctx.atrasadas.includes(s.id);
  if (f === "fora_do_local") return ctx.foraDoLocal.includes(s.id);
  return s.status === "concluido" && s.resultado === f.slice("resultado:".length);
}
