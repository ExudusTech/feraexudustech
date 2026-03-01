import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaLead {
  id: string;
  organization_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  source: string | null;
  stage: string;
  value: number | null;
  assigned_to: string | null;
  expected_close_date: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaLeads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_leads", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as EkkoaLead[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaLead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaLead>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_leads").insert({
        title: input.title!, description: input.description, contact_name: input.contact_name,
        contact_email: input.contact_email, contact_phone: input.contact_phone, source: input.source,
        stage: input.stage || "novo", value: input.value, client_id: input.client_id,
        expected_close_date: input.expected_close_date, notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_leads"] }); toast({ title: "Lead Ekkoa criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaLead> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_leads").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_leads"] }); toast({ title: "Lead atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_leads"] }); toast({ title: "Lead removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
