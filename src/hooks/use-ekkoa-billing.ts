import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaBilling {
  id: string;
  organization_id: string;
  client_id: string | null;
  contract_id: string | null;
  installation_id: string | null;
  invoice_number: string | null;
  title: string;
  description: string | null;
  billing_type: string;
  due_date: string | null;
  amount: number;
  paid_amount: number | null;
  payment_date: string | null;
  payment_method: string | null;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaBilling() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_billing", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_billing").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as EkkoaBilling[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaBilling() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaBilling>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_billing").insert({
        title: input.title!, description: input.description, invoice_number: input.invoice_number,
        billing_type: input.billing_type || "unico", client_id: input.client_id,
        contract_id: input.contract_id, installation_id: input.installation_id,
        due_date: input.due_date, amount: input.amount ?? 0, paid_amount: input.paid_amount,
        payment_method: input.payment_method, status: input.status || "pendente", notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_billing"] }); toast({ title: "Faturamento criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaBilling> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_billing").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_billing"] }); toast({ title: "Faturamento atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_billing").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_billing"] }); toast({ title: "Faturamento removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
