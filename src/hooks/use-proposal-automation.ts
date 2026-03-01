import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import type { Proposal } from "@/hooks/use-proposals";

/**
 * Accept a proposal and automatically create a linked order.
 * Replicates: Proposta aceita → Pedido (criação automática vinculada)
 */
export function useAcceptProposalAndCreateOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (proposal: Proposal) => {
      if (!user?.organization_id) throw new Error("Sem organização");

      // 1. Update proposal status to accepted
      const { error: propError } = await supabase
        .from("proposals")
        .update({ status: "aceita" })
        .eq("id", proposal.id);
      if (propError) throw propError;

      // 2. Generate order number
      const orderNumber = `PED-${Date.now().toString(36).toUpperCase()}`;

      // 3. Auto-create order linked to the proposal
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          client_id: proposal.client_id,
          proposal_id: proposal.id,
          order_number: orderNumber,
          status: "aprovado",
          total_value: proposal.final_value || proposal.total_value,
          payment_status: "pendente",
          notes: `Pedido gerado automaticamente da proposta: ${proposal.title}`,
          organization_id: user.organization_id,
          created_by: user.id,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Proposta aceita!", description: "Pedido criado automaticamente." });
    },
    onError: (e: Error) => toast({ title: "Erro ao aceitar proposta", description: e.message, variant: "destructive" }),
  });
}

/**
 * Reject a proposal
 */
export function useRejectProposal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      const { error } = await supabase
        .from("proposals")
        .update({ status: "rejeitada" })
        .eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Proposta rejeitada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
