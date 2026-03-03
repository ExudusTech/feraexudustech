import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import type { Lead } from "@/hooks/use-leads";

/**
 * CEP validation helper (Brazilian ZIP code format)
 */
export function validateCEP(cep: string): boolean {
  return /^\d{5}-?\d{3}$/.test(cep);
}

interface ScheduleTestInput {
  lead: Lead;
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
 * Atomic workflow: Schedule test installation from Lead.
 * Creates: installation + operation + consultant schedule + D-1 operational schedule + equipment reservation
 * Updates: lead stage to em_teste
 */
export function useScheduleTestInstallation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: ScheduleTestInput) => {
      if (!user?.organization_id) throw new Error("Sem organização");

      if (input.zipCode && !validateCEP(input.zipCode)) {
        throw new Error("CEP inválido. Use o formato 00000-000");
      }

      const orgId = user.organization_id;
      const userId = user.id;
      const endDateStr = addDays(input.scheduledDate, 15);
      const location = `${input.address}, ${input.city} - ${input.state}`;

      const crmClientId = await resolveCrmClientId(input.lead.client_id);
      const ekkoaClientId = await resolveOrCreateEkkoaClient({
        lead: input.lead,
        orgId,
        userId,
        address: input.address,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
      });

      const { data: installation, error: instError } = await supabase
        .from("ekkoa_installations")
        .insert({
          title: input.installationTitle,
          installation_type: "teste",
          client_id: ekkoaClientId,
          address: input.address,
          city: input.city,
          state: input.state,
          zip_code: input.zipCode,
          status: "em_teste",
          start_date: input.scheduledDate,
          end_date: endDateStr,
          assigned_to: input.assignedTo,
          notes: input.notes,
          organization_id: orgId,
          created_by: userId,
        })
        .select()
        .single();
      if (instError) throw new Error(`Erro ao criar instalação: ${instError.message}`);

      const { data: operation, error: opError } = await supabase
        .from("operations")
        .insert({
          title: `Teste - ${input.lead.title}`,
          description: `Instalação de teste para lead: ${input.lead.contact_name || input.lead.title}`,
          status: "instalacao_agendada",
          priority: "alta",
          client_id: crmClientId,
          assigned_to: input.assignedTo,
          start_date: new Date(input.scheduledDate).toISOString(),
          end_date: new Date(endDateStr).toISOString(),
          location,
          organization_id: orgId,
          created_by: userId,
        })
        .select()
        .single();
      if (opError) throw new Error(`Erro ao criar operação: ${opError.message}`);

      const { error: schedError } = await supabase
        .from("schedules")
        .insert({
          title: `Instalação de Teste - ${input.lead.contact_name || input.lead.title}`,
          description: `Agendamento de instalação de teste para ${input.lead.title}`,
          scheduled_date: input.scheduledDate,
          start_time: input.startTime || null,
          status: "agendado",
          schedule_type: "instalacao_teste",
          client_id: crmClientId,
          assigned_to: input.assignedTo,
          location,
          operation_id: operation.id,
          organization_id: orgId,
          created_by: userId,
        });
      if (schedError) throw new Error(`Erro ao criar agendamento do consultor: ${schedError.message}`);

      const dMinus1Date = addDays(input.scheduledDate, -1);
      const { error: d1Error } = await supabase
        .from("schedules")
        .insert({
          title: `[D-1] NF Remessa - ${input.lead.contact_name || input.lead.title}`,
          description: `Emitir Nota Fiscal de Remessa para instalação agendada em ${input.scheduledDate}`,
          scheduled_date: dMinus1Date,
          status: "agendado",
          schedule_type: "pre_emissao_nf",
          client_id: crmClientId,
          location,
          operation_id: operation.id,
          organization_id: orgId,
          created_by: userId,
        });
      if (d1Error) throw new Error(`Erro ao criar agendamento D-1: ${d1Error.message}`);

      const reserveSerial = `RES-${operation.id.substring(0, 8).toUpperCase()}`;
      const { error: invError } = await supabase
        .from("inventory_items")
        .insert({
          name: `Equipamento reservado - ${input.lead.title}`,
          description: `Reserva automática para teste. Lead: ${input.lead.title}`,
          serial_number: reserveSerial,
          category: "reserva_teste",
          status: "reservado",
          quantity: 1,
          unit: "un",
          location,
          organization_id: orgId,
          created_by: userId,
        });
      if (invError) throw new Error(`Erro ao reservar equipamento: ${invError.message}`);

      const { error: leadError } = await supabase
        .from("leads")
        .update({ stage: "em_teste" })
        .eq("id", input.lead.id);
      if (leadError) throw new Error(`Erro ao atualizar lead: ${leadError.message}`);

      return { installation, operation, reserveSerial };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["ekkoa_installations"] });
      qc.invalidateQueries({ queryKey: ["operations"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast({
        title: "Teste agendado com sucesso!",
        description: `Instalação, operação, agenda (consultor + D-1) e reserva de equipamento (${data.reserveSerial}) criados.`,
      });
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

      const { error: opError } = await supabase
        .from("operations")
        .update({
          status: approved ? "concluida" : "cancelada",
          notes: feedback,
        })
        .eq("id", operationId);
      if (opError) throw opError;

      if (leadId) {
        const { error: leadError } = await supabase
          .from("leads")
          .update({ stage: approved ? "fechado_ganho" : "fechado_perdido" })
          .eq("id", leadId);
        if (leadError) throw leadError;
      }

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
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["ekkoa_contracts"] });
      toast({
        title: vars.approved ? "Teste aprovado!" : "Teste não aprovado",
        description: vars.approved && vars.contractData ? "Contrato criado automaticamente." : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

/**
 * Complete a visit: update equipment serial, GPS, photo, and mark schedule as done
 */
export function useCompleteVisit() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scheduleId,
      operationId,
      installationId,
      equipmentId,
      fragranceLineId,
      realSerialNumber,
      installLocation,
      latitude,
      longitude,
      photoUrl,
      notes,
    }: {
      scheduleId: string;
      operationId?: string | null;
      installationId?: string;
      equipmentId?: string;
      fragranceLineId?: string;
      realSerialNumber?: string;
      installLocation?: string;
      latitude?: number;
      longitude?: number;
      photoUrl?: string;
      notes?: string;
    }) => {
      const { error: schedError } = await supabase
        .from("schedules")
        .update({ status: "concluido", notes })
        .eq("id", scheduleId);
      if (schedError) throw schedError;

      if (operationId) {
        const { error: opError } = await supabase
          .from("operations")
          .update({ status: "em_andamento", notes })
          .eq("id", operationId);
        if (opError) throw opError;
      }

      if (installationId) {
        const updatePayload: Record<string, unknown> = {};
        if (latitude !== undefined) updatePayload.latitude = latitude;
        if (longitude !== undefined) updatePayload.longitude = longitude;
        if (notes) updatePayload.notes = notes;
        if (installLocation) updatePayload.description = `Local: ${installLocation}`;

        if (Object.keys(updatePayload).length > 0) {
          const { error } = await supabase
            .from("ekkoa_installations")
            .update(updatePayload)
            .eq("id", installationId);
          if (error) throw error;
        }
      }

      if (realSerialNumber && operationId) {
        const reservePrefix = `RES-${operationId.substring(0, 8).toUpperCase()}`;
        const { error: invError } = await supabase
          .from("inventory_items")
          .update({
            serial_number: realSerialNumber,
            status: "em_uso",
            installation_date: new Date().toISOString().split("T")[0],
            geolocation: latitude && longitude ? `${latitude},${longitude}` : null,
            photo_url: photoUrl || null,
          })
          .eq("serial_number", reservePrefix);
        if (invError) throw invError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["operations"] });
      qc.invalidateQueries({ queryKey: ["ekkoa_installations"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast({ title: "Visita concluída!", description: "Todos os registros atualizados." });
    },
    onError: (e: Error) => toast({ title: "Erro ao concluir visita", description: e.message, variant: "destructive" }),
  });
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function normalizeText(value?: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

async function resolveCrmClientId(clientId: string | null): Promise<string | null> {
  if (!clientId) return null;
  const { data, error } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (error) throw new Error(`Erro ao validar cliente CRM: ${error.message}`);
  return data?.id ?? null;
}

async function resolveOrCreateEkkoaClient({
  lead,
  orgId,
  userId,
  address,
  city,
  state,
  zipCode,
}: {
  lead: Lead;
  orgId: string;
  userId: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}): Promise<string> {
  if (lead.client_id) {
    const { data: existingEkkoa, error: checkError } = await supabase
      .from("ekkoa_clients")
      .select("id")
      .eq("id", lead.client_id)
      .maybeSingle();

    if (checkError) throw new Error(`Erro ao validar cliente técnico: ${checkError.message}`);
    if (existingEkkoa?.id) return existingEkkoa.id;
  }

  const email = normalizeText(lead.contact_email);
  if (email) {
    const { data: byEmail, error: emailError } = await supabase
      .from("ekkoa_clients")
      .select("id")
      .eq("organization_id", orgId)
      .eq("email", email)
      .maybeSingle();

    if (emailError) throw new Error(`Erro ao buscar cliente técnico por email: ${emailError.message}`);
    if (byEmail?.id) return byEmail.id;
  }

  const contactName = normalizeText(lead.contact_name);
  const fallbackName = normalizeText(lead.title) ?? "Cliente Lead";

  const { data: created, error: createError } = await supabase
    .from("ekkoa_clients")
    .insert({
      name: contactName ?? fallbackName,
      email,
      phone: normalizeText(lead.contact_phone),
      address: normalizeText(address),
      city: normalizeText(city),
      state: normalizeText(state),
      zip_code: normalizeText(zipCode),
      notes: "Cliente técnico criado automaticamente durante o agendamento de teste.",
      organization_id: orgId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (createError) throw new Error(`Erro ao criar cliente técnico: ${createError.message}`);
  return created.id;
}
