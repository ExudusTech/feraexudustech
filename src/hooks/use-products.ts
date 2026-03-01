import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface Product {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  brand: string | null;
  unit: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  is_active: boolean;
  specifications: Record<string, any>;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useProducts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["products", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Product>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("products").insert({
        name: input.name!, description: input.description, sku: input.sku, category: input.category,
        brand: input.brand, unit: input.unit || "un", price: input.price || 0, cost: input.cost || 0,
        stock: input.stock || 0, min_stock: input.min_stock || 0, is_active: input.is_active ?? true,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Produto criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useCreateProductsBatch() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (items: Partial<Product>[]) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const rows = items.map((i) => ({
        name: i.name!, description: i.description || null, sku: i.sku || null, category: i.category || null,
        brand: i.brand || null, unit: i.unit || "un", price: i.price || 0, cost: i.cost || 0,
        stock: i.stock || 0, min_stock: i.min_stock || 0, is_active: true,
        organization_id: user.organization_id!, created_by: user.id,
      }));
      const { error } = await supabase.from("products").insert(rows);
      if (error) throw error;
    },
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: `${vars.length} produtos importados` }); },
    onError: (e: Error) => toast({ title: "Erro na importação", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      const { data, error } = await supabase.from("products").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Produto atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Produto removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
