
-- Trigger: prevent non-super_admin from changing their organization_id on profiles
CREATE OR REPLACE FUNCTION public.protect_profile_org_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If organization_id is not changing, allow
  IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  -- Only super_admin can change organization_id
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = OLD.user_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super_admin can change organization_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_profile_org_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_org_change();
