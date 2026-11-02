import { gravidade, minutosUteis, type ClosedDay, type HumanHoursConfig } from "@/lib/business-hours";

export interface MetricItem {
  id: string; lead_id: string | null; status: string; tipo: string; canal: string | null; resultado: string | null;
  relogio_inicia_em: string; assumido_em: string | null; resolvido_em: string | null; aberto_em: string;
}
export interface Service { config: HumanHoursConfig; closed: ClosedDay[]; city: string | null; amarelo: number; vermelho: number }

/** Business minutes the client has been waiting (until someone assumed it, or until now). */
export function esperaMinutos(item: Pick<MetricItem, "relogio_inicia_em" | "assumido_em">, svc: Service, now = new Date()): number {
  const end = item.assumido_em ? new Date(item.assumido_em) : now;
  return minutosUteis(new Date(item.relogio_inicia_em), end, svc.config, svc.closed, svc.city);
}

export function nivel(item: Pick<MetricItem, "relogio_inicia_em" | "assumido_em">, svc: Service, now = new Date()) {
  return gravidade(esperaMinutos(item, svc, now), svc.amarelo, svc.vermelho);
}

const RANK = { vermelho: 0, amarelo: 1, verde: 2 } as const;
/** Open first by severity, then longest wait. */
export function ordenarAgora<T extends MetricItem>(items: T[], svc: Service, now = new Date()): T[] {
  return items.filter((i) => i.status === "aberto" || i.status === "em_atendimento")
    .map((i) => ({ i, m: esperaMinutos(i, svc, now), n: nivel(i, svc, now), s: i.status === "aberto" ? 0 : 1 }))
    .sort((a, b) => a.s - b.s || RANK[a.n] - RANK[b.n] || b.m - a.m)
    .map((x) => x.i);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b); const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
const avg = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
const countBy = (items: MetricItem[], key: (i: MetricItem) => string) =>
  items.reduce<Record<string, number>>((acc, i) => { const k = key(i); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});

export function calcularMetricas(items: MetricItem[], svc: Service, schedules: Array<{ lead_id: string | null; created_at: string }> = [], now = new Date()) {
  const assumidos = items.filter((i) => i.assumido_em);
  const tempoAssumir = assumidos.map((i) => esperaMinutos(i, svc, now));
  const resolvidos = items.filter((i) => i.resolvido_em && i.status === "resolvido");
  const tempoResolver = resolvidos.map((i) => minutosUteis(new Date(i.relogio_inicia_em), new Date(i.resolvido_em!), svc.config, svc.closed, svc.city));
  const respondidos10 = items.length ? Math.round((items.filter((i) => i.assumido_em && esperaMinutos(i, svc, now) <= 10).length / items.length) * 100) : 0;
  const comAgendamento = items.filter((i) => i.lead_id && schedules.some((s) => s.lead_id === i.lead_id && s.created_at >= i.aberto_em)).length;
  return {
    total: items.length,
    porStatus: countBy(items, (i) => i.status),
    respondidosAte10Pct: respondidos10,
    assumirMedio: avg(tempoAssumir), assumirMediano: median(tempoAssumir),
    resolverMedio: avg(tempoResolver), resolverMediano: median(tempoResolver),
    porGravidade: countBy(items, (i) => nivel(i, svc, now)),
    porMotivo: countBy(items, (i) => i.tipo),
    porCanal: countBy(items, (i) => i.canal ?? "—"),
    porResultado: countBy(items.filter((i) => i.resultado), (i) => i.resultado!),
    comAgendamentoDepois: comAgendamento,
  };
}
