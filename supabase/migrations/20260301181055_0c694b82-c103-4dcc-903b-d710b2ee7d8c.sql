
-- =============================================
-- MÓDULO COMERCIAL / VENDAS
-- =============================================

-- 1. Propostas comerciais
CREATE TABLE public.proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.clients(id),
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  total_value NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  discount_value NUMERIC DEFAULT 0,
  final_value NUMERIC NOT NULL DEFAULT 0,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view proposals in their org" ON public.proposals
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert proposals in their org" ON public.proposals
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update proposals in their org" ON public.proposals
  FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete proposals" ON public.proposals
  FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_proposals_org ON public.proposals(organization_id);
CREATE INDEX idx_proposals_client ON public.proposals(client_id);
CREATE INDEX idx_proposals_status ON public.proposals(status);

CREATE TRIGGER update_proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Itens de cada proposta
CREATE TABLE public.proposal_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view proposal_items in their org" ON public.proposal_items
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert proposal_items in their org" ON public.proposal_items
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update proposal_items in their org" ON public.proposal_items
  FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete proposal_items" ON public.proposal_items
  FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_proposal_items_proposal ON public.proposal_items(proposal_id);

-- 3. Pedidos
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.clients(id),
  proposal_id UUID REFERENCES public.proposals(id),
  created_by UUID NOT NULL,
  order_number TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  total_value NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pendente',
  delivery_date DATE,
  delivery_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view orders in their org" ON public.orders
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert orders in their org" ON public.orders
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update orders in their org" ON public.orders
  FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete orders" ON public.orders
  FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_orders_org ON public.orders(organization_id);
CREATE INDEX idx_orders_client ON public.orders(client_id);
CREATE INDEX idx_orders_status ON public.orders(status);

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Catálogos personalizados por empresa
CREATE TABLE public.organization_catalogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.organization_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view catalogs in their org" ON public.organization_catalogs
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert catalogs in their org" ON public.organization_catalogs
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update catalogs in their org" ON public.organization_catalogs
  FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete catalogs" ON public.organization_catalogs
  FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_catalogs_org ON public.organization_catalogs(organization_id);

CREATE TRIGGER update_catalogs_updated_at
  BEFORE UPDATE ON public.organization_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Itens de cada catálogo
CREATE TABLE public.catalog_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  catalog_id UUID NOT NULL REFERENCES public.organization_catalogs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  custom_price NUMERIC,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view catalog_items in their org" ON public.catalog_items
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert catalog_items in their org" ON public.catalog_items
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update catalog_items in their org" ON public.catalog_items
  FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete catalog_items" ON public.catalog_items
  FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_catalog_items_catalog ON public.catalog_items(catalog_id);
CREATE INDEX idx_catalog_items_product ON public.catalog_items(product_id);
