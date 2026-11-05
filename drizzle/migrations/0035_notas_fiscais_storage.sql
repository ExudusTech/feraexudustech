
CREATE POLICY "Notas: ler da organização" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notas-fiscais' AND EXISTS (SELECT 1 FROM public.tarefas_faturamento t
    WHERE t.pdf_path = storage.objects.name));
CREATE POLICY "Notas: financeiro envia" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notas-fiscais' AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    AND (public.is_privileged_user(auth.uid()) OR public.is_financeiro(auth.uid())));
CREATE POLICY "Notas: financeiro substitui" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'notas-fiscais' AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    AND (public.is_privileged_user(auth.uid()) OR public.is_financeiro(auth.uid())));
