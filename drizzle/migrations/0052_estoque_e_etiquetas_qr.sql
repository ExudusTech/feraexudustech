-- Inventory (stock movements, base <-> stock) and numbered QR labels on devices (comodatos).

-- 1) Device statuses: SEPARADO (number linked at separation, not installed) and RETIRADO (left the client, waiting for the return invoice).
ALTER TABLE public.comodatos DROP CONSTRAINT comodatos_status_check;
ALTER TABLE public.comodatos ADD CONSTRAINT comodatos_status_check CHECK (status = ANY (ARRAY['ATIVO','SUSPENSO','ENCERRADO','PENDENTE','PREVISTO','EM_TESTE','SEPARADO','RETIRADO']));
ALTER TABLE public.comodatos ADD COLUMN IF NOT EXISTS etiqueta_numero integer;
ALTER TABLE public.comodatos ADD COLUMN IF NOT EXISTS ocorrencia_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;
ALTER TABLE public.comodatos ADD COLUMN IF NOT EXISTS reserva_os_id uuid REFERENCES public.maintenance_schedule(id) ON DELETE SET NULL;
ALTER TABLE public.comodatos ADD COLUMN IF NOT EXISTS retirada_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;
ALTER TABLE public.comodatos ADD CONSTRAINT comodatos_etiqueta_chk CHECK (etiqueta_numero IS NULL OR etiqueta_numero BETWEEN 1 AND 999999);
CREATE UNIQUE INDEX IF NOT EXISTS comodatos_etiqueta_org_uk ON public.comodatos (organization_id, etiqueta_numero) WHERE etiqueta_numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS comodatos_ocorrencia_idx ON public.comodatos (ocorrencia_schedule_id) WHERE ocorrencia_schedule_id IS NOT NULL;
COMMENT ON COLUMN public.comodatos.etiqueta_numero IS 'Número sequencial da etiqueta QR; pertence ao aparelho para sempre (não muda depois de gravado).';
COMMENT ON COLUMN public.comodatos.ocorrencia_schedule_id IS 'Ocorrência para a qual o aparelho foi separado ou na qual foi instalado (reserva de estoque).';

CREATE OR REPLACE FUNCTION public.comodato_etiqueta_fixa() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.etiqueta_numero IS NOT NULL AND NEW.etiqueta_numero IS DISTINCT FROM OLD.etiqueta_numero THEN
    RAISE EXCEPTION 'O número da etiqueta pertence ao aparelho e não pode ser trocado';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_comodato_etiqueta_fixa BEFORE UPDATE OF etiqueta_numero ON public.comodatos FOR EACH ROW EXECUTE FUNCTION public.comodato_etiqueta_fixa();

-- Device events (installation, change of point, removal, replacement) live with the visit evidences.
ALTER TABLE public.schedule_evidencias DROP CONSTRAINT schedule_evidencias_tipo_chk;
ALTER TABLE public.schedule_evidencias ADD CONSTRAINT schedule_evidencias_tipo_chk CHECK (tipo = ANY (ARRAY['foto','audio','texto','evento']));

