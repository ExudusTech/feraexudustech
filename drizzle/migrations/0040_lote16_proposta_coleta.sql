ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS proposals_origem_schedule_uniq ON public.proposals(origem_schedule_id) WHERE origem_schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS proposals_lead_idx ON public.proposals(lead_id);
ALTER TABLE public.proposal_items ALTER COLUMN unit_price DROP NOT NULL, ALTER COLUMN total_price DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS comodato_id uuid REFERENCES public.comodatos(id) ON DELETE SET NULL;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS proposta_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.lead_comodatos_para_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    UPDATE public.comodatos SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
    UPDATE public.proposals SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END $$;