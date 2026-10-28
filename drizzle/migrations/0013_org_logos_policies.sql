CREATE POLICY "org logos read by authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'org-logos');
CREATE POLICY "org logos insert by managers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-logos'
    AND lower(storage.extension(name)) IN ('png','jpg','jpeg','svg')
    AND (public.has_role(auth.uid(),'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
      AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')))));
CREATE POLICY "org logos update by managers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'org-logos' AND (public.has_role(auth.uid(),'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
      AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')))));
CREATE POLICY "org logos delete by managers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'org-logos' AND (public.has_role(auth.uid(),'super_admin') OR ((storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
      AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')))));