-- 2) Stock movements: every change of products.stock is recorded with author, reason and balance before/after.
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida','contagem','instalacao','retirada','cadastro','demo')),
  quantidade integer NOT NULL,
  saldo_antes integer NOT NULL,
  saldo_depois integer NOT NULL,
  motivo text,
  comodato_id uuid REFERENCES public.comodatos(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  autor_id uuid,
  origem text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_select_org" ON public.stock_movements FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE INDEX stock_movements_prod_idx ON public.stock_movements (organization_id, product_id, created_at DESC);
CREATE INDEX stock_movements_comodato_idx ON public.stock_movements (comodato_id) WHERE comodato_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.qtd_aparelhos(_q text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT least(9999, greatest(1, coalesce(nullif(regexp_replace(coalesce(_q, ''), '\D', '', 'g'), '')::int, 1)))
$$;

CREATE OR REPLACE FUNCTION public.mov_estoque(_org uuid, _product uuid, _delta integer, _tipo text, _motivo text, _comodato uuid, _schedule uuid, _origem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE antes int; depois int;
BEGIN
  IF _product IS NULL OR _delta IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('fera.estoque_mov', '1', true);
  UPDATE public.products SET stock = stock + _delta WHERE id = _product AND organization_id = _org RETURNING stock - _delta, stock INTO antes, depois;
  PERFORM set_config('fera.estoque_mov', '', true);
  IF antes IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.stock_movements (organization_id, product_id, tipo, quantidade, saldo_antes, saldo_depois, motivo, comodato_id, schedule_id, autor_id, origem)
    VALUES (_org, _product, _tipo, _delta, antes, depois, left(_motivo, 300), _comodato, _schedule, public.historico_autor(), coalesce(_origem, public.historico_origem()));
  RETURN jsonb_build_object('saldo_antes', antes, 'saldo_depois', depois);
END $$;
REVOKE ALL ON FUNCTION public.mov_estoque(uuid, uuid, integer, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mov_estoque(uuid, uuid, integer, text, text, uuid, uuid, text) TO service_role;

-- Direct edits of stock (product form, import) are recorded too.
CREATE OR REPLACE FUNCTION public.product_estoque_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE antes int := CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE OLD.stock END;
BEGIN
  IF NEW.stock IS DISTINCT FROM antes AND coalesce(current_setting('fera.estoque_mov', true), '') <> '1'
     AND coalesce(current_setting('fera.estoque_demo', true), '') <> '1' THEN
    INSERT INTO public.stock_movements (organization_id, product_id, tipo, quantidade, saldo_antes, saldo_depois, motivo, autor_id, origem)
      VALUES (NEW.organization_id, NEW.id, 'cadastro', NEW.stock - antes, antes, NEW.stock,
        CASE WHEN TG_OP = 'INSERT' THEN 'Estoque inicial do cadastro' ELSE 'Alterado no cadastro do produto' END, public.historico_autor(), public.historico_origem());
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_product_estoque_log AFTER INSERT OR UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.product_estoque_log();

-- Installed base and stock close by themselves: a dispenser installed (ATIVO/EM_TESTE) or removed and waiting for the return invoice (RETIRADO)
-- is out of stock; any other status (or deletion) puts it back. SEPARADO/PREVISTO only reserve.
CREATE OR REPLACE FUNCTION public.comodato_estoque() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o_fora boolean := false; n_fora boolean := false; oq int := 0; nq int := 0;
BEGIN
  IF coalesce(current_setting('fera.estoque_demo', true), '') = '1' THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN
    oq := public.qtd_aparelhos(OLD.quantidade);
    o_fora := upper(coalesce(OLD.status, '')) IN ('ATIVO','EM_TESTE','RETIRADO')
      AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = OLD.product_id AND p.is_dispenser);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    nq := public.qtd_aparelhos(NEW.quantidade);
    n_fora := upper(coalesce(NEW.status, '')) IN ('ATIVO','EM_TESTE','RETIRADO')
      AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.is_dispenser);
  END IF;
  IF o_fora AND n_fora AND OLD.product_id = NEW.product_id THEN
    IF oq <> nq THEN
      PERFORM public.mov_estoque(NEW.organization_id, NEW.product_id, oq - nq, CASE WHEN nq > oq THEN 'instalacao' ELSE 'retirada' END,
        'Quantidade do ponto alterada', NEW.id, NEW.ocorrencia_schedule_id, NULL);
    END IF;
  ELSE
    IF o_fora THEN
      PERFORM public.mov_estoque(OLD.organization_id, OLD.product_id, oq, 'retirada',
        CASE WHEN TG_OP = 'DELETE' THEN 'Aparelho excluído da base' ELSE 'Aparelho voltou ao estoque' END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE OLD.id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.retirada_schedule_id END, NULL);
    END IF;
    IF n_fora THEN
      PERFORM public.mov_estoque(NEW.organization_id, NEW.product_id, -nq, 'instalacao', 'Aparelho instalado', NEW.id, NEW.ocorrencia_schedule_id, NULL);
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_comodato_estoque AFTER INSERT OR DELETE OR UPDATE OF status, product_id, quantidade ON public.comodatos FOR EACH ROW EXECUTE FUNCTION public.comodato_estoque();

-- Manual adjustment (manager only): entrada / saída / contagem with a reason.
CREATE OR REPLACE FUNCTION public.ajustar_estoque(_product uuid, _tipo text, _quantidade integer, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _org uuid; atual int; d int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Só o gestor pode ajustar o estoque';
  END IF;
  SELECT organization_id, stock INTO _org, atual FROM public.products
    WHERE id = _product AND organization_id = public.get_user_organization_id(auth.uid()) FOR UPDATE;
  IF _org IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF _tipo NOT IN ('entrada','saida','contagem') THEN RAISE EXCEPTION 'Tipo de ajuste inválido'; END IF;
  IF _quantidade IS NULL OR _quantidade < 0 OR _quantidade > 100000 OR (_tipo <> 'contagem' AND _quantidade = 0) THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF length(btrim(coalesce(_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo do ajuste'; END IF;
  d := CASE _tipo WHEN 'entrada' THEN _quantidade WHEN 'saida' THEN -_quantidade ELSE _quantidade - atual END;
  RETURN public.mov_estoque(_org, _product, d, _tipo, btrim(_motivo), NULL, NULL, 'app');
END $$;
REVOKE ALL ON FUNCTION public.ajustar_estoque(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque(uuid, text, integer, text) TO authenticated, service_role;

-- 3) Label ranges generated for the print shop (never repeated inside an organization).
CREATE TABLE public.etiqueta_faixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inicio integer NOT NULL,
  fim integer NOT NULL,
  largura_mm numeric(4,1) NOT NULL DEFAULT 50,
  altura_mm numeric(4,1) NOT NULL DEFAULT 30,
  gerado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT etiqueta_faixas_intervalo CHECK (inicio >= 1 AND fim <= 999999 AND fim >= inicio AND fim - inicio < 2000)
);
GRANT SELECT ON public.etiqueta_faixas TO authenticated;
GRANT ALL ON public.etiqueta_faixas TO service_role;
ALTER TABLE public.etiqueta_faixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "etiqueta_faixas_select_org" ON public.etiqueta_faixas FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE INDEX etiqueta_faixas_org_idx ON public.etiqueta_faixas (organization_id, inicio);

CREATE OR REPLACE FUNCTION public.registrar_faixa_etiquetas(_inicio integer, _fim integer, _largura numeric, _altura numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _org uuid := public.get_user_organization_id(auth.uid()); f record; novo uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Só o gestor pode gerar etiquetas';
  END IF;
  IF _org IS NULL THEN RAISE EXCEPTION 'Organização não encontrada'; END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _inicio < 1 OR _fim > 999999 OR _fim < _inicio THEN RAISE EXCEPTION 'Faixa inválida'; END IF;
  IF _fim - _inicio >= 2000 THEN RAISE EXCEPTION 'Gere no máximo 2000 etiquetas por vez'; END IF;
  IF _largura IS NULL OR _largura < 30 OR _largura > 100 OR _altura IS NULL OR _altura < 20 OR _altura > 80 THEN RAISE EXCEPTION 'Tamanho inválido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('etiquetas:' || _org::text));
  SELECT inicio, fim INTO f FROM public.etiqueta_faixas
    WHERE organization_id = _org AND int4range(inicio, fim, '[]') && int4range(_inicio, _fim, '[]') ORDER BY inicio LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Faixa já gerada: % a %', lpad(f.inicio::text, 6, '0'), lpad(f.fim::text, 6, '0');
  END IF;
  INSERT INTO public.etiqueta_faixas (organization_id, inicio, fim, largura_mm, altura_mm, gerado_por)
    VALUES (_org, _inicio, _fim, _largura, _altura, auth.uid()) RETURNING id INTO novo;
  RETURN jsonb_build_object('id', novo, 'inicio', _inicio, 'fim', _fim);
END $$;
REVOKE ALL ON FUNCTION public.registrar_faixa_etiquetas(integer, integer, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_faixa_etiquetas(integer, integer, numeric, numeric) TO authenticated, service_role;

-- Public QR lookups (anonymous): throttling log only, service role only.
CREATE TABLE public.etiqueta_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  numero integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.etiqueta_acessos TO service_role;
ALTER TABLE public.etiqueta_acessos ENABLE ROW LEVEL SECURITY;
CREATE INDEX etiqueta_acessos_ip_idx ON public.etiqueta_acessos (ip_hash, created_at DESC);

-- 4) Demo: snapshot of values changed by the scenario; Apagar reverts only the demo stock changes.
ALTER TABLE public.demo_registros ADD COLUMN IF NOT EXISTS dados jsonb;

CREATE OR REPLACE FUNCTION public.demo_definir_estoque(_org uuid, _product uuid, _stock integer, _min integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE atual int;
BEGIN
  SELECT stock INTO atual FROM public.products WHERE id = _product AND organization_id = _org FOR UPDATE;
  IF atual IS NULL THEN RETURN; END IF;
  PERFORM public.mov_estoque(_org, _product, _stock - atual, 'demo', 'Estoque de demonstração', NULL, NULL, 'demo');
  UPDATE public.products SET min_stock = greatest(0, _min) WHERE id = _product AND organization_id = _org;
END $$;
REVOKE ALL ON FUNCTION public.demo_definir_estoque(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_definir_estoque(uuid, uuid, integer, integer) TO service_role;

ALTER FUNCTION public.apagar_cenario_demo(uuid) RENAME TO apagar_cenario_demo_base;
REVOKE ALL ON FUNCTION public.apagar_cenario_demo_base(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apagar_cenario_demo_base(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apagar_cenario_demo(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j jsonb; M uuid[]; S uuid[]; r jsonb; d record;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'Organização obrigatória'; END IF;
  j := public.demo_conjunto(_org);
  M := ARRAY(SELECT jsonb_array_elements_text(j->'comodatos')::uuid);
  S := ARRAY(SELECT jsonb_array_elements_text(j->'schedules')::uuid);
  PERFORM set_config('fera.estoque_demo', '1', true);
  -- Revert exactly the demo stock deltas (real movements made meanwhile are kept), then the demo minimums.
  FOR d IN SELECT product_id, sum(quantidade)::int AS delta FROM public.stock_movements
      WHERE organization_id = _org AND (comodato_id = ANY(M) OR schedule_id = ANY(S) OR origem = 'demo') GROUP BY product_id LOOP
    UPDATE public.products SET stock = stock - d.delta WHERE id = d.product_id AND organization_id = _org;
  END LOOP;
  UPDATE public.products p SET min_stock = (r2.dados->>'min_stock')::int
    FROM public.demo_registros r2
    WHERE r2.organization_id = _org AND r2.tabela = 'products_estoque' AND r2.registro_id = p.id AND p.organization_id = _org AND r2.dados ? 'min_stock';
  DELETE FROM public.stock_movements WHERE organization_id = _org AND (comodato_id = ANY(M) OR schedule_id = ANY(S) OR origem = 'demo');
  r := public.apagar_cenario_demo_base(_org);
  PERFORM set_config('fera.estoque_demo', '', true);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.apagar_cenario_demo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apagar_cenario_demo(uuid) TO service_role;