CREATE POLICY "Users can view roles in their organization"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = user_roles.user_id
    AND p.organization_id = get_user_organization_id(auth.uid())
  )
);