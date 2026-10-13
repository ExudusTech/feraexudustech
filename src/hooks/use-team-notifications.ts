import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
export const TEAM_EVENTS = { agendamento: "Agendamento", transferencia: "Transferência", lead_matriz: "Lead da Matriz", fora_cobertura: "Fora de cobertura" };
export type TeamEvent = keyof typeof TEAM_EVENTS;
export interface TeamRecipient { id: string; nome: string; whatsapp: string | null; email: string | null; papel: string; eventos: string[]; ativo: boolean }
export function useTeamRecipients() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["team-recipients", user?.organization_id], enabled: !!user?.organization_id, queryFn: async () => {
    if (!user?.organization_id) throw new Error("Sem organização");
    const { data, error } = await supabase.from("notification_recipients").select("id,nome,whatsapp,email,papel,eventos,ativo").eq("organization_id", user.organization_id).order("nome");
    if (error) throw error;
    return data as TeamRecipient[];
  } });
}
export function useSaveTeamRecipient() {
  const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: Omit<TeamRecipient, "id"> & { id?: string }) => {
    if (!user?.organization_id) throw new Error("Sem organização");
    const { id, ...values } = input;
    if (!values.nome.trim() || !/^[1-9]\d{7,14}$/.test(values.whatsapp ?? "")) throw new Error("Informe nome e WhatsApp com código do país, sem +.");
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error("Informe um e-mail válido.");
    if (!values.papel.trim() || !values.eventos.length) throw new Error("Informe papel e pelo menos um evento.");
    const query = id ? supabase.from("notification_recipients").update(values).eq("id", id).eq("organization_id", user.organization_id) : supabase.from("notification_recipients").insert({ ...values, organization_id: user.organization_id });
    const { error } = await query.select("id").single(); if (error) throw error;
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["team-recipients"] }); toast({ title: "Destinatário salvo" }); }, onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }) });
}
