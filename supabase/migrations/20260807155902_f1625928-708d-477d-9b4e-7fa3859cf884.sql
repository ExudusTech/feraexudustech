CREATE TABLE public.dispenser_families (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispenser_families TO authenticated;
GRANT ALL ON public.dispenser_families TO service_role;

ALTER TABLE public.dispenser_families ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dispenser families in their organization"
ON public.dispenser_families FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert dispenser families in their organization"
ON public.dispenser_families FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update dispenser families in their organization"
ON public.dispenser_families FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Privileged users can delete dispenser families"
ON public.dispenser_families FOR DELETE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid()));

CREATE TRIGGER update_dispenser_families_updated_at
BEFORE UPDATE ON public.dispenser_families
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_dispenser BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispenser_family_id UUID REFERENCES public.dispenser_families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compatible_dispenser_families UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS dispenser_family_id UUID REFERENCES public.dispenser_families(id) ON DELETE SET NULL;

ALTER TABLE public.comodatos
  ADD COLUMN IF NOT EXISTS dispenser_family_id UUID REFERENCES public.dispenser_families(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_dispenser_family ON public.products(dispenser_family_id);
CREATE INDEX IF NOT EXISTS idx_inventory_dispenser_family ON public.inventory_items(dispenser_family_id);
CREATE INDEX IF NOT EXISTS idx_comodatos_dispenser_family ON public.comodatos(dispenser_family_id);