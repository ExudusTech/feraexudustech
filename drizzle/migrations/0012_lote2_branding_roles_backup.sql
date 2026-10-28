ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS support_color text, ADD COLUMN IF NOT EXISTS heading_font text;

CREATE TABLE public.backup_20261028b_organizations AS SELECT o.*, now() AS backed_up_at FROM public.organizations o WHERE false;
GRANT ALL ON public.backup_20261028b_organizations TO service_role;
ALTER TABLE public.backup_20261028b_organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20261028b_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.backup_20261028b_user_roles TO service_role;
ALTER TABLE public.backup_20261028b_user_roles ENABLE ROW LEVEL SECURITY;

INSERT INTO public.backup_20261028b_organizations SELECT o.*, now() FROM public.organizations o WHERE o.id = '7fd8333b-578a-4db8-b1be-fdcb8339d4e8';
UPDATE public.organizations SET primary_color = '#025159', secondary_color = '#91BF4B', accent_color = '#5EB5BF', support_color = '#182859', heading_font = 'Montserrat' WHERE id = '7fd8333b-578a-4db8-b1be-fdcb8339d4e8';