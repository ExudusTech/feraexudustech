CREATE OR REPLACE FUNCTION public.lead_link_contato_e_cliente() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.client_id IS NULL THEN
    SELECT c.id INTO NEW.client_id FROM public.clients c WHERE c.organization_id = NEW.organization_id
      AND ((NEW.place_id IS NOT NULL AND c.place_id = NEW.place_id)
        OR (NULLIF(regexp_replace(coalesce(NEW.cnpj,''),'\D','','g'),'') IS NOT NULL
            AND regexp_replace(coalesce(c.document,''),'\D','','g') = regexp_replace(NEW.cnpj,'\D','','g')))
      ORDER BY c.created_at LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lead_link_cliente BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lead_link_contato_e_cliente();

CREATE OR REPLACE FUNCTION public.lead_ensure_contato() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.pessoa_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id)
     AND EXISTS (SELECT 1 FROM public.pessoas p WHERE p.id = NEW.pessoa_id AND p.organization_id = NEW.organization_id)
     AND NOT EXISTS (SELECT 1 FROM public.empresa_contatos e WHERE e.lead_id = NEW.id AND e.pessoa_id = NEW.pessoa_id) THEN
    INSERT INTO public.empresa_contatos (organization_id, pessoa_id, lead_id, cargo, is_primary)
      VALUES (NEW.organization_id, NEW.pessoa_id, NEW.id, NEW.cargo_contato,
        NOT EXISTS (SELECT 1 FROM public.empresa_contatos e WHERE e.lead_id = NEW.id AND e.is_primary));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lead_ensure_contato AFTER INSERT OR UPDATE OF pessoa_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lead_ensure_contato();