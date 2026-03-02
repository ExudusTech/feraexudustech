-- Allow super_admin to view ALL organizations
CREATE POLICY "Super admins can view all organizations"
ON public.organizations
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to update ALL organizations
CREATE POLICY "Super admins can update all organizations"
ON public.organizations
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to view ALL profiles (cross-org)
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to update ALL profiles (cross-org)
CREATE POLICY "Super admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admin to manage ALL roles (cross-org)
CREATE POLICY "Super admins can manage all roles"
ON public.user_roles
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
