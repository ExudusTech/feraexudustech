// Pure helpers for the proposal PDF (kept import-free so tests can load them).
export interface AmbienteLinha { local: string; aparelho?: string | null; produto?: string | null; quantidade?: string | null }
export const NOTA_COMODATO = "Os aparelhos são cedidos em comodato, sem custo, com manutenção periódica.";
/** Single comodato listing: the per-point rows plus a "Geral" row for each device not tied to a point. */
export function ambientesComGeral(ambientes: AmbienteLinha[], avulsos: { descricao: string; quantidade: number }[]): AmbienteLinha[] {
  const naTabela = new Set(ambientes.map((a) => (a.aparelho ?? "").trim().toLowerCase()).filter(Boolean));
  return [...ambientes, ...avulsos.filter((c) => !naTabela.has(c.descricao.trim().toLowerCase()))
    .map((c) => ({ local: "Geral", aparelho: c.descricao, produto: null, quantidade: String(c.quantidade) }))];
}
