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
  fornecedor: string | null;
  linha_produto: string | null;
  disponivel_comodato: boolean | null;
  is_dispenser: boolean;
  dispenser_family_id: string | null;
  compatible_dispenser_families: string[];

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
        brand: input.brand, fornecedor: input.fornecedor, unit: input.unit || "un", price: input.price || 0, cost: input.cost || 0,
        stock: input.stock || 0, min_stock: input.min_stock || 0, is_active: input.is_active ?? true,
        is_dispenser: input.is_dispenser ?? false,
        dispenser_family_id: input.dispenser_family_id ?? null,
        compatible_dispenser_families: input.compatible_dispenser_families ?? [],
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Produto criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export interface ImportProductInput {
  name: string;
  sku: string;
  category?: string | null;
  brand?: string | null;
  fornecedor?: string | null;
  description?: string | null;
  unit?: string | null;
  price?: number | null;
  cost?: number | null;
  stock?: number | null;
  min_stock?: number | null;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  errors: number;
  errorLog: string[];
}

/**
 * Importa produtos usando o SKU como chave.
 * - SKU já existente na organização: atualiza SOMENTE os campos presentes na planilha.
 * - SKU novo: insere com valores padrão (unidade "un", preço/custo/estoque zerados).
 */
export function useImportProducts() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ items, fileName }: { items: ImportProductInput[]; fileName: string }) => {
      const orgId = user?.organization_id;
      if (!orgId) throw new Error("Sem organização");

      const { data: existing, error: exErr } = await supabase
        .from("products")
        .select("id, sku")
        .eq("organization_id", orgId)
        .not("sku", "is", null);
      if (exErr) throw exErr;

      const bySku = new Map<string, string>();
      (existing || []).forEach((p: any) => { if (p.sku) bySku.set(String(p.sku).trim(), p.id); });

      const result: ImportResult = { inserted: 0, updated: 0, errors: 0, errorLog: [] };

      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: Record<string, any> }[] = [];

      for (const item of items) {
        const sku = String(item.sku).trim();
        // Somente campos realmente presentes na planilha entram no patch
        const patch: Record<string, any> = {};
        const assign = (key: string, value: unknown) => {
          if (value !== undefined && value !== null && value !== "") patch[key] = value;
        };
        assign("name", item.name);
        assign("category", item.category);
        assign("brand", item.brand);
        assign("fornecedor", item.fornecedor);
        assign("description", item.description);
        assign("unit", item.unit);
        if (item.price != null) patch.price = item.price;
        if (item.cost != null) patch.cost = item.cost;
        if (item.stock != null) patch.stock = item.stock;
        if (item.min_stock != null) patch.min_stock = item.min_stock;

        const existingId = bySku.get(sku);
        if (existingId) {
          toUpdate.push({ id: existingId, patch });
        } else {
          toInsert.push({
            ...patch,
            name: item.name,
            sku,
            unit: patch.unit || "un",
            price: patch.price ?? 0,
            cost: patch.cost ?? 0,
            stock: patch.stock ?? 0,
            min_stock: patch.min_stock ?? 0,
            is_active: true,
            organization_id: orgId,
            created_by: user.id,
          });
        }
      }

      // Inserções em lotes
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error } = await supabase.from("products").insert(chunk);
        if (error) {
          result.errors += chunk.length;
          result.errorLog.push(`Inserção (linhas ${i + 1}-${i + chunk.length}): ${error.message}`);
        } else {
          result.inserted += chunk.length;
        }
      }

      // Atualizações individuais (patch parcial por produto)
      for (const u of toUpdate) {
        if (Object.keys(u.patch).length === 0) continue;
        const { error } = await supabase.from("products").update(u.patch).eq("id", u.id);
        if (error) {
          result.errors += 1;
          result.errorLog.push(`Atualização ${u.patch.name ?? u.id}: ${error.message}`);
        } else {
          result.updated += 1;
        }
      }

      await supabase.from("product_imports").insert({
        organization_id: orgId,
        imported_by: user.id,
        file_name: fileName,
        total_rows: items.length,
        inserted_count: result.inserted,
        updated_count: result.updated,
        error_count: result.errors,
        status: result.errors > 0 ? "concluido_com_erros" : "concluido",
        error_log: result.errorLog.length ? result.errorLog : null,
      });

      return result;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product_imports"] });
      toast({
        title: "Importação concluída",
        description: `${r.inserted} novos · ${r.updated} atualizados${r.errors ? ` · ${r.errors} com erro` : ""}`,
        variant: r.errors > 0 ? "destructive" : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Erro na importação", description: e.message, variant: "destructive" }),
  });
}

export interface ProductImport {
  id: string;
  file_name: string | null;
  total_rows: number;
  inserted_count: number;
  updated_count: number;
  error_count: number;
  status: string;
  created_at: string;
}

export function useLastProductImport() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["product_imports", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_imports")
        .select("id, file_name, total_rows, inserted_count, updated_count, error_count, status, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ProductImport | null) ?? null;
    },
    enabled: !!user,
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
