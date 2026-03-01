import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface EkkoaEquipment {
  id: string;
  organization_id: string;
  name: string;
  model: string | null;
  brand: string | null;
  serial_number: string | null;
  category: string | null;
  power_watts: number | null;
  quantity: number;
  unit_cost: number | null;
  description: string | null;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useEkkoaEquipment() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ekkoa_equipment", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ekkoa_equipment").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as EkkoaEquipment[];
    },
    enabled: !!user,
  });
}

export function useCreateEkkoaEquipment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<EkkoaEquipment>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("ekkoa_equipment").insert({
        name: input.name!, model: input.model, brand: input.brand, serial_number: input.serial_number,
        category: input.category, power_watts: input.power_watts, quantity: input.quantity ?? 1,
        unit_cost: input.unit_cost, description: input.description, status: input.status || "disponivel",
        notes: input.notes, organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_equipment"] }); toast({ title: "Equipamento criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateEkkoaEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EkkoaEquipment> & { id: string }) => {
      const { data, error } = await supabase.from("ekkoa_equipment").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_equipment"] }); toast({ title: "Equipamento atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteEkkoaEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ekkoa_equipment").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ekkoa_equipment"] }); toast({ title: "Equipamento removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
