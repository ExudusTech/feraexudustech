
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  category TEXT,
  brand TEXT,
  unit TEXT NOT NULL DEFAULT 'un',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  specifications JSONB DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products in their org" ON public.products
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert products in their org" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Users can update products in their org" ON public.products
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete products" ON public.products
  FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_products_org ON public.products(organization_id);
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_category ON public.products(category);
