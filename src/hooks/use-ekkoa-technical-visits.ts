import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaTechnicalVisit {
  id: string;
  organization_id: string;
  installation_id: string | null;
  client_id: string | null;
  technician_id: string | null;
  visit_date: string;
  visit_type: string;
  status: string;
  description: string | null;
  findings: string | null;
  recommendations: string | null;
  next_visit_date: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaTechnicalVisits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_technical_visits", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_technical_visits" as any).select("*").order("visit_date", { ascending: false });
      if (error) throw error;
      return data as unknown as EkkoaTechnicalVisit[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaTechnicalVisit() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaTechnicalVisit>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_technical_visits" as any).insert({
        installation_id: input.installation_id, client_id: input.client_id,
        technician_id: input.technician_id, visit_date: input.visit_date || new Date().toISOString().split("T")[0],
        visit_type: input.visit_type || "manutencao", status: input.status || "agendada",
        description: input.description, findings: input.findings, recommendations: input.recommendations,
        next_visit_date: input.next_visit_date, duration_minutes: input.duration_minutes, notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_technical_visits"] }); toast({ title: "Visita técnica criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaTechnicalVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaTechnicalVisit> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_technical_visits" as any).update(updates as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_technical_visits"] }); toast({ title: "Visita atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaTechnicalVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_technical_visits" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_technical_visits"] }); toast({ title: "Visita removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
