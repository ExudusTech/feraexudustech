// BEGIN business-hours (pure; the mcp function embeds an identical copy — keep in sync, a test enforces it)
export interface HumanHoursConfig { days: number[]; start: string; end: string; timezone: string }
export interface ClosedDay { date: string; city: string | null }
export interface NextOpening { at: Date; date: string; label: string; labelComArtigo: string }

const BH_DEFAULT: HumanHoursConfig = { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", timezone: "America/Sao_Paulo" };
const BH_WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function normalizeHumanHours(raw: unknown, timezone?: unknown): HumanHoursConfig {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const time = (v: unknown, fallback: string) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
  const days = Array.isArray(value.days) ? value.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : BH_DEFAULT.days;
  const start = time(value.start, BH_DEFAULT.start);
  let end = time(value.end, BH_DEFAULT.end);
  if (bhMinutes(end) <= bhMinutes(start)) end = BH_DEFAULT.end;
  return { days: days.length ? Array.from(new Set(days)).sort() : BH_DEFAULT.days, start, end,
    timezone: typeof timezone === "string" && timezone ? timezone : BH_DEFAULT.timezone };
}

function bhMinutes(time: string): number { const [h, m] = time.split(":").map(Number); return h * 60 + m; }

function bhParts(date: Date, timezone: string): { ymd: string; dow: number; minutes: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(date).map(p => [p.type, p.value]));
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return { ymd, dow, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** UTC instant for a wall-clock time in the given zone. */
function bhZoned(ymd: string, minutes: number, timezone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const local = bhParts(new Date(guess), timezone);
  const [ly, lm, ld] = local.ymd.split("-").map(Number);
  const offset = Date.UTC(ly, lm - 1, ld, Math.floor(local.minutes / 60), local.minutes % 60) - guess;
  return new Date(guess - offset);
}

function bhAddDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function bhCityKey(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isClosedDate(ymd: string, config: HumanHoursConfig, closed: ClosedDay[], city?: string | null): boolean {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  if (!config.days.includes(dow)) return true;
  return closed.some(day => day.date === ymd && (day.city === null || (typeof city === "string" && bhCityKey(day.city) === bhCityKey(city))));
}

export function estaEmHorario(now: Date, config: HumanHoursConfig, closed: ClosedDay[], city?: string | null): boolean {
  const local = bhParts(now, config.timezone);
  if (isClosedDate(local.ymd, config, closed, city)) return false;
  return local.minutes >= bhMinutes(config.start) && local.minutes < bhMinutes(config.end);
}

function bhLabel(ymd: string, start: string): { label: string; labelComArtigo: string } {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  const [, mm, dd] = ymd.split("-");
  const [h, m] = start.split(":");
  const hour = `${Number(h)}h${m === "00" ? "" : m}`;
  const label = `${BH_WEEKDAYS[dow]}, ${dd}/${mm}, a partir das ${hour}`;
  return { label, labelComArtigo: `${dow === 0 || dow === 6 ? "no" : "na"} ${label}` };
}

/** Start of the next human-service period (now itself when currently open). */
export function proximoHorarioUtil(now: Date, config: HumanHoursConfig, closed: ClosedDay[], city?: string | null): NextOpening {
  const local = bhParts(now, config.timezone);
  const start = bhMinutes(config.start);
  if (estaEmHorario(now, config, closed, city)) {
    return { at: now, date: local.ymd, ...bhLabel(local.ymd, config.start) };
  }
  for (let i = 0; i < 400; i++) {
    const ymd = bhAddDays(local.ymd, i);
    if (isClosedDate(ymd, config, closed, city)) continue;
    if (i === 0 && local.minutes >= start) continue;
    return { at: bhZoned(ymd, start, config.timezone), date: ymd, ...bhLabel(ymd, config.start) };
  }
  const fallback = bhAddDays(local.ymd, 1);
  return { at: bhZoned(fallback, start, config.timezone), date: fallback, ...bhLabel(fallback, config.start) };
}

/** Minutes between two instants that fall inside human-service windows. */
export function minutosUteis(from: Date, to: Date, config: HumanHoursConfig, closed: ClosedDay[], city?: string | null): number {
  if (!(to.getTime() > from.getTime())) return 0;
  let total = 0;
  let ymd = bhParts(from, config.timezone).ymd;
  const lastYmd = bhParts(to, config.timezone).ymd;
  for (let guard = 0; guard < 800 && ymd <= lastYmd; guard++, ymd = bhAddDays(ymd, 1)) {
    if (isClosedDate(ymd, config, closed, city)) continue;
    const open = bhZoned(ymd, bhMinutes(config.start), config.timezone).getTime();
    const close = bhZoned(ymd, bhMinutes(config.end), config.timezone).getTime();
    const a = Math.max(open, from.getTime());
    const b = Math.min(close, to.getTime());
    if (b > a) total += (b - a) / 60_000;
  }
  return Math.floor(total);
}

export function gravidade(minutos: number, amarelo = 15, vermelho = 60): "verde" | "amarelo" | "vermelho" {
  return minutos > vermelho ? "vermelho" : minutos > amarelo ? "amarelo" : "verde";
}
// END business-hours
