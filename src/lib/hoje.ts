import type { Schedule } from "@/hooks/use-schedules";

const OPEN = ["agendado", "confirmado", "em_atendimento"];
const SEM_CHECKIN = ["agendado", "confirmado"];

/** True when a visit scheduled for today is past its start time and has no check-in yet. */
export function isAtrasada(s: Pick<Schedule, "scheduled_date" | "start_time" | "status">, today: string, nowHHMM: string): boolean {
  return s.scheduled_date === today && SEM_CHECKIN.includes(s.status) && !!s.start_time && s.start_time.slice(0, 5) < nowHHMM;
}

/** Today's visits: 1) overdue (no check-in) & in-progress first; 2) remaining visits in start_time order. */
export function ordenarHoje(list: Schedule[], today: string, nowHHMM: string): Schedule[] {
  const prio = (s: Schedule) => (s.status === "em_atendimento" || isAtrasada(s, today, nowHHMM)) ? 0 : 1;
  return list
    .filter((s) => s.scheduled_date === today && s.status !== "cancelado")
    .sort((a, b) => prio(a) - prio(b) || (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99"));
}

/** Visits from earlier days still open (in progress or never closed), oldest first, in-progress before the rest. */
export function pendentesAnteriores(list: Schedule[], today: string): Schedule[] {
  return list.filter((s) => s.scheduled_date < today && OPEN.includes(s.status))
    .sort((a, b) => (a.status === "em_atendimento" ? 0 : 1) - (b.status === "em_atendimento" ? 0 : 1) || a.scheduled_date.localeCompare(b.scheduled_date));
}

export function isMine(s: Schedule, userId?: string | null): boolean {
  return !!userId && (s.assigned_to === userId || (!s.assigned_to && s.created_by === userId));
}

/** Groups today's visits by consultant name (unassigned last). */
export function porConsultor(list: Schedule[], names: Map<string, string>, today?: string, nowHHMM?: string): { id: string; nome: string; itens: Schedule[] }[] {
  const g = new Map<string, Schedule[]>();
  const ordered = today && nowHHMM ? ordenarHoje(list, today, nowHHMM) : list;
  ordered.forEach((s) => { const k = s.assigned_to ?? ""; g.set(k, [...(g.get(k) ?? []), s]); });
  return [...g.entries()].map(([id, itens]) => ({ id, nome: id ? names.get(id) ?? "Consultor" : "Sem responsável", itens }))
    .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.nome.localeCompare(b.nome, "pt-BR"));
}
