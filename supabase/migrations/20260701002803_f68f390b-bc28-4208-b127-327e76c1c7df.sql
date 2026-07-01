
DO $$ BEGIN
  CREATE TYPE canal_origem_enum AS ENUM ('WIDGET','WHATSAPP','MESSENGER','INSTAGRAM','TELEGRAM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS canal_origem canal_origem_enum,
  ADD COLUMN IF NOT EXISTS origem_especifica TEXT,
  ADD COLUMN IF NOT EXISTS interaction_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS flora_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS precisa_humano BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fora_cobertura BOOLEAN DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS leads_interaction_id_unique
  ON public.leads(interaction_id) WHERE interaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_canal_origem_idx ON public.leads(canal_origem);
CREATE INDEX IF NOT EXISTS leads_instagram_handle_idx ON public.leads(instagram_handle);

CREATE TABLE IF NOT EXISTS public.flora_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  interaction_id TEXT NOT NULL,
  canal canal_origem_enum,
  tool_name TEXT NOT NULL,
  payload JSONB,
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT ON public.flora_interactions TO authenticated;
GRANT ALL ON public.flora_interactions TO service_role;

CREATE INDEX IF NOT EXISTS flora_interactions_interaction_id_idx ON public.flora_interactions(interaction_id);
CREATE INDEX IF NOT EXISTS flora_interactions_lead_id_idx ON public.flora_interactions(lead_id);
CREATE INDEX IF NOT EXISTS flora_interactions_org_idx ON public.flora_interactions(organization_id);

ALTER TABLE public.flora_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_can_view_flora_interactions"
  ON public.flora_interactions FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "service_role_full_access_flora_interactions"
  ON public.flora_interactions FOR ALL
  USING (auth.role() = 'service_role');
