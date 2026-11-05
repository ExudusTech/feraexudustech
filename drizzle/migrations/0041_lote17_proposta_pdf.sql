ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS numero integer,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS prazo_entrega text,
  ADD COLUMN IF NOT EXISTS periodicidade_manutencao text,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_gerado_em timestamptz;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS proposta_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proposta_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.proposal_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    UPDATE organizations SET proposta_seq = proposta_seq + 1 WHERE id = NEW.organization_id RETURNING proposta_seq INTO NEW.numero;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proposal_numero ON public.proposals;
CREATE TRIGGER trg_proposal_numero BEFORE INSERT ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.proposal_numero();

-- backfill existing proposals per organization
WITH n AS (SELECT id, organization_id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at, id) rn FROM public.proposals WHERE numero IS NULL)
UPDATE public.proposals p SET numero = n.rn FROM n WHERE p.id = n.id;
UPDATE public.organizations o SET proposta_seq = COALESCE((SELECT max(numero) FROM public.proposals WHERE organization_id = o.id), 0);
CREATE UNIQUE INDEX IF NOT EXISTS proposals_org_numero_uniq ON public.proposals(organization_id, numero);