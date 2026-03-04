-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users read visit photos" ON storage.objects;

-- Drop existing upload/insert policy if any
DROP POLICY IF EXISTS "Authenticated users upload visit photos" ON storage.objects;

-- Create org-scoped SELECT policy using path-based organization check
-- Path format: {org_id}/visits/{schedule_id}/{timestamp}.{ext}
CREATE POLICY "Org users read visit photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'visit-photos' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Create org-scoped INSERT policy
CREATE POLICY "Org users upload visit photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'visit-photos' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);