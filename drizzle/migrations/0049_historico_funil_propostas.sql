-- Funnel and proposal timing: stage history, proposal status history and operation milestones, all written by triggers.

-- 1) Lead stage history (every path: screen, kanban, Flora/mcp, conversion, lost)
CREATE TABLE public.lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  etapa_anterior_id uuid REFERENCES public.lead_stages(id) ON DELETE SET NULL,
  etapa_nova_id uuid REFERENCES public.lead_stages(id) ON DELETE SET NULL,
  mudou_em timestamptz NOT NULL DEFAULT now(),
  mudou_por uuid,
  origem text NOT NULL DEFAULT 'sistema' CHECK (origem IN ('app', 'flora', 'mcp', 'sistema', 'conversao')),
  estimado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_stage_history_lead_idx ON public.lead_stage_history (lead_id, mudou_em);
CREATE INDEX lead_stage_history_org_idx ON public.lead_stage_history (organization_id, mudou_em);
GRANT SELECT ON public.lead_stage_history TO authenticated;
GRANT ALL ON public.lead_stage_history TO service_role;
ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stage history visible with its lead" ON public.lead_stage_history FOR SELECT TO authenticated
  USING (public.can_see_lead(auth.uid(), lead_id));
COMMENT ON TABLE public.lead_stage_history IS 'One row per lead stage change (initial stage included), written only by trigger; estimado=true marks rows rebuilt from older data.';

-- 2) Proposal status history + first-time milestones
CREATE TABLE public.proposal_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text,
  mudou_em timestamptz NOT NULL DEFAULT now(),
  mudou_por uuid,
  origem text NOT NULL DEFAULT 'sistema' CHECK (origem IN ('app', 'flora', 'mcp', 'sistema', 'conversao')),
  estimado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposal_status_history_prop_idx ON public.proposal_status_history (proposal_id, mudou_em);
CREATE INDEX proposal_status_history_org_idx ON public.proposal_status_history (organization_id, mudou_em);
GRANT SELECT ON public.proposal_status_history TO authenticated;
GRANT ALL ON public.proposal_status_history TO service_role;
ALTER TABLE public.proposal_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Status history visible with its proposal" ON public.proposal_status_history FOR SELECT TO authenticated
  USING (public.can_see_proposal(auth.uid(), proposal_id));

ALTER TABLE public.proposals
  ADD COLUMN enviada_em timestamptz, ADD COLUMN aceita_em timestamptz, ADD COLUMN rejeitada_em timestamptz,
  ADD COLUMN ativado_em timestamptz, ADD COLUMN marcos_estimados boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.proposals.ativado_em IS 'First device activation (comodato ATIVO/EM_TESTE) of the proposal lead/client after acceptance.';

-- 3) Operation milestones on the natural rows
ALTER TABLE public.comodatos ADD COLUMN ativado_em timestamptz, ADD COLUMN marcos_estimados boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN ativado_em timestamptz, ADD COLUMN marcos_estimados boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN teste_instalado_em timestamptz, ADD COLUMN teste_aprovado_em timestamptz,
  ADD COLUMN marcos_estimados boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.comodatos.ativado_em IS 'First time the device reached ATIVO or EM_TESTE.';
COMMENT ON COLUMN public.clients.ativado_em IS 'First device activation for this client.';

-- Who/what changed it: conversion > trigger cascade > trusted service header (x-fera-origem) > signed-in user > system.
CREATE OR REPLACE FUNCTION public.historico_origem()
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _role text; _hdr text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN 'sistema'; END IF;
  BEGIN _role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''); EXCEPTION WHEN others THEN _role := ''; END;
  IF _role = 'service_role' THEN
    BEGIN _hdr := lower(coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-fera-origem', '')); EXCEPTION WHEN others THEN _hdr := ''; END;
    RETURN CASE WHEN _hdr IN ('app', 'flora', 'mcp') THEN _hdr ELSE 'sistema' END;
  END IF;
  IF auth.uid() IS NOT NULL THEN RETURN 'app'; END IF;
  RETURN 'sistema';
END $$;

-- Signed-in user, or the acting user a service function declares in x-fera-usuario (trusted only with the service role).
CREATE OR REPLACE FUNCTION public.historico_autor()
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _role text; _hdr text;
BEGIN
  IF auth.uid() IS NOT NULL THEN RETURN auth.uid(); END IF;
  BEGIN _role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''); EXCEPTION WHEN others THEN _role := ''; END;
  IF _role <> 'service_role' THEN RETURN NULL; END IF;
  BEGIN _hdr := coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-fera-usuario', ''); EXCEPTION WHEN others THEN _hdr := ''; END;
  IF _hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN _hdr::uuid; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.lead_registrar_etapa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _origem text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.lead_stage_history (lead_id, organization_id, etapa_anterior_id, etapa_nova_id, mudou_em, mudou_por, origem)
      VALUES (NEW.id, NEW.organization_id, NULL, NEW.stage_id, coalesce(NEW.created_at, now()), coalesce(public.historico_autor(), NEW.created_by), public.historico_origem());
    RETURN NEW;
  END IF;
  _origem := CASE WHEN NEW.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN 'conversao' ELSE public.historico_origem() END;
  INSERT INTO public.lead_stage_history (lead_id, organization_id, etapa_anterior_id, etapa_nova_id, mudou_em, mudou_por, origem)
    VALUES (NEW.id, NEW.organization_id, OLD.stage_id, NEW.stage_id, now(), public.historico_autor(), _origem);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lead_etapa_inicial AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lead_registrar_etapa();
