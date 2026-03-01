import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface ClientVisit {
  id: string;
  organization_id: string;
  client_id: string;
  visited_by: string;
  visit_date: string;
  visit_type: string;
  subject: string | null;
  notes: string | null;
  outcome: string | null;
  next_visit_date: string | null;
  created_at: string;
  updated_at: string | null;
}

export function useClientVisits(clientId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["client_visits", user?.organization_id, clientId],
    queryFn: async () => {
      let query = supabase.from("client_visits" as any).select("*").order("visit_date", { ascending: false });
      if (clientId) query = query.eq("client_id", clientId);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as ClientVisit[];
    },
    enabled: !!user,
  });
}

export function useCreateClientVisit() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<ClientVisit>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("client_visits" as any).insert({
        client_id: input.client_id,
        visit_date: input.visit_date || new Date().toISOString().split("T")[0],
        visit_type: input.visit_type || "presencial",
        subject: input.subject,
        notes: input.notes,
        outcome: input.outcome,
        next_visit_date: input.next_visit_date,
        organization_id: user.organization_id,
        visited_by: user.id,
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client_visits"] }); toast({ title: "Visita registrada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateClientVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ClientVisit> & { id: string }) => {
      const { data, error } = await supabase.from("client_visits" as any).update(updates as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client_visits"] }); toast({ title: "Visita atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteClientVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_visits" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client_visits"] }); toast({ title: "Visita removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
