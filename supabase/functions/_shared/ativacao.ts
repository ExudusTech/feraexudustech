// Ordem A (11/11): batch activation visits for the existing installed base. Pure (no Deno/npm imports) so vitest and base-instalada share it.
// One "Ativação da base" occurrence per client, for the chosen consultant, on the first route day of the client's region that is
// not a holiday / Google all-day block, has a free slot (Fera + Google timed busy) and still has room under the daily cap.
import { primeiroSlotLivre, addDias, hhmm, type Ocupado } from "./agenda-slot.ts";
import { areaDoCliente, cidadeChave, parseDiaSemana, type AreaRota } from "./base-instalada.ts";

export const MAX_ATIVACOES_DIA = 8;
export const HORIZONTE_ATIVACAO = 90;

export interface ClienteAtivacao { id: string; nome: string; cidade?: string | null; cep?: string | null }
export interface AreaAtivacao extends AreaRota { horario_inicio?: string | null; horario_fim?: string | null }
export interface PlanoAtivacaoInput {
  clientes: ClienteAtivacao[];
  areas: AreaAtivacao[];
  desde: string;                                // first day searched (AAAA-MM-DD)
  maxPorDia?: number;                           // activations per day for the consultant (default 8)
  ocupados: Ocupado[];                          // consultant's active Fera schedules
  ativacoesExistentes?: Record<string, number>; // activations already booked for the consultant, per day
  google?: { start: number; end: number }[];    // Google timed busy (epoch ms)
  feriados?: { date: string; city?: string | null }[]; // holidays + Google all-day blocks (holidays table)
  duracao?: number;                             // minutes per activation (default 60)
}
export interface LinhaAtivacao { client_id: string; nome: string; cidade: string | null; regiao: string | null; data?: string; hora?: string; fim?: string; erro?: string }

/** Daily cap from the form: integer 1–30, default 8. */
export function maxPorDiaValido(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 30 ? n : MAX_ATIVACOES_DIA;
}

export function planejarAtivacoes(i: PlanoAtivacaoInput): LinhaAtivacao[] {
  const max = maxPorDiaValido(i.maxPorDia ?? MAX_ATIVACOES_DIA);
  const dur = i.duracao ?? 60;
  const ocupados: Ocupado[] = [...i.ocupados];
  const porDia: Record<string, number> = { ...(i.ativacoesExistentes ?? {}) };
  const comArea = i.clientes.map((c) => ({ c, area: areaDoCliente(i.areas, c.cep, c.cidade) }));
  // Same region together, then by name, so a route day fills with neighbours.
  comArea.sort((a, b) => (a.area?.name ?? "~").localeCompare(b.area?.name ?? "~", "pt-BR") || a.c.nome.localeCompare(b.c.nome, "pt-BR"));
  return comArea.map(({ c, area }) => {
    const base = { client_id: c.id, nome: c.nome, cidade: c.cidade ?? null, regiao: area?.name ?? null };
    if (!area) return { ...base, erro: "Cidade sem região de rota cadastrada" };
    const cidade = cidadeChave(c.cidade);
    const feriado = (d: string) => (i.feriados ?? []).some((h) => h.date === d && (!h.city || cidadeChave(h.city) === cidade));
    const slot = primeiroSlotLivre({ from: i.desde, rota: parseDiaSemana(area.dia_semana), inicio: area.horario_inicio, fim: area.horario_fim, duracao: dur,
      ocupados, google: i.google ?? [], bloqueado: (d) => feriado(d) || (porDia[d] ?? 0) >= max, horizonte: HORIZONTE_ATIVACAO });
    if (!slot) return { ...base, erro: `Sem dia de rota livre nos próximos ${HORIZONTE_ATIVACAO} dias` };
    const [h, m] = slot.hora.split(":").map(Number);
    const fim = hhmm(h * 60 + m + dur);
    ocupados.push({ data: slot.data, inicio: slot.hora, fim });
    porDia[slot.data] = (porDia[slot.data] ?? 0) + 1;
    return { ...base, data: slot.data, hora: slot.hora, fim };
  });
}

export { addDias };
