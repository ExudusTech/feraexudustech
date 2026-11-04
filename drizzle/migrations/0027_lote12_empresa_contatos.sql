ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'base_existente',
  ADD COLUMN IF NOT EXISTS lead_origem_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at timestamptz, ADD COLUMN IF NOT EXISTS converted_by uuid;
COMMENT ON TABLE public.client_contacts IS 'DEPRECATED: replaced by pessoas + empresa_contatos';
COMMENT ON COLUMN public.leads.client_contact_id IS 'DEPRECATED: use empresa_contatos';

CREATE OR REPLACE FUNCTION public.validate_client_origem() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.origem NOT IN ('base_existente','importacao','conversao') THEN RAISE EXCEPTION 'Origem de cliente inválida'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_client_origem BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.validate_client_origem();

CREATE OR REPLACE FUNCTION public.can_see_lead(_user uuid, _lead uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = _lead
    AND (has_role(_user,'super_admin') OR (l.organization_id = get_user_organization_id(_user)
      AND (is_privileged_user(_user) OR l.created_by = _user OR l.assigned_to = _user))))
$$;

CREATE TABLE public.empresa_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  cargo text,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresa_contatos_um_alvo CHECK ((lead_id IS NULL) <> (client_id IS NULL))
);
CREATE UNIQUE INDEX empresa_contatos_lead_pessoa ON public.empresa_contatos(lead_id, pessoa_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX empresa_contatos_client_pessoa ON public.empresa_contatos(client_id, pessoa_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX empresa_contatos_lead_primary ON public.empresa_contatos(lead_id) WHERE lead_id IS NOT NULL AND is_primary;
CREATE UNIQUE INDEX empresa_contatos_client_primary ON public.empresa_contatos(client_id) WHERE client_id IS NOT NULL AND is_primary;
CREATE INDEX empresa_contatos_pessoa ON public.empresa_contatos(pessoa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_contatos TO authenticated;
GRANT ALL ON public.empresa_contatos TO service_role;
ALTER TABLE public.empresa_contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Contatos visiveis pela empresa" ON public.empresa_contatos FOR SELECT TO authenticated
  USING ((lead_id IS NOT NULL AND public.can_see_lead(auth.uid(), lead_id)) OR (client_id IS NOT NULL AND public.can_see_client(auth.uid(), client_id)));
CREATE POLICY "Contatos inseridos pela empresa" ON public.empresa_contatos FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND ((lead_id IS NOT NULL AND public.can_see_lead(auth.uid(), lead_id)) OR (client_id IS NOT NULL AND public.can_see_client(auth.uid(), client_id))));
CREATE POLICY "Contatos editados pela empresa" ON public.empresa_contatos FOR UPDATE TO authenticated
  USING ((lead_id IS NOT NULL AND public.can_see_lead(auth.uid(), lead_id)) OR (client_id IS NOT NULL AND public.can_see_client(auth.uid(), client_id)))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Contatos removidos pela empresa" ON public.empresa_contatos FOR DELETE TO authenticated
  USING ((lead_id IS NOT NULL AND public.can_see_lead(auth.uid(), lead_id)) OR (client_id IS NOT NULL AND public.can_see_client(auth.uid(), client_id)));

-- validate org consistency and mirror primary contact on lead
CREATE OR REPLACE FUNCTION public.sync_empresa_contato() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pessoas WHERE id = NEW.pessoa_id AND organization_id = NEW.organization_id)
      OR (NEW.lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id AND organization_id = NEW.organization_id))
      OR (NEW.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id AND organization_id = NEW.organization_id)) THEN
      RAISE EXCEPTION 'Contato e empresa devem ser da mesma organização';
    END IF;
    IF NEW.is_primary AND NEW.lead_id IS NOT NULL THEN
      SELECT nome, telefone, whatsapp, email INTO p FROM public.pessoas WHERE id = NEW.pessoa_id;
      UPDATE public.leads SET pessoa_id = NEW.pessoa_id, contact_name = p.nome,
        contact_phone = COALESCE(p.whatsapp, p.telefone), contact_email = p.email, cargo_contato = NEW.cargo WHERE id = NEW.lead_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_sync_empresa_contato AFTER INSERT OR UPDATE ON public.empresa_contatos FOR EACH ROW EXECUTE FUNCTION public.sync_empresa_contato();

