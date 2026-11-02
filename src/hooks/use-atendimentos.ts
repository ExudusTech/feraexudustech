import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export type AtendimentoStatus = "aberto" | "em_atendimento" | "resolvido" | "encerrado_sem_resposta";
export interface Atendimento {
  id: string; organization_id: string; lead_id: string | null; pessoa_id: string | null; empresa: string | null; contato_nome: string | null;
  canal: string | null; chat_id: string | null; whatsapp: string | null; instagram: string | null; tipo: "transferencia" | "matriz";
  motivo: string | null; resumo: string | null; urgencia: "baixa" | "media" | "alta"; responsavel_id: string | null; status: AtendimentoStatus;
  aberto_em: string; relogio_inicia_em: string; recebido_fora_horario: boolean; cobrancas: number; ultima_cobranca_em: string | null;
  assumido_em: string | null; assumido_por: string | null; resolvido_em: string | null; resolvido_por: string | null;
  resolucao: string | null; resultado: string | null; alerta_nivel: string; humano_ativo: boolean;
}

export const STATUS_LABEL: Record<AtendimentoStatus, string> = {
  aberto: "Aberto", em_atendimento: "Em atendimento", resolvido: "Resolvido", encerrado_sem_resposta: "Encerrado sem resposta",
};
export const RESULTADO_LABEL: Record<string, string> = {
  virou_agendamento: "Virou agendamento", virou_proposta: "Virou proposta", duvida_resolvida: "Dúvida resolvida", perdido: "Perdido", outro: "Outro",
};

export function useAtendimentos(opts: { abertos?: boolean; desde?: string } = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["atendimentos", user?.organization_id, opts.abertos ?? false, opts.desde ?? null],
    enabled: !!user?.organization_id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Atendimento[]> => {
      let q = (supabase as any).from("atendimentos").select("*").eq("organization_id", user!.organization_id).order("aberto_em", { ascending: false }).limit(500);
      if (opts.abertos) q = q.in("status", ["aberto", "em_atendimento"]);
      if (opts.desde) q = q.gte("aberto_em", opts.desde);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

async function readError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try { const body = await error.context.json(); if (typeof body?.error === "string") return body.error; } catch { /* ignore */ }
  }
  return "Tente novamente em instantes.";
}

export function useAtendimentoAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; action: "assumir" | "resolver" | "encerrar" | "devolver" | "enviar"; resolucao?: string; resultado?: string; mensagem?: string; mover_perdido?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("atendimento-acoes", { body: payload });
      if (error) throw new Error(await readError(error));
      return data as { ok: boolean; flora_pausada?: boolean };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["atendimentos"] }); qc.invalidateQueries({ queryKey: ["lead-timeline"] }); qc.invalidateQueries({ queryKey: ["leads"] }); },
    onError: (e: Error) => toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" }),
  });
}

export function useConversa(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["atendimento-conversa", id], enabled: !!id && enabled, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("atendimento-acoes", { body: { id, action: "historico" } });
      if (error) throw new Error(await readError(error));
      return data as { mensagens: Array<{ autor: string; texto: string; quando: string | null }>; disponivel: boolean };
    },
  });
}
