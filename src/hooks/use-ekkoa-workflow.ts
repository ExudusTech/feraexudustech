import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import type { EkkoaLead } from "@/hooks/use-ekkoa-leads";

/**
 * CEP validation helper (Brazilian ZIP code format)
 */
export function validateCEP(cep: string): boolean {
  return /^\d{5}-?\d{3}$/.test(cep);
}

/**
 * Validates required fields for Ekkoa lead before scheduling test
 */
export function validateEkkoaLeadForTest(lead: Partial<EkkoaLead>): string | null {
  if (!lead.contact_name) return "Nome do contato é obrigatório";
  if (!lead.contact_phone) return "Telefone do contato é obrigatório";
  if (!lead.assigned_to) return "Vendedor responsável é obrigatório";
  return null;
}

interface ScheduleTestInput {
  lead: EkkoaLead;
  installationTitle: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  scheduledDate: string;
  startTime?: string;
  assignedTo: string;
  notes?: string;
}

/**
 * Atomic workflow: Schedule test installation from Ekkoa Lead.
 * Creates: installation + schedule + updates lead stage + creates operation
 */
export function useScheduleTestInstallation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: ScheduleTestInput) => {
      if (!user?.organization_id) throw new Error("Sem organização");

      // Validate CEP
      if (input.zipCode && !validateCEP(input.zipCode)) {
        throw new Error("CEP inválido. Use o formato 00000-000");
      }

      // 1. Create Ekkoa installation (test type)
      const { data: installation, error: instError } = await supabase
        .from("ekkoa_installations")
        .insert({
          title: input.installationTitle,
          installation_type: "teste",
          client_id: input.lead.client_id,
          address: input.address,
          city: input.city,
          state: input.state,
          zip_code: input.zipCode,
          status: "em_teste",
          start_date: input.scheduledDate,
          end_date: addDays(input.scheduledDate, 15), // 15 day test period
          assigned_to: input.assignedTo,
          notes: input.notes,
          organization_id: user.organization_id,
          created_by: user.id,
        })
        .select()
        .single();
      if (instError) throw instError;

      // 2. Create operation linked to the test
      const { data: operation, error: opError } = await supabase
        .from("operations")
        .insert({
          title: `Teste - ${input.lead.title}`,
          description: `Instalação de teste para lead: ${input.lead.contact_name}`,
          status: "em_andamento" as const,
          priority: "alta",
          client_id: input.lead.client_id,
          assigned_to: input.assignedTo,
          start_date: new Date(input.scheduledDate).toISOString(),
          end_date: new Date(addDays(input.scheduledDate, 15)).toISOString(),
          location: `${input.address}, ${input.city} - ${input.state}`,
          organization_id: user.organization_id,
          created_by: user.id,
        })
        .select()
        .single();
      if (opError) throw opError;

      // 3. Create schedule entry for the consultant
      const { error: schedError } = await supabase
        .from("schedules")
        .insert({
          title: `Instalação Teste - ${input.lead.contact_name}`,
          description: `Agendamento de instalação de teste para ${input.lead.title}`,
          scheduled_date: input.scheduledDate,
          start_time: input.startTime || null,
          status: "agendado",
          client_id: input.lead.client_id,
          assigned_to: input.assignedTo,
          location: `${input.address}, ${input.city} - ${input.state}`,
          operation_id: operation.id,
          organization_id: user.organization_id,
          created_by: user.id,
        });
      if (schedError) throw schedError;

      // 4. Update lead stage to em_teste
      const { error: leadError } = await supabase
        .from("ekkoa_leads")
        .update({ stage: "em_teste" })
        .eq("id", input.lead.id);
      if (leadError) throw leadError;

      return { installation, operation };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ekkoa_leads"] });
      qc.invalidateQueries({ queryKey: ["ekkoa_installations"] });
      qc.invalidateQueries({ queryKey: ["operations"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
      toast({ title: "Teste agendado com sucesso!", description: "Instalação, operação e agenda criados." });
    },
    onError: (e: Error) => toast({ title: "Erro ao agendar teste", description: e.message, variant: "destructive" }),
  });
}

/**
 * Extend a test period by +10 days
 */
export function useExtendTest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ operationId, currentEndDate }: { operationId: string; currentEndDate: string }) => {
      const newEndDate = addDays(currentEndDate, 10);
      const { error } = await supabase
        .from("operations")
        .update({ end_date: new Date(newEndDate).toISOString() })
        .eq("id", operationId);
      if (error) throw error;
      return newEndDate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operations"] });
      toast({ title: "Teste estendido em 10 dias" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

/**
 * Submit feedback for a test (converts to won or lost)
 */
export function useSubmitTestFeedback() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      operationId,
      leadId,
      approved,
      feedback,
      contractData,
    }: {
      operationId: string;
      leadId?: string;
      approved: boolean;
      feedback: string;
      contractData?: {
        title: string;
        contractType: string;
        monthlyValue: number;
        durationMonths: number;
        clientId?: string;
      };
    }) => {
      if (!user?.organization_id) throw new Error("Sem organização");

      // Update operation status
      const { error: opError } = await supabase
        .from("operations")
        .update({
          status: approved ? "concluida" : "cancelada",
          notes: feedback,
        })
        .eq("id", operationId);
      if (opError) throw opError;

      // Update lead stage if linked
      if (leadId) {
        const { error: leadError } = await supabase
          .from("ekkoa_leads")
          .update({ stage: approved ? "fechado_ganho" : "fechado_perdido" })
          .eq("id", leadId);
        if (leadError) throw leadError;
      }

      // Auto-create contract on approval
      if (approved && contractData) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + contractData.durationMonths);

        const { error: contractError } = await supabase
          .from("ekkoa_contracts")
          .insert({
            title: contractData.title,
            contract_type: contractData.contractType,
            monthly_value: contractData.monthlyValue,
            total_value: contractData.monthlyValue * contractData.durationMonths,
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
            client_id: contractData.clientId || null,
            status: "ativo",
            organization_id: user.organization_id,
            created_by: user.id,
          });
        if (contractError) throw contractError;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["operations"] });
      qc.invalidateQueries({ queryKey: ["ekkoa_leads"] });
      qc.invalidateQueries({ queryKey: ["ekkoa_contracts"] });
      toast({
        title: vars.approved ? "Teste aprovado!" : "Teste não aprovado",
        description: vars.approved && vars.contractData ? "Contrato criado automaticamente." : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

// Helper to add days to a date string
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}
