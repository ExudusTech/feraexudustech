import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface FinancialTransaction {
  id: string; organization_id: string; client_id: string | null; order_id: string | null;
  contract_id: string | null; payment_method_id: string | null; title: string;
  description: string | null; transaction_type: string; category: string | null;
  amount: number; due_date: string | null; payment_date: string | null;
  status: string; reference_number: string | null; notes: string | null;
  created_by: string; created_at: string; updated_at: string | null;
}

export function useFinancialTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["financial_transactions", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_transactions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as FinancialTransaction[];
    },
    enabled: !!user,
  });
}

export function useCreateFinancialTransaction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<FinancialTransaction>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("financial_transactions").insert({
        title: input.title!, description: input.description, transaction_type: input.transaction_type || "receita",
        category: input.category, amount: input.amount ?? 0, due_date: input.due_date,
        payment_date: input.payment_date, status: input.status || "pendente",
        reference_number: input.reference_number, notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financial_transactions"] }); toast({ title: "Transação criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateFinancialTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FinancialTransaction> & { id: string }) => {
      const { data, error } = await supabase.from("financial_transactions").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financial_transactions"] }); toast({ title: "Transação atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteFinancialTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financial_transactions"] }); toast({ title: "Transação removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

// Operational Expenses
export interface OperationalExpense {
  id: string; organization_id: string; department_id: string | null; payment_method_id: string | null;
  title: string; description: string | null; category: string; amount: number;
  expense_date: string; due_date: string | null; payment_date: string | null;
  recurrence: string | null; status: string; vendor: string | null;
  invoice_number: string | null; notes: string | null;
  created_by: string; created_at: string; updated_at: string | null;
}

export function useOperationalExpenses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["operational_expenses", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("operational_expenses").select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return data as OperationalExpense[];
    },
    enabled: !!user,
  });
}

export function useCreateOperationalExpense() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<OperationalExpense>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("operational_expenses").insert({
        title: input.title!, description: input.description, category: input.category || "geral",
        amount: input.amount ?? 0, expense_date: input.expense_date || new Date().toISOString().slice(0, 10),
        due_date: input.due_date, recurrence: input.recurrence, status: input.status || "pendente",
        vendor: input.vendor, invoice_number: input.invoice_number, notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operational_expenses"] }); toast({ title: "Despesa criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateOperationalExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<OperationalExpense> & { id: string }) => {
      const { data, error } = await supabase.from("operational_expenses").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operational_expenses"] }); toast({ title: "Despesa atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteOperationalExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("operational_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operational_expenses"] }); toast({ title: "Despesa removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

// Maintenance Schedule
export interface MaintenanceItem {
  id: string; organization_id: string; installation_id: string | null; client_id: string | null;
  title: string; description: string | null; maintenance_type: string;
  scheduled_date: string; completed_date: string | null; start_time: string | null;
  end_time: string | null; estimated_cost: number | null; actual_cost: number | null;
  assigned_to: string | null; status: string; recurrence: string | null; notes: string | null;
  created_by: string; created_at: string; updated_at: string | null;
}

export function useMaintenanceSchedule() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["maintenance_schedule", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_schedule").select("*").order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data as MaintenanceItem[];
    },
    enabled: !!user,
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<MaintenanceItem>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("maintenance_schedule").insert({
        title: input.title!, description: input.description, maintenance_type: input.maintenance_type || "preventiva",
        scheduled_date: input.scheduled_date!, start_time: input.start_time, end_time: input.end_time,
        estimated_cost: input.estimated_cost, status: input.status || "agendada",
        recurrence: input.recurrence, notes: input.notes,
        organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["maintenance_schedule"] }); toast({ title: "Manutenção criada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MaintenanceItem> & { id: string }) => {
      const { data, error } = await supabase.from("maintenance_schedule").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["maintenance_schedule"] }); toast({ title: "Manutenção atualizada" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("maintenance_schedule").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["maintenance_schedule"] }); toast({ title: "Manutenção removida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

// Payment Methods
export interface PaymentMethod {
  id: string; organization_id: string; name: string; description: string | null;
  method_type: string; is_active: boolean; sort_order: number | null;
  created_by: string; created_at: string; updated_at: string | null;
}

export function usePaymentMethods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["payment_methods", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_methods").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return data as PaymentMethod[];
    },
    enabled: !!user,
  });
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<PaymentMethod>) => {
      if (!user?.organization_id) throw new Error("Sem organização");
      const { data, error } = await supabase.from("payment_methods").insert({
        name: input.name!, description: input.description, method_type: input.method_type || "outros",
        is_active: input.is_active ?? true, organization_id: user.organization_id, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payment_methods"] }); toast({ title: "Método criado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PaymentMethod> & { id: string }) => {
      const { data, error } = await supabase.from("payment_methods").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payment_methods"] }); toast({ title: "Método atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_methods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payment_methods"] }); toast({ title: "Método removido" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
