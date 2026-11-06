import { SCHEDULE_TYPE_OPTIONS } from "@/lib/service-kind";

export const DEFAULT_VISIT_MINUTES = 60;

export type TargetKind = "cliente" | "lead";
export interface ScheduleTarget {
  kind: TargetKind;
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Manutenção, Entrega e Visita técnica exigem cliente; Visita comercial e instalação de teste (lead ainda não é cliente) aceitam lead. */
export function requiresClient(scheduleType: string, operacao?: string | null): boolean {
  if (scheduleType === "visita_comercial") return false;
  return !(scheduleType === "visita_tecnica" && operacao === "instalacao_teste");
}

export function targetAllowed(scheduleType: string, target: ScheduleTarget | null, operacao?: string | null): boolean {
  if (!target) return false;
  return requiresClient(scheduleType, operacao) ? target.kind === "cliente" : true;
}

export function typeLabel(scheduleType: string): string {
  return SCHEDULE_TYPE_OPTIONS.find((o) => o.value === scheduleType)?.label ?? "Visita";
}

export function autoTitle(scheduleType: string, targetName?: string | null): string {
  const label = typeLabel(scheduleType);
  return targetName ? `${label} — ${targetName}` : label;
}

/** "HH:MM" + minutes, clamped to 23:59. */
export function addMinutes(time: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return "";
  const total = Math.min(Number(m[1]) * 60 + Number(m[2]) + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Only privileged roles may assign the visit to someone else; others always get themselves. */
export function resolveAssignee(roles: string[], userId: string, chosen?: string | null): string {
  const canChoose = roles.some((r) => ["admin", "gestor", "super_admin", "operacional"].includes(r));
  return canChoose && chosen ? chosen : userId;
}

export function searchTargets(targets: ScheduleTarget[], term: string, scheduleType: string, limit = 20, operacao?: string | null): ScheduleTarget[] {
  const t = term.trim().toLowerCase();
  return targets
    .filter((x) => (requiresClient(scheduleType, operacao) ? x.kind === "cliente" : true))
    .filter((x) => !t || [x.name, x.city, x.address].some((f) => f?.toLowerCase().includes(t)))
    .slice(0, limit);
}

export function scheduleFieldsFromTarget(target: ScheduleTarget) {
  return {
    client_id: target.kind === "cliente" ? target.id : null,
    lead_id: target.kind === "lead" ? target.id : null,
    location: [target.address, target.city].filter(Boolean).join(", ") || null,
    zip_code: target.zip_code || null,
    latitude: target.latitude ?? null,
    longitude: target.longitude ?? null,
  };
}
