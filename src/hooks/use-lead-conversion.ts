import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import type { Lead } from "@/hooks/use-leads";
import type { EkkoaLead } from "@/hooks/use-ekkoa-leads";

/** Convert a CRM Lead to a Client, updating stage to fechado_ganho */
export function useConvertLeadToClient() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (lead: Lead) => {
      if (!user?.organization_id) throw new Error("Sem organização");

      // 1. Create client from lead data
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          name: lead.contact_name || lead.title,
          email: lead.contact_email,
          phone: lead.contact_phone,
          notes: lead.description,
          organization_id: user.organization_id,
          created_by: user.id,
          status: "active",
        })
        .select()
        .single();
      if (clientError) throw clientError;

      // 2. Update lead stage and link to client
      const { error: leadError } = await supabase
        .from("leads")
        .update({ stage: "fechado_ganho", client_id: client.id })
        .eq("id", lead.id);
      if (leadError) throw leadError;

      return client;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Lead convertido em cliente com sucesso!" });
    },
    onError: (e: Error) => toast({ title: "Erro ao converter lead", description: e.message, variant: "destructive" }),
  });
}

/** Convert an Ekkoa Lead to an Ekkoa Client */
export function useConvertEkkoaLeadToClient() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (lead: EkkoaLead) => {
      if (!user?.organization_id) throw new Error("Sem organização");

      // 1. Create ekkoa client
      const { data: client, error: clientError } = await supabase
        .from("ekkoa_clients")
        .insert({
          name: lead.contact_name || lead.title,
          email: lead.contact_email,
          phone: lead.contact_phone,
          notes: lead.description,
          organization_id: user.organization_id,
          created_by: user.id,
          status: "active",
          client_type: "residencial",
        })
        .select()
        .single();
      if (clientError) throw clientError;

      // 2. Update ekkoa lead stage and link
      const { error: leadError } = await supabase
        .from("ekkoa_leads")
        .update({ stage: "fechado_ganho", client_id: client.id })
        .eq("id", lead.id);
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
