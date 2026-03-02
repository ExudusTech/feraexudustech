import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface InventoryItem {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  serial_number: string | null;
  category: string | null;
  quantity: number;
  min_quantity: number;
  unit: string;
  unit_cost: number;
  location: string | null;
  status: string;
  installation_date: string | null;
  last_maintenance_date: string | null;
  geolocation: string | null;
  photo_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useInventory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inventory", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items").select("*").order("name", { ascending: true });
      if (error) throw error;
      return data as InventoryItem[];
    },
    enabled: !!user,
  });
}

export function useCreateInventoryItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<InventoryItem>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("inventory_items").insert({
        name: input.name!, description: input.description, sku: input.sku,
        serial_number: input.serial_number, category: input.category,
        quantity: input.quantity || 0, min_quantity: input.min_quantity || 0, unit: input.unit || "un",
        unit_cost: input.unit_cost || 0, location: input.location, status: input.status || "active",
        installation_date: input.installation_date, last_maintenance_date: input.last_maintenance_date,
        geolocation: input.geolocation, photo_url: input.photo_url,
        organization_id: user.organization_id, created_by: user.id,
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); toast({ title: "Item criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InventoryItem> & { id: string }) => {
      const { data, error } = await supabase.from("inventory_items").update(updates as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); toast({ title: "Item atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); toast({ title: "Item removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
