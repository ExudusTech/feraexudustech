// Pure helpers for field execution of agenda visits (check-in, check-out, confirmations, alerts).
// No Deno/npm imports so vitest can load it.
export const FERA_URL = "https://fera.exudustech.com.br";
export const STATUSES = ["agendado", "confirmado", "em_atendimento", "concluido", "nao_realizado", "cancelado"] as const;
export type VisitStatus = typeof STATUSES[number];
export const RESULTADOS_COMERCIAL = ["boa", "mediana", "ruim"] as const;
export const RESULTADOS_TECNICO = ["concluida", "com_problema"] as const;
export const PROXIMOS = ["novo_agendamento", "proposta", "follow_up", "perdido"] as const;
export type ProximoPasso = typeof PROXIMOS[number];
export const NAO_REALIZADO = ["cliente_ausente", "cancelado_no_local", "reagendar"] as const;

export const RESULT_LABEL: Record<string, string> = { boa: "Visita boa", mediana: "Visita mediana", ruim: "Visita ruim",
  concluida: "Concluída", com_problema: "Concluída com problema" };
export const NEXT_LABEL: Record<string, string> = { novo_agendamento: "Novo agendamento", proposta: "Enviar proposta",
  follow_up: "Follow-up", perdido: "Perdido" };
export const NAO_REALIZADO_LABEL: Record<string, string> = { cliente_ausente: "Cliente ausente", cancelado_no_local: "Cancelado no local", reagendar: "Reagendar" };

/** Distance in meters between two coordinates (Haversine). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6_371_000; const rad = (d: number) => d * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

export interface CheckinEval { distancia_m: number | null; fora_do_raio: boolean; sem_permissao: boolean; precisa_justificativa: boolean }

/** Decides whether a check-in needs a written reason: no location permission, or farther than the allowed radius. */
export function evaluateCheckin(pos: { lat?: number | null; lng?: number | null } | null, target: { lat?: number | null; lng?: number | null },
  raio = 300): CheckinEval {
  const valid = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!pos || !valid(pos.lat) || !valid(pos.lng)) return { distancia_m: null, fora_do_raio: false, sem_permissao: true, precisa_justificativa: true };
  if (!valid(target.lat) || !valid(target.lng)) return { distancia_m: null, fora_do_raio: false, sem_permissao: false, precisa_justificativa: false };
  const d = distanceMeters(pos.lat!, pos.lng!, target.lat!, target.lng!);
  const fora = d > raio;
  return { distancia_m: d, fora_do_raio: fora, sem_permissao: false, precisa_justificativa: fora };
}

export function durationMinutes(checkin: string | Date, checkout: string | Date): number {
  const ms = new Date(checkout).getTime() - new Date(checkin).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : 0;
}

/** True for service kinds that require a photo of the equipment (maintenance, installation/test, delivery). */
export function requiresPhoto(type?: string | null, subtype?: string | null): boolean {
  const t = `${type ?? ""} ${subtype ?? ""}`.toLowerCase();
  return /manutenc|instalac|teste|entrega|reposic|retirada/.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

export function isTechnical(type?: string | null, subtype?: string | null): boolean { return requiresPhoto(type, subtype); }

const PERIOD_MONTHS: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
/** Next maintenance date from today and the loan's periodicity (default monthly). */
export function nextMaintenance(today: string, periodicidade?: string | null): string {
  const key = (periodicidade ?? "mensal").toLowerCase().trim();
  const days = /^\d+$/.test(key) ? Number(key) : null;
  const d = new Date(`${today}T12:00:00Z`);
  if (days) d.setUTCDate(d.getUTCDate() + days);
  else d.setUTCMonth(d.getUTCMonth() + (PERIOD_MONTHS[key] ?? 1));
  return d.toISOString().slice(0, 10);
}

/** Lead stage key the visit outcome should move the lead to (null = stay). */
export function stageForCheckout(commercial: boolean, proximo: ProximoPasso): string | null {
  if (proximo === "perdido") return "perdido";
  return commercial ? "visita_realizada" : null;
}

export interface CheckoutInput { status?: string; resultado?: string; resumo?: string; proximo?: string; data_alvo?: string | null;
  motivo_perda?: string | null; confirmar_perdido?: boolean; commercial: boolean; fotos: number; precisa_foto: boolean }
/** Returns an error message, or null when the check-out can be saved. */
export function validateCheckout(i: CheckoutInput): string | null {
  if (i.status !== "em_atendimento") return "Inicie o atendimento antes de encerrar";
  const allowed: readonly string[] = i.commercial ? RESULTADOS_COMERCIAL : RESULTADOS_TECNICO;
  if (!allowed.includes(i.resultado ?? "")) return "Escolha o resultado";
  const resumo = (i.resumo ?? "").trim();
  if (resumo.length < 3 || resumo.length > 500) return "Escreva um resumo curto";
  if (!PROXIMOS.includes(i.proximo as ProximoPasso)) return "Defina o próximo passo";
  if (i.proximo === "follow_up" && !/^\d{4}-\d{2}-\d{2}$/.test(i.data_alvo ?? "")) return "Informe a data do follow-up";
  if (i.proximo === "perdido" && ((i.motivo_perda ?? "").trim().length < 3 || i.confirmar_perdido !== true)) return "Informe e confirme o motivo da perda";
  if (i.precisa_foto && i.fotos < 1) return "Tire ao menos uma foto do equipamento";
  return null;
}

const clean = (v: unknown) => typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, 240) : "";

