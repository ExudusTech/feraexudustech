import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaInstallation {
  id: string;
  organization_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  installation_type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  power_kwp: number | null;
  panels_count: number | null;
  inverter_model: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaInstallations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_installations", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_installations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as EkkoaInstallation[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaInstallation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaInstallation>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_installations").insert({
        title: input.title!, description: input.description, installation_type: input.installation_type || "residencial",
        client_id: input.client_id, address: input.address, city: input.city, state: input.state,
        zip_code: input.zip_code, power_kwp: input.power_kwp, panels_count: input.panels_count,
        inverter_model: input.inverter_model, start_date: input.start_date, end_date: input.end_date,
        status: input.status || "planejada", notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_installations"] }); toast({ title: "Instalação criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaInstallation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaInstallation> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_installations").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_installations"] }); toast({ title: "Instalação atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaInstallation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_installations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_installations"] }); toast({ title: "Instalação removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
