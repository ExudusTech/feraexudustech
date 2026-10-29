import { notifySchedule } from "@/lib/notify-schedule";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface Schedule {
  id: string;
  organization_id: string;
  operation_id: string | null;
  title: string;
  description: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  schedule_type: string;
  schedule_subtype: string | null;
  client_id: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  location: string | null;
  zip_code: string | null;
  notes: string | null;
  created_by: string | null;
  source: string;
  created_at: string;
  updated_at: string | null;
}

export function useSchedules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["schedules", user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      const { data, error } = await supabase.from("schedules").select("*").eq("organization_id", user.organization_id).order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data as Schedule[];
    },
    enabled: !!user?.organization_id,
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Schedule>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      if (!input.title || !input.scheduled_date) throw new Error("Título e data são obrigatórios");
      const { data, error } = await (supabase as any).from("schedules").insert({
        title: input.title, description: input.description, scheduled_date: input.scheduled_date,
        start_time: input.start_time, end_time: input.end_time, status: input.status || "agendado",
        client_id: input.client_id, location: input.location, zip_code: input.zip_code, notes: input.notes,
        operation_id: input.operation_id,
        schedule_subtype: input.schedule_subtype ?? null,
        ...(input.schedule_type ? { schedule_type: input.schedule_type } : {}),
        lead_id: input.lead_id ?? null,
        assigned_to: input.assigned_to ?? null, source: "manual",
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      notifySchedule("schedule", data.id);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); toast({ title: "Agendamento criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Schedule> & { id: string }) => {
      const { data, error } = await supabase.from("schedules").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); toast({ title: "Agendamento atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); toast({ title: "Agendamento removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
