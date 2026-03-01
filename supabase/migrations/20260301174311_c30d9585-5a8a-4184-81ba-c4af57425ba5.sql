
-- Clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clients in their org" ON public.clients
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert clients in their org" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update clients in their org" ON public.clients
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete clients" ON public.clients
  FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Lead stages enum
CREATE TYPE public.lead_stage AS ENUM ('novo', 'qualificacao', 'proposta', 'negociacao', 'fechado_ganho', 'fechado_perdido');

-- Leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.clients(id),
  title TEXT NOT NULL,
  description TEXT,
  stage lead_stage NOT NULL DEFAULT 'novo',
  value NUMERIC(12,2) DEFAULT 0,
  source TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  expected_close_date DATE,
  assigned_to UUID,
  created_by UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view leads in their org" ON public.leads
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert leads in their org" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update leads in their org" ON public.leads
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete leads" ON public.leads
  FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_leads_stage ON public.leads(stage);
CREATE INDEX idx_leads_organization ON public.leads(organization_id);
CREATE INDEX idx_clients_organization ON public.clients(organization_id);