-- backfill existing lead primary contacts
INSERT INTO public.empresa_contatos (organization_id, pessoa_id, lead_id, cargo, is_primary)
  SELECT l.organization_id, l.pessoa_id, l.id, l.cargo_contato, true FROM public.leads l
  JOIN public.pessoas p ON p.id = l.pessoa_id AND p.organization_id = l.organization_id
  WHERE l.pessoa_id IS NOT NULL ON CONFLICT DO NOTHING;

-- conversion
CREATE OR REPLACE FUNCTION public.converter_lead_em_cliente(_lead uuid, _cliente_existente uuid DEFAULT NULL, _ignorar_duplicados boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l record; _client uuid; cand jsonb; doc text;
BEGIN
  IF NOT public.can_see_lead(auth.uid(), _lead) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  SELECT * INTO l FROM public.leads WHERE id = _lead FOR UPDATE;
  IF l.client_id IS NOT NULL THEN RETURN jsonb_build_object('status','ja_convertido','client_id',l.client_id); END IF;

  IF _cliente_existente IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _cliente_existente AND organization_id = l.organization_id) THEN
      RAISE EXCEPTION 'Cliente inválido'; END IF;
    _client := _cliente_existente;
  ELSE
    IF NOT _ignorar_duplicados THEN
      SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'city',c.city,'motivo',m.motivo)) INTO cand FROM (
        SELECT c.id, CASE
          WHEN NULLIF(regexp_replace(coalesce(c.document,''),'\D','','g'),'') IS NOT NULL
            AND regexp_replace(coalesce(c.document,''),'\D','','g') = regexp_replace(coalesce(l.vinculo,''),'\D','','g') THEN 'cnpj'
          WHEN l.place_id IS NOT NULL AND c.place_id = l.place_id THEN 'place_id'
          WHEN lower(btrim(c.name)) = lower(btrim(coalesce(l.empresa_nome, l.company, l.title)))
            AND lower(coalesce(c.city,'')) = lower(coalesce(l.city,'')) THEN 'nome_cidade' END AS motivo
        FROM public.clients c WHERE c.organization_id = l.organization_id) m
        JOIN public.clients c ON c.id = m.id WHERE m.motivo IS NOT NULL;
      IF cand IS NOT NULL THEN RETURN jsonb_build_object('status','duplicados','candidatos',cand); END IF;
    END IF;
    INSERT INTO public.clients (organization_id, name, company, phone, email, address, city, zip_code, latitude, longitude, place_id,
      notes, status, created_by, assigned_user_id, origem, lead_origem_id)
    VALUES (l.organization_id, coalesce(l.empresa_nome, l.company, l.title), coalesce(l.empresa_nome, l.company), l.contact_phone, l.contact_email,
      l.endereco, l.city, l.zip_code, l.latitude, l.longitude, l.place_id, l.description, 'active',
      coalesce(auth.uid(), l.created_by), coalesce(l.assigned_to, auth.uid()), 'conversao', l.id)
    RETURNING id INTO _client;
  END IF;

  INSERT INTO public.empresa_contatos (organization_id, pessoa_id, client_id, cargo, is_primary, created_by)
    SELECT ec.organization_id, ec.pessoa_id, _client, ec.cargo,
      ec.is_primary AND NOT EXISTS (SELECT 1 FROM public.empresa_contatos x WHERE x.client_id = _client AND x.is_primary), auth.uid()
    FROM public.empresa_contatos ec WHERE ec.lead_id = _lead
    ON CONFLICT DO NOTHING;
  UPDATE public.leads SET client_id = _client, converted_at = now(), converted_by = auth.uid() WHERE id = _lead;
  INSERT INTO public.lead_timeline (organization_id, lead_id, tipo, origem, resumo, referencia_id)
    VALUES (l.organization_id, _lead, 'nota', 'fera', 'Convertido em cliente', _client);
  RETURN jsonb_build_object('status','convertido','client_id',_client);
END $$;
REVOKE EXECUTE ON FUNCTION public.converter_lead_em_cliente(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.converter_lead_em_cliente(uuid, uuid, boolean) TO authenticated;

-- Client creation: only privileged, or field flow as base_existente; conversao only via function
DROP POLICY "Users can insert clients in their org" ON public.clients;
CREATE POLICY "Users can insert clients in their org" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid()
    AND (is_privileged_user(auth.uid()) OR origem = 'base_existente'));