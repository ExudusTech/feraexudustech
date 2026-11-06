// Test installation invoices (gestor rule 06/11): Simples Remessa out, return or loan invoice after the result.
export const RESULTADOS_TESTE = ["reprovado", "aprovado", "em_andamento"] as const;
export type ResultadoTeste = typeof RESULTADOS_TESTE[number];
export const RESULTADO_TESTE_LABEL: Record<ResultadoTeste, string> = {
  reprovado: "Não aprovado — retirar aparelho", aprovado: "Aprovado — seguir para proposta", em_andamento: "Ainda em teste",
};

/** A visit at a lead with devices on test (other than the installation itself) must answer the test result. */
export function precisaResultadoTeste(s: { client_id?: string | null; lead_id?: string | null; operacao_material?: string | null }, emTeste: number): boolean {
  return !s.client_id && !!s.lead_id && emTeste > 0 && s.operacao_material !== "instalacao_teste";
}

export interface ComodatoTeste { id: string; product_id?: string | null; quantidade?: string | null; aparelho_descricao?: string | null; localizacao_interna?: string | null; produto?: string | null }

/** Return invoice of the Simples Remessa: only the equipment (used product never comes back). */
export function itensDevolucaoRemessa(c: ComodatoTeste[]) {
  return c.map((x) => ({ product_id: x.product_id ?? null, descricao: x.produto || x.aparelho_descricao || "Aparelho", quantidade: String(x.quantidade || "1"),
    comodato_id: x.id, local: x.localizacao_interna ?? null }));
}

/** Definitive installation after the sale: devices already on test stay installed, so they are not carried again. Consumables stay. */
export function itensInstalacaoDefinitiva<T extends { product_id?: string | null; comodato_id?: string | null; is_dispenser?: boolean }>(itens: T[], emTeste: { id: string; product_id?: string | null }[]): T[] {
  const ids = new Set(emTeste.map((c) => c.id));
  const porProduto = new Map<string, number>();
  for (const c of emTeste) if (c.product_id) porProduto.set(c.product_id, (porProduto.get(c.product_id) ?? 0) + 1);
  return itens.filter((i) => {
    if (i.comodato_id && ids.has(i.comodato_id)) return false;
    if (i.is_dispenser && i.product_id && (porProduto.get(i.product_id) ?? 0) > 0) { porProduto.set(i.product_id, porProduto.get(i.product_id)! - 1); return false; }
    return true;
  });
}
