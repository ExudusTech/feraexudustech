import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export type LeadStage = "novo" | "qualificacao" | "proposta" | "negociacao" | "fechado_ganho" | "fechado_perdido";

export interface Lead {
  id: string;
  organization_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  stage: LeadStage;
  value: number;
  source: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  expected_close_date: string | null;
  assigned_to: string | null;
  created_by: string;
  position: number;
  created_at: string;
  updated_at: string | null;
}

export const STAGE_CONFIG: Record<LeadStage, { label: string; color: string }> = {
  novo: { label: "Novo", color: "bg-blue-500" },
  qualificacao: { label: "Qualificação", color: "bg-amber-500" },
  proposta: { label: "Proposta", color: "bg-purple-500" },
  negociacao: { label: "Negociação", color: "bg-orange-500" },
  fechado_ganho: { label: "Fechado (Ganho)", color: "bg-emerald-500" },
  fechado_perdido: { label: "Fechado (Perdido)", color: "bg-red-500" },
};

export const PIPELINE_STAGES: LeadStage[] = ["novo", "qualificacao", "proposta", "negociacao", "fechado_ganho", "fechado_perdido"];

export function useLeads() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["leads", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!user,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Partial<Lead>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase
        .from("leads")
        .insert({
          title: input.title!,
          description: input.description,
          stage: input.stage || "novo",
          value: input.value || 0,
          source: input.source,
          contact_name: input.contact_name,
          contact_email: input.contact_email,
          contact_phone: input.contact_phone,
          expected_close_date: input.expected_close_date,
          organization_id: user.organization_id,
          created_by: user.id,
          position: input.position || 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead criado com sucesso" });
    },
    onError: (e: Error) => toast({ title: "Erro ao criar lead", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const { data, error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast({ title: "Erro ao atualizar lead", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead removido" });
    },
    onError: (e: Error) => toast({ title: "Erro ao remover lead", description: e.message, variant: "destructive" }),
  });
}
