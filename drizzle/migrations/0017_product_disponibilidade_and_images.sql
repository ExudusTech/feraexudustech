CREATE TABLE public.backup_20261029b_products AS SELECT p.*, now() AS backed_up_at FROM public.products p;
GRANT ALL ON public.backup_20261029b_products TO service_role;
ALTER TABLE public.backup_20261029b_products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ADD COLUMN disponibilidade text NOT NULL DEFAULT 'estoque';
UPDATE public.products SET disponibilidade = CASE
  WHEN is_active = false THEN 'descontinuado'
  WHEN specifications->>'disponibilidade' = 'sob_encomenda' THEN 'sob_encomenda'
  ELSE 'estoque' END;
ALTER TABLE public.products ADD CONSTRAINT products_disponibilidade_check CHECK (disponibilidade IN ('estoque','sob_encomenda','descontinuado'));
CREATE INDEX products_org_disponibilidade_idx ON public.products (organization_id, disponibilidade);

CREATE OR REPLACE FUNCTION public.sync_product_disponibilidade()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.disponibilidade IS NOT DISTINCT FROM OLD.disponibilidade THEN
    IF NEW.is_active THEN
      IF NEW.disponibilidade = 'descontinuado' THEN
        NEW.disponibilidade := CASE WHEN NEW.specifications->>'disponibilidade' = 'sob_encomenda' THEN 'sob_encomenda' ELSE 'estoque' END;
      END IF;
    ELSE NEW.disponibilidade := 'descontinuado'; END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.is_active = false THEN
    NEW.disponibilidade := 'descontinuado';
  END IF;
  NEW.is_active := NEW.disponibilidade <> 'descontinuado';
  RETURN NEW;
END; $$;
CREATE TRIGGER sync_product_disponibilidade BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_disponibilidade();

CREATE TABLE public.product_image_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  chat_id text NOT NULL,
  product_id uuid NOT NULL,
  status text NOT NULL,
  error_code text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.product_image_sends TO service_role;
ALTER TABLE public.product_image_sends ENABLE ROW LEVEL SECURITY;
CREATE INDEX product_image_sends_lookup_idx ON public.product_image_sends (chat_id, product_id, sent_at DESC);

CREATE POLICY "product images read by org" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'super_admin') OR (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text));
CREATE POLICY "product images insert by admins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND lower(storage.extension(name)) = ANY (ARRAY['jpg','jpeg','png','webp'])
    AND (public.has_role(auth.uid(),'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text AND public.has_role(auth.uid(),'admin'))));
CREATE POLICY "product images update by admins" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text AND public.has_role(auth.uid(),'admin'))));
CREATE POLICY "product images delete by admins" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text AND public.has_role(auth.uid(),'admin'))));