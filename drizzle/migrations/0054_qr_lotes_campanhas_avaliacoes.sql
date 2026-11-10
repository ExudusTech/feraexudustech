-- A) Label lots controlled by Fera: status liberado/impresso; next numbers computed by the database (never repeated).
ALTER TABLE public.etiqueta_faixas ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'liberado';
ALTER TABLE public.etiqueta_faixas ADD COLUMN IF NOT EXISTS impresso_em timestamptz;
ALTER TABLE public.etiqueta_faixas ADD COLUMN IF NOT EXISTS impresso_por uuid;
ALTER TABLE public.etiqueta_faixas ADD CONSTRAINT etiqueta_faixas_status_chk CHECK (status IN ('liberado','impresso'));

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
  -- Next number after every generated lot and every number already used (the demo range 900001+ is kept apart).
  SELECT greatest(
      coalesce((SELECT max(fim) FROM public.etiqueta_faixas WHERE organization_id = _org AND fim < 900001), 0),
      coalesce((SELECT max(etiqueta_numero) FROM public.comodatos WHERE organization_id = _org AND etiqueta_numero < 900001), 0)) + 1
    INTO _ini;
  _fim := _ini + _quantidade - 1;
  IF _fim >= 900001 THEN RAISE EXCEPTION 'Numeração esgotada antes da faixa de demonstração'; END IF;
  INSERT INTO public.etiqueta_faixas (organization_id, inicio, fim, largura_mm, altura_mm, gerado_por, status)
    VALUES (_org, _ini, _fim, _largura, _altura, auth.uid(), 'liberado') RETURNING id INTO novo;
  RETURN jsonb_build_object('id', novo, 'inicio', _ini, 'fim', _fim);
