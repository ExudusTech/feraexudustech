import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export type OperationStatus = "pendente" | "em_andamento" | "concluida" | "cancelada";

export interface Operation {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: OperationStatus;
  priority: string;
  client_id: string | null;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export const STATUS_CONFIG: Record<OperationStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-amber-500" },
  em_andamento: { label: "Em Andamento", color: "bg-blue-500" },
  concluida: { label: "Concluída", color: "bg-emerald-500" },
  cancelada: { label: "Cancelada", color: "bg-red-500" },
};

export function useOperations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["operations", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("operations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Operation[];
    },
    enabled: !!user,
  });
}

export function useCreateOperation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Operation>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("operations").insert({
        title: input.title!, description: input.description, status: input.status || "pendente",
        priority: input.priority || "media", client_id: input.client_id, start_date: input.start_date,
        end_date: input.end_date, location: input.location, notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operations"] }); toast({ title: "Operação criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Operation> & { id: string }) => {
      const { data, error } = await supabase.from("operations").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operations"] }); toast({ title: "Operação atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("operations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operations"] }); toast({ title: "Operação removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
