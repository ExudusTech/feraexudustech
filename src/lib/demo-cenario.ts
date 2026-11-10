export * from "../../supabase/functions/_shared/demo-cenario";

/** Labels for the counts returned by the demo function (Configurações → Dados de demonstração). */
export const DEMO_CONTAGEM_LABEL: Record<string, string> = {
  leads: "Leads", clientes: "Clientes", pessoas: "Contatos", visitas: "Visitas", propostas: "Propostas", aparelhos_pontos: "Aparelhos/pontos",
  tarefas_faturamento: "Tarefas de faturamento", atendimentos: "Atendimentos", ordens_servico: "Ordens de serviço", evidencias: "Evidências",
  historico: "Histórico", historico_etapas: "Mudanças de etapa", historico_propostas: "Mudanças de proposta", notificacoes: "Notificações", arquivos: "Arquivos",
};
