import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface Order {
  id: string;
  organization_id: string;
  client_id: string | null;
  proposal_id: string | null;
  created_by: string;
  order_number: string | null;
  status: string;
  total_value: number;
  payment_method: string | null;
  payment_status: string | null;
  delivery_date: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  clients?: { name: string } | null;
}

export function useOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["orders", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!user,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Order>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("orders").insert({
        client_id: input.client_id,
        proposal_id: input.proposal_id,
        order_number: input.order_number,
        status: input.status || "pendente",
        total_value: input.total_value || 0,
        payment_method: input.payment_method,
        payment_status: input.payment_status || "pendente",
        delivery_date: input.delivery_date,
        delivery_address: input.delivery_address,
        notes: input.notes,
        organization_id: user.organization_id,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast({ title: "Pedido criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Order> & { id: string }) => {
      const { clients, ...cleanUpdates } = updates as any;
      const { data, error } = await supabase.from("orders").update(cleanUpdates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast({ title: "Pedido atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast({ title: "Pedido removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
