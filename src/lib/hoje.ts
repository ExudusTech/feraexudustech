import type { Schedule } from "@/hooks/use-schedules";

const OPEN = ["agendado", "confirmado", "em_atendimento"];

/** Visits from earlier days still open (in progress or never closed), oldest first, in-progress before the rest. */
export function pendentesAnteriores(list: Schedule[], today: string): Schedule[] {
  return list.filter((s) => s.scheduled_date < today && OPEN.includes(s.status))
    .sort((a, b) => (a.status === "em_atendimento" ? 0 : 1) - (b.status === "em_atendimento" ? 0 : 1) || a.scheduled_date.localeCompare(b.scheduled_date));
}

export function isMine(s: Schedule, userId?: string | null): boolean {
  return !!userId && (s.assigned_to === userId || (!s.assigned_to && s.created_by === userId));
}

/** Groups today's visits by consultant name (unassigned last). */
export function porConsultor(list: Schedule[], names: Map<string, string>): { id: string; nome: string; itens: Schedule[] }[] {
  const g = new Map<string, Schedule[]>();
  list.forEach((s) => { const k = s.assigned_to ?? ""; g.set(k, [...(g.get(k) ?? []), s]); });
  return [...g.entries()].map(([id, itens]) => ({ id, nome: id ? names.get(id) ?? "Consultor" : "Sem responsável", itens }))
    .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.nome.localeCompare(b.nome, "pt-BR"));
}
