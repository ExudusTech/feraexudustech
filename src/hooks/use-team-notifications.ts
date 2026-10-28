import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { normalizeWhatsapp } from "@/lib/whatsapp";
export const TEAM_EVENTS = { agendamento: "Agendamento", transferencia: "Transferência", lead_matriz: "Lead da Matriz" };
export type TeamEvent = keyof typeof TEAM_EVENTS;
export type RecipientKind = "usuario" | "externo";
export interface TeamRecipient { id: string; tipo: RecipientKind; user_id: string | null; nome: string; whatsapp: string | null; email: string | null; papel: string; eventos: string[]; ativo: boolean }
export type RecipientInput = Omit<TeamRecipient, "id"> & { id?: string };

/** Returns an error message when the recipient would duplicate an existing user or WhatsApp. */
export function recipientConflict(input: RecipientInput, existing: TeamRecipient[], userPhones: Record<string, string | null>): string | null {
  const others = existing.filter(r => r.id !== input.id);
  if (input.tipo === "usuario") {
    if (!input.user_id) return "Escolha um usuário.";
    if (others.some(r => r.user_id === input.user_id)) return "Este usuário já é destinatário.";
    const phone = userPhones[input.user_id];
    if (!phone) return "Este usuário ainda não tem WhatsApp. Complete o cadastro em Usuários.";
    if (others.some(r => (r.user_id ? userPhones[r.user_id] : r.whatsapp) === phone)) return "Este WhatsApp já está cadastrado como destinatário.";
    return null;
  }
  const phone = normalizeWhatsapp(input.whatsapp);
  if (!phone) return "WhatsApp inválido: use DDD + número (ex.: 22 99999-9999).";
  if (others.some(r => (r.user_id ? userPhones[r.user_id] : r.whatsapp) === phone)) return "Este WhatsApp já está cadastrado como destinatário.";
  return null;
}

export function useTeamRecipients() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["team-recipients", user?.organization_id], enabled: !!user?.organization_id, queryFn: async () => {
    if (!user?.organization_id) throw new Error("Sem organização");
    const { data, error } = await supabase.from("notification_recipients").select("id,tipo,user_id,nome,whatsapp,email,papel,eventos,ativo").eq("organization_id", user.organization_id).order("nome");
    if (error) throw error;
    return data as TeamRecipient[];
  } });
}
export function useSaveTeamRecipient() {
  const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: RecipientInput) => {
    if (!user?.organization_id) throw new Error("Sem organização");
    const { id, ...values } = input;
    if (!values.eventos.length) throw new Error("Selecione pelo menos um evento.");
    if (values.eventos.some(event => !Object.prototype.hasOwnProperty.call(TEAM_EVENTS, event))) throw new Error("Selecione somente eventos válidos.");
    let row: Record<string, unknown>;
    if (values.tipo === "usuario") {
      if (!values.user_id) throw new Error("Escolha um usuário.");
      row = { tipo: "usuario", user_id: values.user_id, nome: values.nome || "Usuário", whatsapp: null, email: null, papel: values.papel || "equipe", eventos: values.eventos, ativo: values.ativo };
    } else {
      const phone = normalizeWhatsapp(values.whatsapp);
      if (!values.nome.trim() || !phone) throw new Error("Informe nome e WhatsApp válido (DDD + número).");
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error("Informe um e-mail válido.");
      row = { tipo: "externo", user_id: null, nome: values.nome.trim(), whatsapp: phone, email: values.email || null, papel: "externo", eventos: values.eventos, ativo: values.ativo };
    }
    const query = id ? supabase.from("notification_recipients").update(row as never).eq("id", id).eq("organization_id", user.organization_id) : supabase.from("notification_recipients").insert({ ...row, organization_id: user.organization_id } as never);
    const { error } = await query.select("id").single();
    if (error) throw new Error(/já está cadastrado|duplicate|23505/i.test(`${error.message} ${error.code}`) ? "Este destinatário já está cadastrado." : "Verifique os dados e tente novamente.");
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["team-recipients"] }); toast({ title: "Destinatário salvo" }); }, onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }) });
}
