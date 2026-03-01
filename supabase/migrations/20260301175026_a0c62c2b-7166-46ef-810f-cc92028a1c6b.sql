
-- Operation status enum
CREATE TYPE public.operation_status AS ENUM ('pendente', 'em_andamento', 'concluida', 'cancelada');

-- Operations table
CREATE TABLE public.operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  status operation_status NOT NULL DEFAULT 'pendente',
  priority TEXT NOT NULL DEFAULT 'media',
  client_id UUID REFERENCES public.clients(id),
  assigned_to UUID,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  location TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view operations in their org" ON public.operations
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert operations in their org" ON public.operations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update operations in their org" ON public.operations
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete operations" ON public.operations
  FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_operations_updated_at BEFORE UPDATE ON public.operations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_operations_org ON public.operations(organization_id);
CREATE INDEX idx_operations_status ON public.operations(status);

-- Schedules table
CREATE TABLE public.schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  status TEXT NOT NULL DEFAULT 'agendado',
  client_id UUID REFERENCES public.clients(id),
  assigned_to UUID,
  location TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedules in their org" ON public.schedules
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert schedules in their org" ON public.schedules
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update schedules in their org" ON public.schedules
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete schedules" ON public.schedules
  FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_schedules_org ON public.schedules(organization_id);
CREATE INDEX idx_schedules_date ON public.schedules(scheduled_date);

-- Inventory items table
CREATE TABLE public.inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'un',
  unit_cost NUMERIC(12,2) DEFAULT 0,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory in their org" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert inventory in their org" ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update inventory in their org" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete inventory" ON public.inventory_items
  FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_inventory_org ON public.inventory_items(organization_id);
CREATE INDEX idx_inventory_sku ON public.inventory_items(sku);
