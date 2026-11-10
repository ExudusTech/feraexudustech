DROP POLICY IF EXISTS "Notas: ler da organização" ON storage.objects;
CREATE POLICY "Notas: ler da organização" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'notas-fiscais'
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    )
  );