
-- =============================================
-- MÓDULO EKKOA COMPLETO
-- =============================================

-- 1. Clientes Ekkoa
CREATE TABLE public.ekkoa_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  document TEXT,
  company TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  client_type TEXT NOT NULL DEFAULT 'residencial',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.ekkoa_clients ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ekkoa_clients_org ON public.ekkoa_clients(organization_id);
CREATE INDEX idx_ekkoa_clients_status ON public.ekkoa_clients(status);

CREATE POLICY "Users can view ekkoa_clients in their org" ON public.ekkoa_clients FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_clients in their org" ON public.ekkoa_clients FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_clients in their org" ON public.ekkoa_clients FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_clients" ON public.ekkoa_clients FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ekkoa_clients_updated_at BEFORE UPDATE ON public.ekkoa_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Leads Ekkoa
CREATE TABLE public.ekkoa_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.ekkoa_clients(id),
  title TEXT NOT NULL,
  description TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  source TEXT,
  stage TEXT NOT NULL DEFAULT 'novo',
  value NUMERIC DEFAULT 0,
  assigned_to UUID,
  expected_close_date DATE,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.ekkoa_leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ekkoa_leads_org ON public.ekkoa_leads(organization_id);
CREATE INDEX idx_ekkoa_leads_stage ON public.ekkoa_leads(stage);
CREATE INDEX idx_ekkoa_leads_client ON public.ekkoa_leads(client_id);

CREATE POLICY "Users can view ekkoa_leads in their org" ON public.ekkoa_leads FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_leads in their org" ON public.ekkoa_leads FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_leads in their org" ON public.ekkoa_leads FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_leads" ON public.ekkoa_leads FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ekkoa_leads_updated_at BEFORE UPDATE ON public.ekkoa_leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Equipamentos Ekkoa
CREATE TABLE public.ekkoa_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  model TEXT,
  brand TEXT,
  serial_number TEXT,
  category TEXT,
  power_watts NUMERIC,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC DEFAULT 0,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.ekkoa_equipment ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ekkoa_equipment_org ON public.ekkoa_equipment(organization_id);
CREATE INDEX idx_ekkoa_equipment_category ON public.ekkoa_equipment(category);

CREATE POLICY "Users can view ekkoa_equipment in their org" ON public.ekkoa_equipment FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_equipment in their org" ON public.ekkoa_equipment FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_equipment in their org" ON public.ekkoa_equipment FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_equipment" ON public.ekkoa_equipment FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ekkoa_equipment_updated_at BEFORE UPDATE ON public.ekkoa_equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Instalações Ekkoa
CREATE TABLE public.ekkoa_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.ekkoa_clients(id),
  title TEXT NOT NULL,
  description TEXT,
  installation_type TEXT NOT NULL DEFAULT 'residencial',
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  power_kwp NUMERIC,
  panels_count INTEGER,
  inverter_model TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planejada',
  assigned_to UUID,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.ekkoa_installations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ekkoa_installations_org ON public.ekkoa_installations(organization_id);
CREATE INDEX idx_ekkoa_installations_client ON public.ekkoa_installations(client_id);
CREATE INDEX idx_ekkoa_installations_status ON public.ekkoa_installations(status);

CREATE POLICY "Users can view ekkoa_installations in their org" ON public.ekkoa_installations FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_installations in their org" ON public.ekkoa_installations FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_installations in their org" ON public.ekkoa_installations FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_installations" ON public.ekkoa_installations FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ekkoa_installations_updated_at BEFORE UPDATE ON public.ekkoa_installations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Contratos Ekkoa
CREATE TABLE public.ekkoa_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.ekkoa_clients(id),
  installation_id UUID REFERENCES public.ekkoa_installations(id),
  contract_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  contract_type TEXT NOT NULL DEFAULT 'instalacao',
  start_date DATE,
  end_date DATE,
  total_value NUMERIC NOT NULL DEFAULT 0,
  monthly_value NUMERIC DEFAULT 0,
  payment_method TEXT,
  payment_terms TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  signed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.ekkoa_contracts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ekkoa_contracts_org ON public.ekkoa_contracts(organization_id);
CREATE INDEX idx_ekkoa_contracts_client ON public.ekkoa_contracts(client_id);
CREATE INDEX idx_ekkoa_contracts_status ON public.ekkoa_contracts(status);

CREATE POLICY "Users can view ekkoa_contracts in their org" ON public.ekkoa_contracts FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_contracts in their org" ON public.ekkoa_contracts FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_contracts in their org" ON public.ekkoa_contracts FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_contracts" ON public.ekkoa_contracts FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ekkoa_contracts_updated_at BEFORE UPDATE ON public.ekkoa_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Faturamento Ekkoa
CREATE TABLE public.ekkoa_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.ekkoa_clients(id),
  contract_id UUID REFERENCES public.ekkoa_contracts(id),
  installation_id UUID REFERENCES public.ekkoa_installations(id),
  invoice_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  billing_type TEXT NOT NULL DEFAULT 'unico',
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  payment_date TIMESTAMPTZ,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.ekkoa_billing ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ekkoa_billing_org ON public.ekkoa_billing(organization_id);
CREATE INDEX idx_ekkoa_billing_client ON public.ekkoa_billing(client_id);
CREATE INDEX idx_ekkoa_billing_contract ON public.ekkoa_billing(contract_id);
CREATE INDEX idx_ekkoa_billing_status ON public.ekkoa_billing(status);
CREATE INDEX idx_ekkoa_billing_due_date ON public.ekkoa_billing(due_date);

CREATE POLICY "Users can view ekkoa_billing in their org" ON public.ekkoa_billing FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_billing in their org" ON public.ekkoa_billing FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_billing in their org" ON public.ekkoa_billing FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_billing" ON public.ekkoa_billing FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ekkoa_billing_updated_at BEFORE UPDATE ON public.ekkoa_billing FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Equipamentos por Instalação (tabela de junção)
CREATE TABLE public.ekkoa_installation_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  installation_id UUID NOT NULL REFERENCES public.ekkoa_installations(id),
  equipment_id UUID NOT NULL REFERENCES public.ekkoa_equipment(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ekkoa_installation_equipment ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ekkoa_inst_equip_org ON public.ekkoa_installation_equipment(organization_id);
CREATE INDEX idx_ekkoa_inst_equip_inst ON public.ekkoa_installation_equipment(installation_id);

CREATE POLICY "Users can view ekkoa_installation_equipment in their org" ON public.ekkoa_installation_equipment FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_installation_equipment in their org" ON public.ekkoa_installation_equipment FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update ekkoa_installation_equipment in their org" ON public.ekkoa_installation_equipment FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_installation_equipment" ON public.ekkoa_installation_equipment FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));
