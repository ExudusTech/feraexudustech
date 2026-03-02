import type { EkkoaCoverageArea } from "@/hooks/use-ekkoa-coverage-areas";
import type { Schedule } from "@/hooks/use-schedules";

/**
 * Maps dia_semana strings to JS Date.getDay() numbers (0=Sun, 1=Mon, ..., 6=Sat)
 */
const DAY_MAP: Record<string, number> = {
  "domingo": 0,
  "2ª feira": 1,
  "3ª feira": 2,
  "4ª feira": 3,
  "5ª feira": 4,
  "6ª feira": 5,
  "sábado": 6,
};

/**
 * Parses dia_semana string (may be compound like "3ª feira e 5ª feira") into array of JS day numbers
 */
export function parseDiaSemana(diaSemana: string | null): number[] {
  if (!diaSemana) return [];
  const parts = diaSemana.split(" e ").map((s) => s.trim().toLowerCase());
  return parts.map((p) => DAY_MAP[p]).filter((n) => n !== undefined);
}

/**
 * Given a matched coverage area, return the allowed JS day numbers
 */
export function getAllowedDays(area: EkkoaCoverageArea | null): number[] {
  if (!area?.dia_semana) return [];
  return parseDiaSemana(area.dia_semana);
}

/**
 * Check if a date string (YYYY-MM-DD) falls on an allowed day
 */
export function isDateAllowed(dateStr: string, allowedDays: number[]): boolean {
  if (allowedDays.length === 0) return true; // no restriction
  const date = new Date(dateStr + "T12:00:00"); // avoid timezone issues
  return allowedDays.includes(date.getDay());
}

/**
 * Get next N allowed dates from today, given allowed day numbers
 */
export function getNextAllowedDates(allowedDays: number[], count: number = 30): string[] {
  if (allowedDays.length === 0) return [];
  const dates: string[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  
  // Start from tomorrow
  const current = new Date(today);
  current.setDate(current.getDate() + 1);
  
  let safety = 0;
  while (dates.length < count && safety < 365) {
    if (allowedDays.includes(current.getDay())) {
      dates.push(current.toISOString().split("T")[0]);
    }
    current.setDate(current.getDate() + 1);
    safety++;
  }
  return dates;
}

/**
 * Get time window from a coverage area
 */
export function getTimeWindow(area: EkkoaCoverageArea | null): { start: string; end: string } | null {
  if (!area?.horario_inicio || !area?.horario_fim) return null;
  return {
    start: area.horario_inicio.slice(0, 5), // "HH:MM"
    end: area.horario_fim.slice(0, 5),
  };
}

/**
 * Check if a proposed schedule overlaps with existing schedules for the same assignee
 */
export function hasScheduleOverlap(
  schedules: Schedule[],
  assignedTo: string,
  date: string,
  startTime: string | null,
  endTime: string | null,
  excludeId?: string,
): boolean {
  if (!startTime) return false; // without time, can't check overlap
  
  const sameDay = schedules.filter(
    (s) =>
      s.id !== excludeId &&
      s.assigned_to === assignedTo &&
      s.scheduled_date === date &&
      s.status !== "cancelado" &&
      s.start_time
  );

  const proposedStart = timeToMinutes(startTime);
  const proposedEnd = endTime ? timeToMinutes(endTime) : proposedStart + 60; // default 1h

  return sameDay.some((s) => {
    const existingStart = timeToMinutes(s.start_time!);
    const existingEnd = s.end_time ? timeToMinutes(s.end_time) : existingStart + 60;
    // Overlap: starts before existing ends AND ends after existing starts
    return proposedStart < existingEnd && proposedEnd > existingStart;
  });
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Generate allowed time slots (every 30 min) within a time window
 */
export function generateTimeSlots(
  startTime: string,
  endTime: string,
  intervalMinutes: number = 30
): string[] {
  const slots: string[] = [];
  let current = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  while (current <= end) {
    const h = Math.floor(current / 60).toString().padStart(2, "0");
    const m = (current % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    current += intervalMinutes;
  }
  return slots;
}

/**
 * Find the coverage area that matches a CEP
 */
export function findCoverageAreaByCep(
  cep: string,
  areas: EkkoaCoverageArea[]
): EkkoaCoverageArea | null {
  const normalized = cep.replace(/\D/g, "");
  if (normalized.length !== 8) return null;

  const activeAreas = areas.filter((a) => a.is_active);
  return activeAreas.find((a) => {
    if (!a.zip_code_start) return false;
    const start = a.zip_code_start.replace(/\D/g, "");
    const end = a.zip_code_end ? a.zip_code_end.replace(/\D/g, "") : start;
    return normalized >= start && normalized <= end;
  }) || null;
}

/**
 * Fetch address info from ViaCEP API
 */
export interface ViaCepResult {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export async function fetchViaCep(cep: string): Promise<ViaCepResult | null> {
  const normalized = cep.replace(/\D/g, "");
  if (normalized.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${normalized}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return data as ViaCepResult;
  } catch {
    return null;
  }
}
