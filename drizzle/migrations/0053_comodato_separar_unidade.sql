-- Split one device off a point with quantity > 1 (one QR per device) without touching the stock balance.
CREATE OR REPLACE FUNCTION public.comodato_estoque() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o_fora boolean := false; n_fora boolean := false; oq int := 0; nq int := 0;
BEGIN
  IF coalesce(current_setting('fera.estoque_demo', true), '') = '1' OR coalesce(current_setting('fera.estoque_pausa', true), '') = '1' THEN RETURN NULL; END IF;
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

CREATE OR REPLACE FUNCTION public.comodato_separar_unidade(_id uuid, _org uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.comodatos%ROWTYPE; q int; novo uuid;
BEGIN
  SELECT * INTO c FROM public.comodatos WHERE id = _id AND organization_id = _org FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  q := public.qtd_aparelhos(c.quantidade);
  IF q <= 1 THEN RETURN c.id; END IF;
  PERFORM set_config('fera.estoque_pausa', '1', true);
  UPDATE public.comodatos SET quantidade = (q - 1)::text WHERE id = c.id;
  INSERT INTO public.comodatos (organization_id, client_id, lead_id, product_id, refil_product_id, dispenser_family_id, linha_produto, fabricante, localizacao_interna,
      endereco_instalacao, cidade, estado, data_inicio, status, ultima_manutencao, proxima_manutencao, periodicidade_manut, notes, created_by, quantidade, foto_path,
      estado_atual, ultima_avaliacao_em, origem, origem_schedule_id, aparelho_descricao, ativado_em)
    VALUES (c.organization_id, c.client_id, c.lead_id, c.product_id, c.refil_product_id, c.dispenser_family_id, c.linha_produto, c.fabricante, c.localizacao_interna,
      c.endereco_instalacao, c.cidade, c.estado, c.data_inicio, c.status, c.ultima_manutencao, c.proxima_manutencao, c.periodicidade_manut, c.notes, c.created_by, '1', c.foto_path,
      c.estado_atual, c.ultima_avaliacao_em, c.origem, NULL, c.aparelho_descricao, c.ativado_em)
    RETURNING id INTO novo;
  PERFORM set_config('fera.estoque_pausa', '', true);
  RETURN novo;
END $$;
REVOKE ALL ON FUNCTION public.comodato_separar_unidade(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comodato_separar_unidade(uuid, uuid) TO service_role;