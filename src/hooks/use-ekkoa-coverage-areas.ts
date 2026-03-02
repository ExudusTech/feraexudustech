import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaCoverageArea {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  zip_code_start: string | null;
  zip_code_end: string | null;
  radius_km: number | null;
  latitude: number | null;
  longitude: number | null;
  dia_semana: string | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaCoverageAreas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_coverage_areas", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_coverage_areas" as any).select("*").order("name");
      if (error) throw error;
      return data as unknown as EkkoaCoverageArea[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaCoverageArea() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaCoverageArea>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_coverage_areas" as any).insert({
        name: input.name, description: input.description, city: input.city, state: input.state,
        zip_code_start: input.zip_code_start, zip_code_end: input.zip_code_end,
        radius_km: input.radius_km, latitude: input.latitude, longitude: input.longitude,
        is_active: input.is_active ?? true,
        organization_id: user.organization_id, created_by: user.id,
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_coverage_areas"] }); toast({ title: "Área criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaCoverageArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaCoverageArea> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_coverage_areas" as any).update(updates as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_coverage_areas"] }); toast({ title: "Área atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaCoverageArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_coverage_areas" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_coverage_areas"] }); toast({ title: "Área removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