CREATE TRIGGER trg_lead_etapa_mudou AFTER UPDATE ON public.leads FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id) EXECUTE FUNCTION public.lead_registrar_etapa();

-- Proposal milestones: set the first time the status reaches them (never overwritten).
CREATE OR REPLACE FUNCTION public.proposal_marcos()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'enviada' AND NEW.enviada_em IS NULL THEN NEW.enviada_em := now(); END IF;
    IF NEW.status = 'aceita' AND NEW.aceita_em IS NULL THEN NEW.aceita_em := now(); END IF;
    IF NEW.status IN ('rejeitada', 'recusada') AND NEW.rejeitada_em IS NULL THEN NEW.rejeitada_em := now(); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_proposal_marcos BEFORE INSERT OR UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.proposal_marcos();

CREATE OR REPLACE FUNCTION public.proposal_registrar_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.proposal_status_history (proposal_id, organization_id, status_anterior, status_novo, mudou_em, mudou_por, origem)
    VALUES (NEW.id, NEW.organization_id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status,
      CASE WHEN TG_OP = 'INSERT' THEN coalesce(NEW.created_at, now()) ELSE now() END,
      coalesce(public.historico_autor(), CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by END), public.historico_origem());
  RETURN NEW;
END $$;
CREATE TRIGGER trg_proposal_status_inicial AFTER INSERT ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.proposal_registrar_status();
CREATE TRIGGER trg_proposal_status_mudou AFTER UPDATE ON public.proposals FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.proposal_registrar_status();

-- Device activation: device, client, accepted proposals of the same lead/client, and the lead's test installation.
CREATE OR REPLACE FUNCTION public.comodato_marco_ativacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF upper(coalesce(NEW.status, '')) IN ('ATIVO', 'EM_TESTE') AND NEW.ativado_em IS NULL THEN NEW.ativado_em := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_comodato_marco_ativacao BEFORE INSERT OR UPDATE ON public.comodatos FOR EACH ROW EXECUTE FUNCTION public.comodato_marco_ativacao();

CREATE OR REPLACE FUNCTION public.comodato_propagar_ativacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st text := upper(coalesce(NEW.status, ''));
BEGIN
  IF _st NOT IN ('ATIVO', 'EM_TESTE') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND upper(coalesce(OLD.status, '')) = _st THEN RETURN NEW; END IF;
  IF _st = 'EM_TESTE' AND NEW.lead_id IS NOT NULL THEN
    UPDATE public.leads SET teste_instalado_em = now() WHERE id = NEW.lead_id AND organization_id = NEW.organization_id AND teste_instalado_em IS NULL;
  END IF;
  IF NEW.client_id IS NOT NULL THEN
    UPDATE public.clients SET ativado_em = now() WHERE id = NEW.client_id AND organization_id = NEW.organization_id AND ativado_em IS NULL;
  END IF;
  UPDATE public.proposals SET ativado_em = now()
    WHERE organization_id = NEW.organization_id AND ativado_em IS NULL AND aceita_em IS NOT NULL AND aceita_em <= now()
      AND ((NEW.client_id IS NOT NULL AND client_id = NEW.client_id) OR (NEW.lead_id IS NOT NULL AND lead_id = NEW.lead_id));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_comodato_propagar_ativacao AFTER INSERT OR UPDATE OF status ON public.comodatos FOR EACH ROW EXECUTE FUNCTION public.comodato_propagar_ativacao();

