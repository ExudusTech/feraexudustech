CREATE TABLE public.holidays (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid REFERENCES public.organizations(id),
 date date NOT NULL,
 name text NOT NULL,
 city text,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read shared and own holidays" ON public.holidays FOR SELECT TO authenticated USING (organization_id IS NULL OR organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins insert own holidays" ON public.holidays FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Admins update own holidays" ON public.holidays FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))) WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Admins delete own holidays" ON public.holidays FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.has_role(auth.uid(), 'admin')));
CREATE INDEX holidays_date_org_idx ON public.holidays(date, organization_id);
CREATE UNIQUE INDEX holidays_unique_scope_idx ON public.holidays(date, COALESCE(organization_id::text, ''), COALESCE(lower(city), ''));
COMMENT ON TABLE public.holidays IS 'Shared national/RJ calendar and tenant-specific municipal holidays. Shared entries are managed only by super_admin or service_role.';