END $$;
REVOKE ALL ON FUNCTION public.liberar_lote_etiquetas(integer, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liberar_lote_etiquetas(integer, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marcar_lote_impresso(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Só o gestor pode alterar o lote';
  END IF;
  UPDATE public.etiqueta_faixas SET status = 'impresso', impresso_em = now(), impresso_por = auth.uid()
    WHERE id = _id AND organization_id = public.get_user_organization_id(auth.uid()) AND status = 'liberado';
END $$;
REVOKE ALL ON FUNCTION public.marcar_lote_impresso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lote_impresso(uuid) TO authenticated, service_role;

-- Free ranges are no longer chosen by hand: Fera controls the sequence.
REVOKE EXECUTE ON FUNCTION public.registrar_faixa_etiquetas(integer, integer, numeric, numeric) FROM authenticated;
COMMENT ON FUNCTION public.registrar_faixa_etiquetas(integer, integer, numeric, numeric) IS 'DEPRECATED: replaced by liberar_lote_etiquetas (Fera controls the numbering)';

-- B) QR campaigns: pre-filled WhatsApp message of the public QR.
CREATE TABLE public.qr_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  texto text NOT NULL,
  inicio date,
  fim date,
  dias_semana integer[],
  hora_inicio time,
  hora_fim time,
  segmentos text[],
  prioridade integer NOT NULL DEFAULT 0,
  padrao boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_campanhas_nome_chk CHECK (length(btrim(nome)) BETWEEN 2 AND 80),
  CONSTRAINT qr_campanhas_texto_chk CHECK (length(btrim(texto)) BETWEEN 5 AND 500),
  CONSTRAINT qr_campanhas_vigencia_chk CHECK (inicio IS NULL OR fim IS NULL OR fim >= inicio),
  CONSTRAINT qr_campanhas_dias_chk CHECK (dias_semana IS NULL OR dias_semana <@ ARRAY[0,1,2,3,4,5,6]),
  CONSTRAINT qr_campanhas_prioridade_chk CHECK (prioridade BETWEEN 0 AND 100)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_campanhas TO authenticated;
GRANT ALL ON public.qr_campanhas TO service_role;
ALTER TABLE public.qr_campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr_campanhas_select_org" ON public.qr_campanhas FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "qr_campanhas_insert_gestor" ON public.qr_campanhas FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid()));
CREATE POLICY "qr_campanhas_update_gestor" ON public.qr_campanhas FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid()));
CREATE POLICY "qr_campanhas_delete_gestor" ON public.qr_campanhas FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid()));
CREATE INDEX qr_campanhas_org_idx ON public.qr_campanhas (organization_id, ativo);
-- Only one default campaign per organization.
CREATE UNIQUE INDEX qr_campanhas_padrao_uk ON public.qr_campanhas (organization_id) WHERE padrao;
CREATE TRIGGER update_qr_campanhas_updated_at BEFORE UPDATE ON public.qr_campanhas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- D) QR ratings (0–10) tied to client / point / device; written by Flora (service role), read by managers only.
CREATE TABLE public.qr_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  comodato_id uuid REFERENCES public.comodatos(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ponto text,
  etiqueta_numero integer,
  ref text,
  tipo_avaliador text NOT NULL CHECK (tipo_avaliador IN ('EQUIPE','CLIENTE','PUBLICO')),
  nota integer NOT NULL CHECK (nota BETWEEN 0 AND 10),
  comentario text,
  sentimento text NOT NULL CHECK (sentimento IN ('positivo','neutro','negativo')),
  alerta boolean NOT NULL DEFAULT false,
  chat_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qr_avaliacoes TO authenticated;
GRANT ALL ON public.qr_avaliacoes TO service_role;
ALTER TABLE public.qr_avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr_avaliacoes_select_gestor" ON public.qr_avaliacoes FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid()));
CREATE INDEX qr_avaliacoes_org_idx ON public.qr_avaliacoes (organization_id, created_at DESC);
CREATE INDEX qr_avaliacoes_comodato_idx ON public.qr_avaliacoes (comodato_id);

-- Demo cleanup also removes the demo ratings.
CREATE OR REPLACE FUNCTION public.apagar_cenario_demo(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j jsonb; M uuid[]; S uuid[]; C uuid[]; L uuid[]; r jsonb; d record;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'Organização obrigatória'; END IF;
  j := public.demo_conjunto(_org);
  M := ARRAY(SELECT jsonb_array_elements_text(j->'comodatos')::uuid);
  S := ARRAY(SELECT jsonb_array_elements_text(j->'schedules')::uuid);
  C := ARRAY(SELECT jsonb_array_elements_text(j->'clients')::uuid);
  L := ARRAY(SELECT jsonb_array_elements_text(j->'leads')::uuid);
  PERFORM set_config('fera.estoque_demo', '1', true);
  FOR d IN SELECT product_id, sum(quantidade)::int AS delta FROM public.stock_movements
      WHERE organization_id = _org AND (comodato_id = ANY(M) OR schedule_id = ANY(S) OR origem = 'demo') GROUP BY product_id LOOP
    UPDATE public.products SET stock = stock - d.delta WHERE id = d.product_id AND organization_id = _org;
  END LOOP;
  UPDATE public.products p SET min_stock = (r2.dados->>'min_stock')::int
    FROM public.demo_registros r2
    WHERE r2.organization_id = _org AND r2.tabela = 'products_estoque' AND r2.registro_id = p.id AND p.organization_id = _org AND r2.dados ? 'min_stock';
  DELETE FROM public.stock_movements WHERE organization_id = _org AND (comodato_id = ANY(M) OR schedule_id = ANY(S) OR origem = 'demo');
  DELETE FROM public.qr_avaliacoes WHERE organization_id = _org AND (comodato_id = ANY(M) OR client_id = ANY(C) OR lead_id = ANY(L));
  r := public.apagar_cenario_demo_base(_org);
  PERFORM set_config('fera.estoque_demo', '', true);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.apagar_cenario_demo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apagar_cenario_demo(uuid) TO service_role;