// Open billing tasks shown on the Dashboard card (same data as /tarefas, already limited by the database access rules).
import { TAREFA_ACAO_LABEL, TIPO_NOTA_LABEL, TIPO_NOTA_TAREFA_LABEL, type TipoNota } from "@/lib/prontidao";

export interface TarefaPainelRow { id: string; numero: number; empresa_nome: string | null; tipo_nota: string; acao: string | null; data_visita: string; prazo: string }
export interface TarefaPainel extends TarefaPainelRow { rotulo: string; atrasada: boolean }

export const LIMITE_TAREFAS_PAINEL = 6;

/** "tipo de nota" label, prefixed by the action when it is not a plain issue (cancel, return…). */
export function rotuloTarefa(acao: string | null, tipoNota: string): string {
  const nota = TIPO_NOTA_TAREFA_LABEL[tipoNota] ?? TIPO_NOTA_LABEL[tipoNota as TipoNota] ?? tipoNota;
  return acao && acao !== "emitir" ? `${TAREFA_ACAO_LABEL[acao] ?? acao} · ${nota}` : nota;
}

/** Sorted by deadline (earliest first), at most 6, with overdue flagged against `agora`. */
export function tarefasDoPainel(rows: TarefaPainelRow[], agora: Date, limite = LIMITE_TAREFAS_PAINEL): TarefaPainel[] {
  return [...rows]
    .sort((a, b) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime())
    .slice(0, limite)
    .map((t) => ({ ...t, rotulo: rotuloTarefa(t.acao, t.tipo_nota), atrasada: new Date(t.prazo).getTime() < agora.getTime() }));
}
