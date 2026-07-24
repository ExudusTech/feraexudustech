import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface Comodato {
  id: string;
  organization_id: string;
  client_id: string | null;
  client_contact_id: string | null;
  inventory_item_id: string | null;
  product_id: string | null;
  numero_contrato: string | null;
  linha_produto: string | null;
  localizacao_interna: string | null;
  endereco_instalacao: string | null;
  cidade: string | null;
  estado: string | null;
  consumo_minimo: number | null;
  unidade_consumo: string | null;
  valor_mensal: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
  ultima_manutencao: string | null;
  proxima_manutencao: string | null;
  periodicidade_manut: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useComodatos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["comodatos", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comodatos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Comodato[];
    },
    enabled: !!user,
  });
}

export function useCreateComodato() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Comodato>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await (supabase as any)
        .from("comodatos")
        .insert({
          ...input,
          organization_id: user.organization_id,
          created_by: user.id,
          status: input.status || "ATIVO",
        })
        .select()
        .single();
      if (error) throw error;
      return data as Comodato;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comodatos"] });
      toast({ title: "Comodato criado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateComodato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Comodato> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("comodatos")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Comodato;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comodatos"] });
      toast({ title: "Comodato atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteComodato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("comodatos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comodatos"] });
      toast({ title: "Comodato removido" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export const COMODATO_STATUS_BADGE: Record<string, string> = {
  ATIVO: "bg-green-500/15 text-green-400 border border-green-500/30",
  SUSPENSO: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  ENCERRADO: "bg-muted text-muted-foreground border border-border",
};
