// First free visit slot: region route day, region time band, consultant's Fera schedules, Google busy, holidays/blocks.
// Pure (no I/O) so the collection follow-ups and tests use the same rule; null = no valid slot, caller must not book.

export interface Ocupado { data: string; inicio: string; fim?: string | null }
export interface SlotInput {
  from: string;                       // spoken date (AAAA-MM-DD); search starts here
  rota: number[];                     // route weekdays (0=Sun); empty = Mon–Sat
  inicio?: string | null;             // region band start "HH:MM"
  fim?: string | null;                // region band end "HH:MM"
  duracao?: number;                   // minutes
  ocupados: Ocupado[];                // consultant's active Fera schedules
  google: { start: number; end: number }[]; // Google timed busy (epoch ms)
  bloqueado: (iso: string) => boolean;      // holiday / Google all-day block
  horizonte?: number;                 // days searched
  passo?: number;                     // minutes between candidate starts
}

const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
export const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export function primeiroSlotLivre(i: SlotInput): { data: string; hora: string } | null {
  const dur = i.duracao ?? 60, passo = i.passo ?? 30;
  const a = toMin(i.inicio ?? "08:00"), b = toMin(i.fim ?? "18:00");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b - a < dur) return null;
  let d = i.from;
  for (let k = 0; k < (i.horizonte ?? 60); k++, d = addDias(d, 1)) {
    const w = dow(d);
    if (w === 0 || (i.rota.length && !i.rota.includes(w)) || i.bloqueado(d)) continue;
    const dia = i.ocupados.filter((o) => o.data === d);
    for (let t = a; t + dur <= b; t += passo) {
      const clash = dia.some((o) => { const s = toMin(o.inicio); const e = o.fim ? toMin(o.fim) : s + 60; return t < e && s < t + dur; });
      if (clash) continue;
      const s = Date.parse(`${d}T${hhmm(t)}:00-03:00`), e = s + dur * 60_000;
      if (i.google.some((g) => s < g.end && g.start < e)) continue;
      return { data: d, hora: hhmm(t) };
    }
  }
  return null;
}

/** Text of the pending task when no valid slot exists. */
export function pendenciaAgendar(tipoLabel: string, codigo: string | null | undefined): string {
  return `Agendar ${tipoLabel} — #${codigo ?? "OC"}`;
}
