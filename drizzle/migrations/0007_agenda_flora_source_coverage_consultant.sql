ALTER TABLE public.schedules ADD COLUMN source text NOT NULL DEFAULT 'manual';
UPDATE public.schedules SET source = 'flora' WHERE created_by IS NULL AND lead_id IS NOT NULL;
ALTER TABLE public.ekkoa_coverage_areas ADD COLUMN consultant_user_id uuid;
CREATE OR REPLACE FUNCTION public.validate_coverage_consultant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.consultant_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.consultant_user_id AND organization_id = NEW.organization_id AND is_active) THEN
 RAISE EXCEPTION 'Consultor responsável deve ser um usuário ativo da organização';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER validate_coverage_consultant BEFORE INSERT OR UPDATE ON public.ekkoa_coverage_areas FOR EACH ROW EXECUTE FUNCTION public.validate_coverage_consultant();