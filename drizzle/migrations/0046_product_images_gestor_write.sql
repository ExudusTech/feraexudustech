DROP POLICY IF EXISTS "product images insert by admins" ON storage.objects;
DROP POLICY IF EXISTS "product images update by admins" ON storage.objects;
DROP POLICY IF EXISTS "product images delete by admins" ON storage.objects;
CREATE POLICY "product images insert by managers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images'
    AND lower(storage.extension(name)) = ANY (ARRAY['jpg','jpeg','png','webp'])
    AND (public.has_role(auth.uid(), 'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')))));
CREATE POLICY "product images update by managers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images'
    AND (public.has_role(auth.uid(), 'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')))));
CREATE POLICY "product images delete by managers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images'
    AND (public.has_role(auth.uid(), 'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')))));