-- Conversion now also moves an open lead to the organization's "won" stage, so the conversion is part of the stage history.
CREATE OR REPLACE FUNCTION public.converter_lead_em_cliente(_lead uuid, _cliente_existente uuid DEFAULT NULL::uuid, _ignorar_duplicados boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l record; _client uuid; cand jsonb; _doc text; _nome text; _ganho uuid; _tipo text;
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
  SELECT tipo INTO _tipo FROM public.lead_stages WHERE id = l.stage_id;
  IF coalesce(_tipo, 'aberta') = 'aberta' THEN
    SELECT id INTO _ganho FROM public.lead_stages WHERE organization_id = l.organization_id AND tipo = 'ganho' ORDER BY ativo DESC, ordem LIMIT 1;
  END IF;
  UPDATE public.leads SET client_id = _client, converted_at = now(), converted_by = auth.uid(), stage_id = coalesce(_ganho, stage_id) WHERE id = _lead;
  INSERT INTO public.lead_timeline (organization_id, lead_id, tipo, origem, resumo, referencia_id)
    VALUES (l.organization_id, _lead, 'resumo', 'fera', 'Convertido em cliente', _client);
  RETURN jsonb_build_object('status','convertido','client_id',_client);
END $function$;

-- 4) Backfill (estimado = true) from created_at, updated_at, schedules, proposals, devices and lead_timeline.
-- updated_at is kept as it was: the backfill must not look like a recent edit.
ALTER TABLE public.leads DISABLE TRIGGER update_leads_updated_at;
ALTER TABLE public.clients DISABLE TRIGGER update_clients_updated_at;
ALTER TABLE public.proposals DISABLE TRIGGER update_proposals_updated_at;
DO $$
DECLARE l record; cur record; c record; _ini uuid; _last_ord int; _last_id uuid; _last_ts timestamptz; _fim timestamptz;
BEGIN
  FOR l IN SELECT * FROM public.leads WHERE stage_id IS NOT NULL LOOP
    SELECT id, ordem, tipo INTO cur FROM public.lead_stages WHERE id = l.stage_id;
    SELECT id INTO _ini FROM public.lead_stages WHERE organization_id = l.organization_id AND tipo = 'aberta' ORDER BY ordem LIMIT 1;
    _ini := coalesce(_ini, l.stage_id);
    _fim := CASE WHEN cur.tipo IN ('ganho', 'cliente') THEN coalesce(l.converted_at, l.updated_at) ELSE l.updated_at END;
    _fim := greatest(coalesce(_fim, l.created_at), l.created_at);
    -- Never touched after creation: it was created directly in its current stage.
    IF _fim <= l.created_at + interval '1 minute' THEN _ini := l.stage_id; END IF;
    INSERT INTO public.lead_stage_history (lead_id, organization_id, etapa_anterior_id, etapa_nova_id, mudou_em, mudou_por, origem, estimado)
      VALUES (l.id, l.organization_id, NULL, _ini, l.created_at, l.created_by, 'sistema', true);
    SELECT ordem INTO _last_ord FROM public.lead_stages WHERE id = _ini;
    _last_id := _ini; _last_ts := l.created_at;
    FOR c IN
      SELECT s.id, s.ordem, x.ts FROM (
        SELECT 'visita_agendada' chave, min(created_at) ts FROM public.schedules WHERE lead_id = l.id
        UNION ALL SELECT 'visita_realizada', min(coalesce(checkout_em, updated_at)) FROM public.schedules WHERE lead_id = l.id AND status = 'concluido'
        UNION ALL SELECT 'teste_amostra', min(coalesce(checkout_em, updated_at)) FROM public.schedules WHERE lead_id = l.id AND operacao_material = 'instalacao_teste' AND status = 'concluido'
        UNION ALL SELECT 'teste_amostra', min(created_at) FROM public.comodatos WHERE lead_id = l.id AND upper(coalesce(status,'')) = 'EM_TESTE'
        UNION ALL SELECT 'proposta_enviada', min(coalesce(pdf_gerado_em, updated_at)) FROM public.proposals WHERE lead_id = l.id AND status IN ('enviada', 'aceita', 'rejeitada', 'recusada')
      ) x JOIN public.lead_stages s ON s.organization_id = l.organization_id AND s.chave = x.chave AND s.tipo = 'aberta'
      WHERE x.ts IS NOT NULL AND x.ts > l.created_at AND x.ts < _fim
        AND (cur.tipo <> 'aberta' OR s.ordem < cur.ordem)
      ORDER BY x.ts
    LOOP
      IF c.ordem > _last_ord THEN
        INSERT INTO public.lead_stage_history (lead_id, organization_id, etapa_anterior_id, etapa_nova_id, mudou_em, origem, estimado)
          VALUES (l.id, l.organization_id, _last_id, c.id, c.ts, 'sistema', true);
        _last_ord := c.ordem; _last_id := c.id; _last_ts := c.ts;
      END IF;
    END LOOP;
    IF _last_id <> l.stage_id THEN
      INSERT INTO public.lead_stage_history (lead_id, organization_id, etapa_anterior_id, etapa_nova_id, mudou_em, origem, estimado)
        VALUES (l.id, l.organization_id, _last_id, l.stage_id, greatest(_fim, _last_ts), CASE WHEN cur.tipo IN ('ganho', 'cliente') AND l.converted_at IS NOT NULL THEN 'conversao' ELSE 'sistema' END, true);
    END IF;
  END LOOP;
