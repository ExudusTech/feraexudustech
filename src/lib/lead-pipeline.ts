// Builds the Leads kanban from the organization's configurable stages (lead_stages).
export interface PipelineStage { id: string; nome: string; ordem: number; tipo: string; chave: string | null; ativo: boolean; cor?: string | null }
export interface PipelineLead { id: string; stage: string; stage_id?: string | null }

/** Legacy leads.stage → lead_stages.chave (same mapping as the database trigger). */
export const LEGACY_TO_CHAVE: Record<string, string> = {
  novo: "novo", qualificacao: "qualificado", proposta: "proposta_enviada", negociacao: "proposta_enviada",
  em_teste: "teste_amostra", feedback: "teste_amostra", fechado_ganho: "ganho", instalacao_definitiva: "ganho",
  cadastramento: "ganho", fechado_perdido: "perdido",
};

export interface PipelineColumn<L> { stage: PipelineStage | null; leads: L[] }

/** Active stages in configured order; leads go by stage_id, falling back to the legacy mapping. Leads in an
 * inactive or unknown stage land in a trailing "no active stage" column (stage = null) so they are never hidden. */
export function buildColumns<L extends PipelineLead>(stages: PipelineStage[], leads: L[]): PipelineColumn<L>[] {
  const active = stages.filter((s) => s.ativo).sort((a, b) => a.ordem - b.ordem);
  const cols = active.map((stage) => ({ stage, leads: [] as L[] }));
  const byId = new Map(cols.map((c) => [c.stage.id, c]));
  const byChave = new Map(cols.filter((c) => c.stage.chave).map((c) => [c.stage.chave!, c]));
  const orphans: L[] = [];
  for (const l of leads) {
    const col = (l.stage_id ? byId.get(l.stage_id) : undefined)
      ?? (!l.stage_id ? byChave.get(LEGACY_TO_CHAVE[l.stage] ?? "") : undefined);
    if (col) col.leads.push(l); else orphans.push(l);
  }
  return orphans.length ? [...cols, { stage: null, leads: orphans }] : cols;
}

/** Number of leads currently in a stage (used to warn before deactivating it). */
export function leadsInStage(stageId: string, leads: PipelineLead[]): number {
  return leads.filter((l) => l.stage_id === stageId).length;
}

export const TIPO_DOT: Record<string, string> = { aberta: "bg-primary", ganho: "bg-success", perdido: "bg-destructive", cliente: "bg-info" };
