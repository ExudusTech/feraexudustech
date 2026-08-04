ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fornecedor text;

CREATE UNIQUE INDEX IF NOT EXISTS products_org_sku_unique
  ON public.products (organization_id, sku)
  WHERE sku IS NOT NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS public.product_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  imported_by uuid,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'concluido',
  error_log jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.product_imports TO authenticated;
GRANT ALL ON public.product_imports TO service_role;

ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view imports in their organization"
  ON public.product_imports FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can create imports in their organization"
  ON public.product_imports FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can update imports in their organization"
  ON public.product_imports FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_product_imports_updated_at
  BEFORE UPDATE ON public.product_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();