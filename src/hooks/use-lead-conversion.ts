import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import type { Lead } from "@/hooks/use-leads";
import type { EkkoaLead } from "@/hooks/use-ekkoa-leads";

export interface ConversionCandidate { id: string; name: string; city: string | null; motivo: "cnpj" | "place_id" | "nome_cidade" }
export type ConversionResult =
  | { status: "convertido" | "ja_convertido"; client_id: string }
  | { status: "duplicados"; candidatos: ConversionCandidate[] };

/**
 * Converts a lead into a client server-side (address, coordinates, contacts, history link).
 * Returns duplicates (CNPJ > place_id > name+city) instead of creating when any exist.
 */
export function useConvertLeadToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { lead: Pick<Lead, "id">; clienteExistente?: string; ignorarDuplicados?: boolean }) => {
      const { data, error } = await supabase.rpc("converter_lead_em_cliente", {
        _lead: args.lead.id, _cliente_existente: args.clienteExistente ?? undefined, _ignorar_duplicados: args.ignorarDuplicados ?? false,
      } as any);
      if (error) throw error;
      return data as unknown as ConversionResult;
    },
    onSuccess: (r) => {
      if (r.status === "duplicados") return;
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["empresa_contatos"] });
      toast({ title: r.status === "ja_convertido" ? "Lead já estava ligado a um cliente" : "Lead convertido em cliente" });
    },
    onError: (e: Error) => toast({ title: "Erro ao converter lead", description: e.message, variant: "destructive" }),
  });
}

export const MOTIVO_LABEL: Record<string, string> = { cnpj: "mesmo CNPJ", place_id: "mesmo local no Google", nome_cidade: "mesmo nome e cidade" };

/** Convert an Ekkoa Lead to an Ekkoa Client (DEPRECATED module). */
export function useConvertEkkoaLeadToClient() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (lead: EkkoaLead) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data: client, error: clientError } = await supabase
        .from("ekkoa_clients")
        .insert({
          name: lead.contact_name || lead.title, email: lead.contact_email, phone: lead.contact_phone, notes: lead.description,
          organization_id: user.organization_id, created_by: user.id, status: "active", client_type: "residencial",
        })
        .select()
        .single();
      if (clientError) throw clientError;
      const { error: leadError } = await supabase.from("ekkoa_leads").update({ stage: "fechado_ganho", client_id: client.id }).eq("id", lead.id);
      if (leadError) throw leadError;
      return client;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ekkoa_leads"] });
      qc.invalidateQueries({ queryKey: ["ekkoa_clients"] });
      toast({ title: "Lead Ekkoa convertido em cliente!" });
    },
    onError: (e: Error) => toast({ title: "Erro ao converter lead", description: e.message, variant: "destructive" }),
  });
}
