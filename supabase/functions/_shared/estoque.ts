// Inventory of devices (dispensers) from products.stock (decided 10/11: no inventory_items, no parallel table).
// Pure helpers shared by the Stock tab (src/lib/estoque.ts re-exports) and tests. The database (comodato_estoque trigger)
// is the source of truth for the stored balance; these helpers compute reservations and alerts for display.

/** Device statuses that are out of stock: installed (ATIVO/EM_TESTE) or removed waiting for the return invoice (RETIRADO). */
export const STATUS_FORA_ESTOQUE = ["ATIVO", "EM_TESTE", "RETIRADO"];
/** Visit statuses that still hold a reservation. */
export const STATUS_VISITA_RESERVA = ["agendado", "confirmado", "em_atendimento"];
/** Operations that take devices to the client. */
export const OPERACOES_COM_APARELHO = ["instalacao_teste", "instalacao_definitiva", "substituicao", "entrega"];

export function qtdAparelhos(q: unknown): number {
  const n = parseInt(String(q ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(9999, n) : 1;
}

export interface VisitaReserva { id: string; status: string; scheduled_date: string; operacao_material?: string | null; itens?: unknown }
export interface OrdemReserva { id: string; status: string; item_product_id?: string | null; quantidade?: string | null; schedule_id?: string | null; resolvida_schedule_id?: string | null }
export interface AparelhoReserva { id: string; product_id?: string | null; status?: string | null; quantidade?: string | null; etiqueta_numero?: number | null;
  ocorrencia_schedule_id?: string | null; reserva_os_id?: string | null }
export interface LinhaReserva { origem: "visita" | "ordem"; ref_id: string; product_id: string; quantidade: number; separados: number[] }
export interface ReservaProduto { reservados: number; separados: number[]; linhas: LinhaReserva[] }

/**
 * Reserved devices per product: dispenser items of open visits from today on (minus devices already installed in that visit),
 * plus open replacement work orders not tied to one of those visits. Devices scanned at separation (SEPARADO) are part of the
 * reservation, never on top of it: a line reserves max(still to install, separated).
 */
export function reservasEstoque(v: { hoje: string; visitas: VisitaReserva[]; ordens: OrdemReserva[]; aparelhos: AparelhoReserva[]; dispensers: Set<string> }): Map<string, ReservaProduto> {
  const out = new Map<string, ReservaProduto>();
  const add = (l: LinhaReserva) => {
    if (l.quantidade <= 0) return;
    const r = out.get(l.product_id) ?? { reservados: 0, separados: [], linhas: [] };
    r.reservados += l.quantidade; r.separados.push(...l.separados); r.linhas.push(l); out.set(l.product_id, r);
  };
  const doVisita = (sid: string, pid: string) => v.aparelhos.filter((a) => a.ocorrencia_schedule_id === sid && a.product_id === pid);
  const contadas = new Set<string>();
  for (const s of v.visitas) {
    if (!STATUS_VISITA_RESERVA.includes(s.status) || s.scheduled_date < v.hoje || !OPERACOES_COM_APARELHO.includes(s.operacao_material ?? "")) continue;
    contadas.add(s.id);
    const porProduto = new Map<string, number>();
    for (const it of (Array.isArray(s.itens) ? s.itens : []) as Array<{ product_id?: string | null; quantidade?: unknown }>) {
      if (!it?.product_id || !v.dispensers.has(it.product_id)) continue;
      porProduto.set(it.product_id, (porProduto.get(it.product_id) ?? 0) + qtdAparelhos(it.quantidade));
    }
    for (const [pid, qtd] of porProduto) {
      const devs = doVisita(s.id, pid);
      const instalados = devs.filter((a) => STATUS_FORA_ESTOQUE.includes((a.status ?? "").toUpperCase())).reduce((n, a) => n + qtdAparelhos(a.quantidade), 0);
      const sep = devs.filter((a) => (a.status ?? "").toUpperCase() === "SEPARADO");
      add({ origem: "visita", ref_id: s.id, product_id: pid, quantidade: Math.max(qtd - instalados, sep.length), separados: sep.map((a) => a.etiqueta_numero).filter((n): n is number => !!n) });
    }
  }
  for (const o of v.ordens) {
    if (!["agendada", "em_andamento"].includes(o.status) || o.resolvida_schedule_id || !o.item_product_id || !v.dispensers.has(o.item_product_id)) continue;
    if (o.schedule_id && contadas.has(o.schedule_id)) continue;
    const sep = v.aparelhos.filter((a) => a.reserva_os_id === o.id && (a.status ?? "").toUpperCase() === "SEPARADO");
    add({ origem: "ordem", ref_id: o.id, product_id: o.item_product_id, quantidade: Math.max(qtdAparelhos(o.quantidade), sep.length), separados: sep.map((a) => a.etiqueta_numero).filter((n): n is number => !!n) });
  }
  return out;
}

/** Devices in test and installed (by device count) per product. */
export function contagemBase(aparelhos: AparelhoReserva[]): Map<string, { em_teste: number; instalados: number }> {
  const out = new Map<string, { em_teste: number; instalados: number }>();
  for (const a of aparelhos) {
    if (!a.product_id) continue;
    const st = (a.status ?? "").toUpperCase();
    if (st !== "ATIVO" && st !== "EM_TESTE") continue;
    const c = out.get(a.product_id) ?? { em_teste: 0, instalados: 0 };
    if (st === "EM_TESTE") c.em_teste += qtdAparelhos(a.quantidade); else c.instalados += qtdAparelhos(a.quantidade);
    out.set(a.product_id, c);
  }
  return out;
}

/** Available = in stock − reserved. */
export function disponivel(estoque: number, reservados: number): number { return (Number(estoque) || 0) - reservados; }

/** Alert when available ≤ minimum; with minimum 0 only a negative balance alerts (otherwise every device would be in alert). */
export function emAlerta(disp: number, minimo: number | null | undefined): boolean {
  const m = Number(minimo) || 0;
  return m > 0 ? disp <= m : disp < 0;
}

export type TipoAjuste = "entrada" | "saida" | "contagem";
export const TIPO_AJUSTE_LABEL: Record<TipoAjuste, string> = { entrada: "Entrada", saida: "Saída", contagem: "Contagem" };
/** Same rule as ajustar_estoque in the database: entrada adds, saída subtracts, contagem sets the counted balance. */
export function deltaAjuste(tipo: TipoAjuste, quantidade: number, atual: number): number {
  return tipo === "entrada" ? quantidade : tipo === "saida" ? -quantidade : quantidade - atual;
}
export function ajusteErro(tipo: string, quantidade: number | null, motivo: string): string | null {
  if (!["entrada", "saida", "contagem"].includes(tipo)) return "Escolha o tipo de ajuste";
  if (quantidade === null || !Number.isInteger(quantidade) || quantidade < 0 || quantidade > 100000 || (tipo !== "contagem" && quantidade === 0)) return "Quantidade inválida";
  if (motivo.trim().length < 3) return "Informe o motivo do ajuste";
  return null;
}
export const TIPO_MOV_LABEL: Record<string, string> = {
  entrada: "Entrada", saida: "Saída", contagem: "Contagem", instalacao: "Instalado no cliente", retirada: "Voltou ao estoque", cadastro: "Cadastro do produto", demo: "Demonstração",
};
