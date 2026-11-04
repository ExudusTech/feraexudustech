ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS google_event_id text;
ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'feriado';
ALTER TABLE public.holidays ADD CONSTRAINT holidays_source_check CHECK (source IN ('manual','google'));
ALTER TABLE public.holidays ADD CONSTRAINT holidays_kind_check CHECK (kind IN ('feriado','bloqueio'));
CREATE INDEX IF NOT EXISTS holidays_org_source_date_idx ON public.holidays (organization_id, source, date);

CREATE TABLE public.google_calendar_busy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_calendar_busy TO service_role;
ALTER TABLE public.google_calendar_busy ENABLE ROW LEVEL SECURITY;
CREATE INDEX google_calendar_busy_org_start_idx ON public.google_calendar_busy (organization_id, start_at);

CREATE TABLE public.google_calendar_sync_status (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_email text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  holidays_count integer NOT NULL DEFAULT 0,
  blocks_count integer NOT NULL DEFAULT 0,
  busy_count integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.google_calendar_sync_status TO authenticated;
GRANT ALL ON public.google_calendar_sync_status TO service_role;
ALTER TABLE public.google_calendar_sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read calendar sync status" ON public.google_calendar_sync_status
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));