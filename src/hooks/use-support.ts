import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface SupportTicket {
  id: string;
  organization_id: string;
  ticket_number: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export function useSupportTickets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["support_tickets", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
    enabled: !!user,
  });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<SupportTicket>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("support_tickets").insert({
        title: input.title!, description: input.description, category: input.category || "geral",
        priority: input.priority || "media", status: input.status || "aberto",
        ticket_number: input.ticket_number, organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["support_tickets"] }); toast({ title: "Ticket criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SupportTicket> & { id: string }) => {
      const { data, error } = await supabase.from("support_tickets").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["support_tickets"] }); toast({ title: "Ticket atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("support_tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["support_tickets"] }); toast({ title: "Ticket removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export interface InternalMessage {
  id: string;
  organization_id: string;
  ticket_id: string | null;
  subject: string | null;
  body: string;
  message_type: string;
  is_internal: boolean;
  sender_id: string;
  created_at: string;
  updated_at: string | null;
}

export function useInternalMessages(ticketId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["internal_messages", ticketId],
    queryFn: async () => {
      let q = supabase.from("internal_messages").select("*").order("created_at", { ascending: true });
      if (ticketId) q = q.eq("ticket_id", ticketId);
      const { data, error } = await q;
      if (error) throw error;
      return data as InternalMessage[];
    },
    enabled: !!user && !!ticketId,
  });
}

export function useCreateInternalMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<InternalMessage>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("internal_messages").insert({
        body: input.body!, subject: input.subject, ticket_id: input.ticket_id,
        message_type: input.message_type || "texto", is_internal: input.is_internal ?? false,
        organization_id: user.organization_id, sender_id: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["internal_messages"] }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