END $$;

UPDATE public.proposals SET
  enviada_em = CASE WHEN status IN ('enviada', 'aceita', 'rejeitada', 'recusada') THEN coalesce(pdf_gerado_em, updated_at) END,
  aceita_em = CASE WHEN status = 'aceita' THEN updated_at END,
  rejeitada_em = CASE WHEN status IN ('rejeitada', 'recusada') THEN updated_at END,
  marcos_estimados = true
WHERE status IN ('enviada', 'aceita', 'rejeitada', 'recusada');

INSERT INTO public.proposal_status_history (proposal_id, organization_id, status_anterior, status_novo, mudou_em, mudou_por, origem, estimado)
  SELECT id, organization_id, NULL, CASE WHEN status = 'rascunho' THEN status ELSE 'rascunho' END, created_at, created_by, 'sistema', true FROM public.proposals;
INSERT INTO public.proposal_status_history (proposal_id, organization_id, status_anterior, status_novo, mudou_em, origem, estimado)
  SELECT id, organization_id, 'rascunho', 'enviada', greatest(enviada_em, created_at), 'sistema', true FROM public.proposals WHERE enviada_em IS NOT NULL AND status <> 'enviada';
INSERT INTO public.proposal_status_history (proposal_id, organization_id, status_anterior, status_novo, mudou_em, origem, estimado)
  SELECT id, organization_id, CASE WHEN enviada_em IS NOT NULL AND status <> 'enviada' THEN 'enviada' ELSE 'rascunho' END, status, greatest(updated_at, created_at), 'sistema', true
  FROM public.proposals WHERE status <> 'rascunho';

UPDATE public.comodatos SET ativado_em = coalesce((data_inicio::text || ' 12:00:00-03')::timestamptz, created_at), marcos_estimados = true
  WHERE upper(coalesce(status, '')) IN ('ATIVO', 'EM_TESTE') OR (upper(coalesce(status, '')) = 'ENCERRADO' AND data_inicio IS NOT NULL);

UPDATE public.clients c SET ativado_em = x.ts, marcos_estimados = true FROM (
  SELECT client_id, min(ativado_em) ts FROM public.comodatos WHERE client_id IS NOT NULL AND ativado_em IS NOT NULL GROUP BY client_id) x
  WHERE x.client_id = c.id;

UPDATE public.proposals p SET ativado_em = x.ts, marcos_estimados = true FROM (
  SELECT p2.id, min(m.ativado_em) ts FROM public.proposals p2 JOIN public.comodatos m ON m.organization_id = p2.organization_id
    AND ((p2.client_id IS NOT NULL AND m.client_id = p2.client_id) OR (p2.lead_id IS NOT NULL AND m.lead_id = p2.lead_id))
  WHERE p2.aceita_em IS NOT NULL AND m.ativado_em IS NOT NULL AND m.ativado_em >= p2.aceita_em GROUP BY p2.id) x
  WHERE x.id = p.id;

UPDATE public.leads l SET teste_instalado_em = x.ts, marcos_estimados = true FROM (
  SELECT lead_id, min(ts) ts FROM (
    SELECT lead_id, ativado_em ts FROM public.comodatos WHERE lead_id IS NOT NULL AND upper(coalesce(status,'')) = 'EM_TESTE' AND ativado_em IS NOT NULL
    UNION ALL SELECT lead_id, coalesce(checkout_em, (scheduled_date::text || ' 12:00:00-03')::timestamptz) FROM public.schedules
      WHERE lead_id IS NOT NULL AND operacao_material = 'instalacao_teste' AND status = 'concluido') y GROUP BY lead_id) x
  WHERE x.lead_id = l.id;

UPDATE public.leads l SET teste_aprovado_em = x.ts, marcos_estimados = true FROM (
  SELECT lead_id, min(created_at) ts FROM public.lead_timeline WHERE lead_id IS NOT NULL AND resumo ILIKE 'Resultado do teste: Aprovado%' GROUP BY lead_id) x
  WHERE x.lead_id = l.id;

ALTER TABLE public.leads ENABLE TRIGGER update_leads_updated_at;
ALTER TABLE public.clients ENABLE TRIGGER update_clients_updated_at;
ALTER TABLE public.proposals ENABLE TRIGGER update_proposals_updated_at;
