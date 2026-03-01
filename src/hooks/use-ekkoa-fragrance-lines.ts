import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaFragranceLine {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: string | null;
  intensity: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaFragranceLines() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_fragrance_lines", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_fragrance_lines" as any).select("*").order("name");
      if (error) throw error;
      return data as unknown as EkkoaFragranceLine[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaFragranceLine() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaFragranceLine>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_fragrance_lines" as any).insert({
        name: input.name, description: input.description, category: input.category,
        intensity: input.intensity, is_active: input.is_active ?? true, notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_fragrance_lines"] }); toast({ title: "Linha de fragrância criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaFragranceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaFragranceLine> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_fragrance_lines" as any).update(updates as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_fragrance_lines"] }); toast({ title: "Linha atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaFragranceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_fragrance_lines" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_fragrance_lines"] }); toast({ title: "Linha removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
