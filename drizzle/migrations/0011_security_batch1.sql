-- 1. Signup: never trust metadata; no profile/org, only 'visitante'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'visitante');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.protect_profile_org_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN RETURN NEW; END IF;
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = OLD.user_id AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Only super_admin can change organization_id';
  END IF;
  RETURN NEW;
END; $$;

-- 2. user_roles: admins never touch super_admin and only their org
DROP POLICY IF EXISTS "Admins can manage roles in their org" ON public.user_roles;
CREATE POLICY "Admins insert roles in their org" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') AND role <> 'super_admin'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = user_roles.user_id AND p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Admins update roles in their org" ON public.user_roles FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') AND role <> 'super_admin'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = user_roles.user_id AND p.organization_id = get_user_organization_id(auth.uid())))
WITH CHECK (has_role(auth.uid(),'admin') AND role <> 'super_admin'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = user_roles.user_id AND p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Admins delete roles in their org" ON public.user_roles FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin') AND role <> 'super_admin'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = user_roles.user_id AND p.organization_id = get_user_organization_id(auth.uid())));

-- 3. Restricted UPDATE
DROP POLICY IF EXISTS "Users can update leads in their org" ON public.leads;
CREATE POLICY "Owners or privileged update leads" ON public.leads FOR UPDATE TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) AND (is_privileged_user(auth.uid()) OR created_by = auth.uid() OR assigned_to = auth.uid()))
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
DROP POLICY IF EXISTS "Users can update clients in their org" ON public.clients;
CREATE POLICY "Owners or privileged update clients" ON public.clients FOR UPDATE TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) AND (is_privileged_user(auth.uid()) OR created_by = auth.uid() OR assigned_user_id = auth.uid()))
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='schedules' AND cmd='UPDATE' LOOP
    EXECUTE format('DROP POLICY %I ON public.schedules', r.policyname);
  END LOOP; END $$;
CREATE POLICY "Owners or privileged update schedules" ON public.schedules FOR UPDATE TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) AND (is_privileged_user(auth.uid()) OR created_by = auth.uid() OR assigned_to = auth.uid()))
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_owner_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'organization_id e created_by não podem ser alterados';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_owner_columns BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.protect_owner_columns();
CREATE TRIGGER protect_owner_columns BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.protect_owner_columns();
CREATE TRIGGER protect_owner_columns BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.protect_owner_columns();

-- 4. Default Flora owner
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS flora_default_lead_owner uuid;

CREATE OR REPLACE FUNCTION public.validate_flora_default_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.flora_default_lead_owner IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = NEW.flora_default_lead_owner AND organization_id = NEW.id AND is_active) THEN
    RAISE EXCEPTION 'Responsável padrão deve ser um usuário ativo da organização';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER validate_flora_default_owner BEFORE INSERT OR UPDATE OF flora_default_lead_owner ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.validate_flora_default_owner();

CREATE TABLE IF NOT EXISTS public.backup_20261028_leads AS SELECT * FROM public.leads WITH NO DATA;
CREATE TABLE IF NOT EXISTS public.backup_20261028_schedules AS SELECT * FROM public.schedules WITH NO DATA;
ALTER TABLE public.backup_20261028_leads ADD COLUMN IF NOT EXISTS backed_up_at timestamptz DEFAULT now();
ALTER TABLE public.backup_20261028_schedules ADD COLUMN IF NOT EXISTS backed_up_at timestamptz DEFAULT now();
ALTER TABLE public.backup_20261028_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261028_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_20261028_leads, public.backup_20261028_schedules FROM anon, authenticated;
GRANT ALL ON public.backup_20261028_leads, public.backup_20261028_schedules TO service_role;

CREATE OR REPLACE FUNCTION public.apply_flora_default_owner(_org uuid, _owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _leads int := 0; _scheds int := 0;
BEGIN
  IF NOT (has_role(auth.uid(),'super_admin') OR (get_user_organization_id(auth.uid()) = _org
     AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gestor')))) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  UPDATE public.organizations SET flora_default_lead_owner = _owner WHERE id = _org;
  IF _owner IS NOT NULL THEN
    INSERT INTO public.backup_20261028_leads SELECT l.*, now() FROM public.leads l
      WHERE l.organization_id = _org AND l.created_by IS NULL AND l.assigned_to IS NULL;
    UPDATE public.leads SET assigned_to = _owner WHERE organization_id = _org AND created_by IS NULL AND assigned_to IS NULL;
    GET DIAGNOSTICS _leads = ROW_COUNT;
    INSERT INTO public.backup_20261028_schedules SELECT s.*, now() FROM public.schedules s
      WHERE s.organization_id = _org AND s.source = 'flora' AND s.assigned_to IS NULL;
    UPDATE public.schedules SET assigned_to = _owner WHERE organization_id = _org AND source = 'flora' AND assigned_to IS NULL;
    GET DIAGNOSTICS _scheds = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('leads', _leads, 'schedules', _scheds);
END; $$;
REVOKE ALL ON FUNCTION public.apply_flora_default_owner(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_flora_default_owner(uuid, uuid) TO authenticated;