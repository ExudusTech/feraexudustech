
-- =============================================
-- MÓDULO FINANCEIRO
-- =============================================

-- 1. Métodos de Pagamento
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  method_type TEXT NOT NULL DEFAULT 'outros',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payment_methods_org ON public.payment_methods(organization_id);

CREATE POLICY "Users can view payment_methods in their org" ON public.payment_methods FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert payment_methods in their org" ON public.payment_methods FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update payment_methods in their org" ON public.payment_methods FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete payment_methods" ON public.payment_methods FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Transações Financeiras
CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.clients(id),
  order_id UUID REFERENCES public.orders(id),
  contract_id UUID REFERENCES public.ekkoa_contracts(id),
  payment_method_id UUID REFERENCES public.payment_methods(id),
  title TEXT NOT NULL,
  description TEXT,
  transaction_type TEXT NOT NULL DEFAULT 'receita',
  category TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  payment_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pendente',
  reference_number TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fin_transactions_org ON public.financial_transactions(organization_id);
CREATE INDEX idx_fin_transactions_client ON public.financial_transactions(client_id);
CREATE INDEX idx_fin_transactions_type ON public.financial_transactions(transaction_type);
CREATE INDEX idx_fin_transactions_status ON public.financial_transactions(status);
CREATE INDEX idx_fin_transactions_due ON public.financial_transactions(due_date);

CREATE POLICY "Users can view financial_transactions in their org" ON public.financial_transactions FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert financial_transactions in their org" ON public.financial_transactions FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update financial_transactions in their org" ON public.financial_transactions FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete financial_transactions" ON public.financial_transactions FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_financial_transactions_updated_at BEFORE UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Despesas Operacionais
CREATE TABLE public.operational_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  department_id UUID REFERENCES public.departments(id),
  payment_method_id UUID REFERENCES public.payment_methods(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'geral',
  amount NUMERIC NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_date TIMESTAMPTZ,
  recurrence TEXT DEFAULT 'unico',
  status TEXT NOT NULL DEFAULT 'pendente',
  vendor TEXT,
  invoice_number TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.operational_expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_op_expenses_org ON public.operational_expenses(organization_id);
CREATE INDEX idx_op_expenses_category ON public.operational_expenses(category);
CREATE INDEX idx_op_expenses_status ON public.operational_expenses(status);
CREATE INDEX idx_op_expenses_date ON public.operational_expenses(expense_date);
CREATE INDEX idx_op_expenses_department ON public.operational_expenses(department_id);

CREATE POLICY "Users can view operational_expenses in their org" ON public.operational_expenses FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert operational_expenses in their org" ON public.operational_expenses FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update operational_expenses in their org" ON public.operational_expenses FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete operational_expenses" ON public.operational_expenses FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_operational_expenses_updated_at BEFORE UPDATE ON public.operational_expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Agenda de Manutenção
CREATE TABLE public.maintenance_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  installation_id UUID REFERENCES public.ekkoa_installations(id),
  client_id UUID REFERENCES public.clients(id),
  title TEXT NOT NULL,
  description TEXT,
  maintenance_type TEXT NOT NULL DEFAULT 'preventiva',
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  start_time TIME,
  end_time TIME,
  estimated_cost NUMERIC DEFAULT 0,
  actual_cost NUMERIC DEFAULT 0,
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'agendada',
  recurrence TEXT DEFAULT 'unico',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.maintenance_schedule ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_maintenance_org ON public.maintenance_schedule(organization_id);
CREATE INDEX idx_maintenance_installation ON public.maintenance_schedule(installation_id);
CREATE INDEX idx_maintenance_status ON public.maintenance_schedule(status);
CREATE INDEX idx_maintenance_date ON public.maintenance_schedule(scheduled_date);

CREATE POLICY "Users can view maintenance_schedule in their org" ON public.maintenance_schedule FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert maintenance_schedule in their org" ON public.maintenance_schedule FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update maintenance_schedule in their org" ON public.maintenance_schedule FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete maintenance_schedule" ON public.maintenance_schedule FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_maintenance_schedule_updated_at BEFORE UPDATE ON public.maintenance_schedule FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
