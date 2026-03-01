import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaContract {
  id: string;
  organization_id: string;
  client_id: string | null;
  installation_id: string | null;
  contract_number: string | null;
  title: string;
  description: string | null;
  contract_type: string;
  start_date: string | null;
  end_date: string | null;
  total_value: number;
  monthly_value: number | null;
  payment_method: string | null;
  payment_terms: string | null;
  status: string;
  signed_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaContracts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_contracts", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_contracts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as EkkoaContract[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaContract() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaContract>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_contracts").insert({
        title: input.title!, description: input.description, contract_number: input.contract_number,
        contract_type: input.contract_type || "instalacao", client_id: input.client_id,
        installation_id: input.installation_id, start_date: input.start_date, end_date: input.end_date,
        total_value: input.total_value ?? 0, monthly_value: input.monthly_value,
        payment_method: input.payment_method, payment_terms: input.payment_terms,
        status: input.status || "rascunho", notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_contracts"] }); toast({ title: "Contrato criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaContract> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_contracts").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_contracts"] }); toast({ title: "Contrato atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_contracts"] }); toast({ title: "Contrato removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
