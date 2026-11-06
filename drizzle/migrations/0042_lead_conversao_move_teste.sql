CREATE OR REPLACE FUNCTION public.lead_comodatos_para_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    -- Points (planned and EM_TESTE devices), proposals, the lead's visits and billing tasks follow the new client.
    UPDATE public.comodatos SET client_id = NEW.client_id,
      status = CASE WHEN upper(coalesce(status,'')) = 'EM_TESTE' THEN 'ATIVO' ELSE status END
      WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
    UPDATE public.proposals SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
    UPDATE public.schedules SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
    UPDATE public.tarefas_faturamento SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END $$;