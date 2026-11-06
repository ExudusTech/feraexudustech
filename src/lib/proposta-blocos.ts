/** Status of each collapsible block of the proposal editor (mobile-first), and what is still missing to generate the PDF. */
export type BlocoId = "cliente" | "ambiente" | "produtos" | "condicoes" | "resumo";
export const BLOCOS: BlocoId[] = ["cliente", "ambiente", "produtos", "condicoes", "resumo"];

export interface PropostaEstado {
  temEmpresa: boolean;
  temResponsavel: boolean;
  pontos: { aparelho: string | null; produto: string | null }[];
  itens: { unit_price: number | null }[];
}

export function statusBlocos(e: PropostaEstado) {
  const semPreco = e.itens.filter((i) => i.unit_price == null).length;
  const pontosIncompletos = e.pontos.filter((p) => !p.aparelho || !p.produto).length;
  const faltas: string[] = [];
  if (!e.temEmpresa) faltas.push("cliente/lead");
  else if (!e.temResponsavel) faltas.push("responsável");
  if (e.itens.length === 0) faltas.push("produtos");
  if (semPreco > 0) faltas.push(`preço de ${semPreco} ${semPreco === 1 ? "item" : "itens"}`);
  const pronto: Record<BlocoId, boolean> = {
    cliente: e.temEmpresa && e.temResponsavel,
    ambiente: pontosIncompletos === 0,
    produtos: e.itens.length > 0 && semPreco === 0,
    condicoes: true, // blanks fall back to the Configurações defaults
    resumo: false,
  };
  // Only missing price/company/items block the PDF; incomplete points are a warning.
  pronto.resumo = faltas.length === 0;
  return { pronto, faltas, semPreco, pontosIncompletos, podeGerarPdf: faltas.length === 0,
    falta: faltas.length ? `Falta: ${faltas.join(", ")}` : "" };
}

export const primeiroPendente = (pronto: Record<BlocoId, boolean>): BlocoId | null => BLOCOS.find((b) => !pronto[b]) ?? null;

export const totalItem = (price: number | null, qty: number, desc: number) =>
  price == null ? null : Math.round(price * qty * (1 - (desc || 0) / 100) * 100) / 100;
