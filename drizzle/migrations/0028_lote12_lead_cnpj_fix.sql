ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cnpj text;
CREATE OR REPLACE FUNCTION public.converter_lead_em_cliente(_lead uuid, _cliente_existente uuid DEFAULT NULL, _ignorar_duplicados boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l record; _client uuid; cand jsonb; _doc text; _nome text;
BEGIN
  IF NOT public.can_see_lead(auth.uid(), _lead) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  SELECT * INTO l FROM public.leads WHERE id = _lead FOR UPDATE;
  IF l.client_id IS NOT NULL THEN RETURN jsonb_build_object('status','ja_convertido','client_id',l.client_id); END IF;
  _doc := NULLIF(regexp_replace(coalesce(l.cnpj,''),'\D','','g'),'');
  _nome := coalesce(NULLIF(btrim(l.empresa_nome),''), NULLIF(btrim(l.company),''), l.title);

  IF _cliente_existente IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _cliente_existente AND organization_id = l.organization_id) THEN
      RAISE EXCEPTION 'Cliente inválido'; END IF;
    _client := _cliente_existente;
  ELSE
    IF NOT _ignorar_duplicados THEN
      SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'city',m.city,'motivo',m.motivo)) INTO cand FROM (
        SELECT c.id, c.name, c.city, CASE
          WHEN _doc IS NOT NULL AND regexp_replace(coalesce(c.document,''),'\D','','g') = _doc THEN 'cnpj'
          WHEN l.place_id IS NOT NULL AND c.place_id = l.place_id THEN 'place_id'
          WHEN lower(btrim(c.name)) = lower(btrim(_nome)) AND lower(btrim(coalesce(c.city,''))) = lower(btrim(coalesce(l.city,''))) THEN 'nome_cidade' END AS motivo
        FROM public.clients c WHERE c.organization_id = l.organization_id) m WHERE m.motivo IS NOT NULL;
      IF cand IS NOT NULL THEN RETURN jsonb_build_object('status','duplicados','candidatos',cand); END IF;
    END IF;
    INSERT INTO public.clients (organization_id, name, company, document, phone, email, address, city, zip_code, latitude, longitude, place_id,
      notes, status, created_by, assigned_user_id, origem, lead_origem_id)
    VALUES (l.organization_id, _nome, _nome, l.cnpj, l.contact_phone, l.contact_email,
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
    VALUES (l.organization_id, _lead, 'resumo', 'fera', 'Convertido em cliente', _client);
  RETURN jsonb_build_object('status','convertido','client_id',_client);
END $$;