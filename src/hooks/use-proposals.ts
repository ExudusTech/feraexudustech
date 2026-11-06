import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";

export interface Proposal {
  id: string;
  organization_id: string;
  client_id: string | null;
  lead_id?: string | null;
  origem_schedule_id?: string | null;
  created_by: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: string;
  total_value: number;
  discount_percent: number;
  discount_value: number;
  final_value: number;
  valid_until: string | null;
  notes: string | null;
  numero?: number | null;
  forma_pagamento?: string | null;
  prazo_entrega?: string | null;
  periodicidade_manutencao?: string | null;
  pdf_path?: string | null;
  created_at: string;
  updated_at: string | null;
  clients?: { name: string } | null;
  leads?: { empresa_nome: string | null; company: string | null; title: string | null; cnpj: string | null } | null;
}

export interface ProposalItem {
  id: string;
  proposal_id: string;
  product_id: string | null;
  organization_id: string;
  description: string;
  quantity: number;
  unit_price: number | null;
  discount_percent: number;
  total_price: number | null;
  comodato_id?: string | null;
  sort_order: number;
  created_at: string;
}

export function useProposals() {
  const { user } = useAuth();
  const { isAdmin, role } = usePermissions();

  return useQuery({
    queryKey: ["proposals", user?.organization_id, role],
    queryFn: async () => {
      let query = supabase
        .from("proposals")
        .select("*, clients(name), leads(empresa_nome, company, title, cnpj)")
        .order("created_at", { ascending: false });

      // Visibility (own, assigned, portfolio lead/client; managers all) is enforced by RLS can_see_proposal.
      void isAdmin;

      const { data, error } = await query;
      if (error) throw error;
      return data as Proposal[];
    },
    enabled: !!user,
  });
}

export function useProposalItems(proposalId: string | null) {
  return useQuery({
    queryKey: ["proposal_items", proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from("proposal_items")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("sort_order");
      if (error) throw error;
      return data as ProposalItem[];
    },
    enabled: !!proposalId,
  });
}

export function useCreateProposal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Proposal>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("proposals").insert({
        title: input.title!,
        description: input.description,
        client_id: input.client_id,
        status: input.status || "rascunho",
        total_value: input.total_value || 0,
        discount_percent: input.discount_percent || 0,
        discount_value: input.discount_value || 0,
        final_value: input.final_value || 0,
        valid_until: input.valid_until,
        notes: input.notes,
        forma_pagamento: input.forma_pagamento ?? null,
        prazo_entrega: input.prazo_entrega ?? null,
        periodicidade_manutencao: input.periodicidade_manutencao ?? null,
        organization_id: user.organization_id,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proposals"] }); toast({ title: "Proposta criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Proposal> & { id: string }) => {
      const { clients, leads, ...cleanUpdates } = updates as any;
      const { data, error } = await supabase.from("proposals").update(cleanUpdates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proposals"] }); toast({ title: "Proposta atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proposals"] }); toast({ title: "Proposta removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useCreateProposalItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<ProposalItem>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("proposal_items").insert({
        proposal_id: input.proposal_id!,
        product_id: input.product_id,
        description: input.description!,
        quantity: input.quantity || 1,
        unit_price: input.unit_price || 0,
        discount_percent: input.discount_percent || 0,
        total_price: input.total_price || 0,
        sort_order: input.sort_order || 0,
        organization_id: user.organization_id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ["proposal_items", vars.proposal_id] }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteProposalItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, proposalId }: { id: string; proposalId: string }) => {
      const { error } = await supabase.from("proposal_items").delete().eq("id", id);
      if (error) throw error;
      return proposalId;
    },
    onSuccess: (proposalId) => { qc.invalidateQueries({ queryKey: ["proposal_items", proposalId] }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

/** Sets a unit price on a proposal item and recomputes the proposal total (items without price count as 0). */
export function useUpdateProposalItemPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, price }: { item: ProposalItem; price: number | null }) => {
      const total = price == null ? null : Math.round(price * Number(item.quantity) * 100) / 100;
      const { error } = await supabase.from("proposal_items").update({ unit_price: price, total_price: total }).eq("id", item.id);
      if (error) throw error;
      const { data: all } = await supabase.from("proposal_items").select("total_price").eq("proposal_id", item.proposal_id);
      const soma = (all ?? []).reduce((a, x: any) => a + Number(x.total_price ?? 0), 0);
      const { data: p } = await supabase.from("proposals").select("discount_percent").eq("id", item.proposal_id).single();
      const desc = soma * (Number(p?.discount_percent ?? 0) / 100);
      await supabase.from("proposals").update({ total_value: soma, discount_value: desc, final_value: soma - desc }).eq("id", item.proposal_id);
      return item.proposal_id;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["proposal_items", id] }); qc.invalidateQueries({ queryKey: ["proposals"] }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
