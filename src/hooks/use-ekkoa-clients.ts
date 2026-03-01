import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaClient {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  client_type: string;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaClients() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_clients", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as EkkoaClient[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaClient() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaClient>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_clients").insert({
        name: input.name!, email: input.email, phone: input.phone, document: input.document,
        company: input.company, address: input.address, city: input.city, state: input.state,
        zip_code: input.zip_code, client_type: input.client_type || "residencial",
        notes: input.notes, status: input.status || "active",
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_clients"] }); toast({ title: "Cliente Ekkoa criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaClient> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_clients").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_clients"] }); toast({ title: "Cliente atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_clients"] }); toast({ title: "Cliente removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
