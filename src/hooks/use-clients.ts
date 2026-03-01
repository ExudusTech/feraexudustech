import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export type ClientInsert = Omit<Client, "id" | "created_at" | "updated_at">;

export function useClients() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["clients", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Omit<ClientInsert, "organization_id" | "created_by">) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...input, organization_id: user.organization_id, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente criado com sucesso" });
    },
    onError: (e: Error) => toast({ title: "Erro ao criar cliente", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente removido" });
    },
    onError: (e: Error) => toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });
}
