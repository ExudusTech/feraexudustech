CREATE TABLE public.comodato_etiquetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  comodato_id uuid NOT NULL REFERENCES public.comodatos(id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero BETWEEN 1 AND 999999),
  inicio_em timestamptz NOT NULL DEFAULT now(),
  fim_em timestamptz,
  motivo text,
  foto_path text,
  trocado_por uuid,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX comodato_etiquetas_org_numero_uk ON public.comodato_etiquetas (organization_id, numero);
CREATE INDEX comodato_etiquetas_comodato_idx ON public.comodato_etiquetas (comodato_id, inicio_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comodato_etiquetas TO authenticated;
GRANT ALL ON public.comodato_etiquetas TO service_role;

ALTER TABLE public.comodato_etiquetas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can access comodato_etiquetas"
  ON public.comodato_etiquetas
  FOR ALL
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

-- Backfill current device labels as open validity periods
INSERT INTO public.comodato_etiquetas (organization_id, comodato_id, numero, inicio_em)
SELECT organization_id, id, etiqueta_numero, COALESCE(ativado_em, data_inicio::timestamptz, created_at, now())
FROM public.comodatos
WHERE etiqueta_numero IS NOT NULL
ON CONFLICT (organization_id, numero) DO NOTHING;

-- Keep immutability trigger, allowing change only via trocar_etiqueta_comodato
CREATE OR REPLACE FUNCTION public.comodato_etiqueta_fixa() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.etiqueta_numero IS NOT NULL AND NEW.etiqueta_numero IS DISTINCT FROM OLD.etiqueta_numero THEN
    IF current_setting('app.etiqueta_troca', true) IS DISTINCT FROM 'ok' THEN
      RAISE EXCEPTION 'O número da etiqueta pertence ao aparelho e não pode ser trocado';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Automatically record an open validity row whenever a label number is first linked to a device
CREATE OR REPLACE FUNCTION public.comodato_etiqueta_registrar_vigencia() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.etiqueta_numero IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.etiqueta_numero IS DISTINCT FROM NEW.etiqueta_numero) THEN
    INSERT INTO public.comodato_etiquetas (organization_id, comodato_id, numero, inicio_em, schedule_id)
    VALUES (NEW.organization_id, NEW.id, NEW.etiqueta_numero, now(), NEW.ocorrencia_schedule_id)
    ON CONFLICT (organization_id, numero) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_comodato_etiqueta_registrar_vigencia
  AFTER INSERT OR UPDATE OF etiqueta_numero ON public.comodatos
  FOR EACH ROW EXECUTE FUNCTION public.comodato_etiqueta_registrar_vigencia();