export interface VisitInfo { id: string; cliente: string; consultor: string; tipo: string }
export function checkoutMessage(v: VisitInfo & { resultado: string; duracao: number; distancia: number | null; proximo: string; detalhe?: string | null }): string {
  return ["✅ Visita encerrada", `Cliente: ${clean(v.cliente) || "Não informado"}`, `Consultor: ${clean(v.consultor)}`,
    `Tipo: ${clean(v.tipo)}`, `Resultado: ${RESULT_LABEL[v.resultado] ?? clean(v.resultado)}`, `Duração: ${v.duracao} min`,
    `Distância no check-in: ${v.distancia === null ? "sem localização" : `${v.distancia} m`}`,
    `Próximo passo: ${NEXT_LABEL[v.proximo] ?? clean(v.proximo)}${v.detalhe ? ` (${clean(v.detalhe)})` : ""}`,
    `Ver no Fera: ${FERA_URL}/agenda?agendamento=${v.id}`, "", "(Mensagem automática — não responda aqui; abra o link.)"].join("\n");
}
export function checkinAlertMessage(v: VisitInfo & { distancia: number | null; justificativa: string }): string {
  return ["📍 Check-in fora do local", `Cliente: ${clean(v.cliente) || "Não informado"}`, `Consultor: ${clean(v.consultor)}`,
    v.distancia === null ? "Localização: não autorizada" : `Distância: ${v.distancia} m do endereço`, `Justificativa: ${clean(v.justificativa)}`,
    `Ver no Fera: ${FERA_URL}/agenda?agendamento=${v.id}`, "", "(Mensagem automática — não responda aqui; abra o link.)"].join("\n");
}
export function lateAlertMessage(v: VisitInfo & { hora: string; minutos: number }): string {
  return [`⏱️ Visita sem check-in há ${v.minutos} min`, `Cliente: ${clean(v.cliente) || "Não informado"}`, `Consultor: ${clean(v.consultor)}`,
    `Horário: ${clean(v.hora).slice(0, 5)}`, `Ver no Fera: ${FERA_URL}/agenda?agendamento=${v.id}`, "", "(Mensagem automática — não responda aqui; abra o link.)"].join("\n");
}
export function noConfirmationMessage(v: VisitInfo & { hora: string }): string {
  return ["❔ Cliente não confirmou a visita", `Cliente: ${clean(v.cliente) || "Não informado"}`, `Horário: hoje às ${clean(v.hora).slice(0, 5)}`,
    "Vale ligar antes de sair.", `Ver no Fera: ${FERA_URL}/agenda?agendamento=${v.id}`, "", "(Mensagem automática — não responda aqui; abra o link.)"].join("\n");
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
function hourLabel(t: string) { const [h, m] = t.split(":"); return `${Number(h)}h${m && m !== "00" ? m : ""}`; }
export function confirmationMessage(kind: "d1" | "dia", date: string, time: string, empresa?: string | null): string {
  const dow = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const [, mm, dd] = date.split("-");
  const when = kind === "d1" ? `amanhã (${dow}, ${dd}/${mm}) às ${hourLabel(time)}` : `hoje às ${hourLabel(time)}`;
  return `Olá! Aqui é a Flora, da NitsClean. Passando para lembrar da visita ${when}${empresa ? ` no ${clean(empresa)}` : ""}. ` +
    `Pode confirmar? Responda "confirmo" ou "preciso remarcar".`;
}

/** Wall-clock (America/Sao_Paulo is UTC-3, no DST since 2019) → UTC instant. */
export function spInstant(date: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 3) * 60 + (m || 0)) * 60_000);
}

export type ConfirmationDue = "d1" | "dia" | "sem_resposta" | null;
/**
 * Which confirmation step is due now for a visit. D-1 at the configured hour the day before (only inside human hours),
 * same-day N hours before, and "no answer" alert 1h before the visit.
 */
export function confirmationDue(now: Date, s: { scheduled_date: string; start_time: string | null; confirmacao_status: string;
  d1_sent: boolean; dia_sent: boolean; sem_resposta_alertado: boolean }, cfg: { d1_hora: string; horas_antes: number }, openNow: boolean): ConfirmationDue {
  if (!s.start_time || s.confirmacao_status === "nao_aplicavel" || s.confirmacao_status === "confirmado") return null;
  const visit = spInstant(s.scheduled_date, s.start_time).getTime();
  const t = now.getTime();
  if (t >= visit) return null;
  if (s.confirmacao_status === "pendente" && !s.sem_resposta_alertado && (s.d1_sent || s.dia_sent) && t >= visit - 60 * 60_000) return "sem_resposta";
  if (s.confirmacao_status !== "pendente") return null;
  const prev = new Date(Date.parse(`${s.scheduled_date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const d1 = spInstant(prev, cfg.d1_hora).getTime();
  if (!s.d1_sent && !s.dia_sent && t >= d1 && t < visit - cfg.horas_antes * 3_600_000 && openNow) return "d1";
  if (!s.dia_sent && t >= visit - cfg.horas_antes * 3_600_000 && t < visit - 60 * 60_000 && openNow) return "dia";
  return null;
}

/** Minutes a not-started visit is late (0 when not late or already started/finished). */
export function lateMinutes(now: Date, s: { scheduled_date: string; start_time: string | null; status: string }): number {
  if (!s.start_time || !["agendado", "confirmado"].includes(s.status)) return 0;
  const diff = (now.getTime() - spInstant(s.scheduled_date, s.start_time).getTime()) / 60_000;
  return diff > 0 ? Math.floor(diff) : 0;
}
