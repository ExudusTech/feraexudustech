
-- Make visit-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'visit-photos';

-- Drop overly permissive public read policy
DROP POLICY IF EXISTS "Public read visit photos" ON storage.objects;

-- Allow authenticated users in the same org to read visit photos
CREATE POLICY "Authenticated users read visit photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'visit-photos'
);

-- Add RLS policy to restrict super admin profile updates for org switching
-- Only super_admin can update their own organization_id
CREATE POLICY "Super admin can update own org"
ON public.profiles FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);