-- Controlled replacement of a damaged label keeping the same device
CREATE OR REPLACE FUNCTION public.trocar_etiqueta_comodato(
  _org uuid,
  _comodato uuid,
  _novo_numero integer,
  _motivo text,
  _foto_path text,
  _trocado_por uuid,
  _schedule_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _antigo integer;
  _fechadas integer;
BEGIN
  IF _novo_numero IS NULL OR _novo_numero < 1 OR _novo_numero > 999999 THEN
    RAISE EXCEPTION 'Número de etiqueta inválido';
  END IF;

  SELECT etiqueta_numero INTO _antigo
  FROM public.comodatos
  WHERE id = _comodato AND organization_id = _org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aparelho não encontrado';
  END IF;
  IF _antigo IS NULL THEN
    RAISE EXCEPTION 'Este aparelho ainda não tem etiqueta vinculada';
  END IF;
  IF _antigo = _novo_numero THEN
    RAISE EXCEPTION 'Escaneie uma etiqueta diferente da atual';
  END IF;

  IF EXISTS (SELECT 1 FROM public.comodato_etiquetas WHERE organization_id = _org AND numero = _novo_numero)
     OR EXISTS (SELECT 1 FROM public.comodatos WHERE organization_id = _org AND etiqueta_numero = _novo_numero) THEN
    RAISE EXCEPTION 'Etiqueta já utilizada ou baixada';
  END IF;

  UPDATE public.comodato_etiquetas
  SET fim_em = now(),
      motivo = _motivo,
      foto_path = _foto_path,
      trocado_por = _trocado_por,
      schedule_id = _schedule_id
  WHERE organization_id = _org AND comodato_id = _comodato AND fim_em IS NULL;
  GET DIAGNOSTICS _fechadas = ROW_COUNT;

  IF _fechadas = 0 THEN
    INSERT INTO public.comodato_etiquetas (organization_id, comodato_id, numero, inicio_em, fim_em, motivo, foto_path, trocado_por, schedule_id)
    VALUES (_org, _comodato, _antigo, now(), now(), _motivo, _foto_path, _trocado_por, _schedule_id)
    ON CONFLICT (organization_id, numero) DO UPDATE
      SET fim_em = COALESCE(public.comodato_etiquetas.fim_em, now()),
          motivo = COALESCE(public.comodato_etiquetas.motivo, EXCLUDED.motivo),
          foto_path = COALESCE(public.comodato_etiquetas.foto_path, EXCLUDED.foto_path),
          trocado_por = COALESCE(public.comodato_etiquetas.trocado_por, EXCLUDED.trocado_por),
          schedule_id = COALESCE(public.comodato_etiquetas.schedule_id, EXCLUDED.schedule_id);
  END IF;

  INSERT INTO public.comodato_etiquetas (organization_id, comodato_id, numero, inicio_em, foto_path, trocado_por, schedule_id)
  VALUES (_org, _comodato, _novo_numero, now(), _foto_path, _trocado_por, _schedule_id);

  PERFORM set_config('app.etiqueta_troca', 'ok', true);
  UPDATE public.comodatos SET etiqueta_numero = _novo_numero WHERE id = _comodato AND organization_id = _org;

  RETURN jsonb_build_object('ok', true, 'antigo', _antigo, 'novo', _novo_numero);
END $$;

REVOKE ALL ON FUNCTION public.trocar_etiqueta_comodato(uuid, uuid, integer, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trocar_etiqueta_comodato(uuid, uuid, integer, text, text, uuid, uuid) TO service_role;

-- Update liberar_lote_etiquetas so retired numbers also count as used
CREATE OR REPLACE FUNCTION public.liberar_lote_etiquetas(_quantidade integer, _largura numeric, _altura numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _org uuid := public.get_user_organization_id(auth.uid()); _ini int; _fim int; novo uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Só o gestor pode liberar etiquetas';
  END IF;
  IF _org IS NULL THEN RAISE EXCEPTION 'Organização não encontrada'; END IF;
  IF _quantidade IS NULL OR _quantidade < 1 OR _quantidade > 2000 THEN RAISE EXCEPTION 'Libere de 1 a 2000 etiquetas por lote'; END IF;
  IF _largura IS NULL OR _largura < 30 OR _largura > 100 OR _altura IS NULL OR _altura < 20 OR _altura > 80 THEN RAISE EXCEPTION 'Tamanho inválido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('etiquetas:' || _org::text));
  SELECT greatest(
      coalesce((SELECT max(fim) FROM public.etiqueta_faixas WHERE organization_id = _org AND fim < 900001), 0),
      coalesce((SELECT max(etiqueta_numero) FROM public.comodatos WHERE organization_id = _org AND etiqueta_numero < 900001), 0),
      coalesce((SELECT max(numero) FROM public.comodato_etiquetas WHERE organization_id = _org AND numero < 900001), 0)) + 1
    INTO _ini;
  _fim := _ini + _quantidade - 1;
  IF _fim >= 900001 THEN RAISE EXCEPTION 'Numeração esgotada antes da faixa de demonstração'; END IF;
  INSERT INTO public.etiqueta_faixas (organization_id, inicio, fim, largura_mm, altura_mm, gerado_por, status)
    VALUES (_org, _ini, _fim, _largura, _altura, auth.uid(), 'liberado') RETURNING id INTO novo;
  RETURN jsonb_build_object('id', novo, 'inicio', _ini, 'fim', _fim);
END $$;