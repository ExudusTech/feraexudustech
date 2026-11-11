-- Ordem A (11/11): activation occurrences of the existing installed base, and devices of that base outside stock accounting.
CREATE OR REPLACE FUNCTION public.schedule_ocorrencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ocorrencia_tipo IS NULL THEN
    NEW.ocorrencia_tipo := public.ocorrencia_tipo_padrao(NEW.schedule_type, NEW.schedule_subtype, NEW.operacao_material);
  END IF;
  IF NEW.ocorrencia_tipo NOT IN ('primeira_visita','instalacao_teste','venda_direta','manutencao_preventiva','chamado_corretivo','entrega','substituicao','coleta_devolucao','ativacao_base') THEN
    RAISE EXCEPTION 'Tipo de ocorrência inválido';
  END IF;
  IF NEW.coleta_status IS NOT NULL AND NEW.coleta_status NOT IN ('coletando','rascunho','pendente','confirmada') THEN
    RAISE EXCEPTION 'Situação da coleta inválida';
  END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE public.organizations SET ocorrencia_seq = ocorrencia_seq + 1 WHERE id = NEW.organization_id RETURNING ocorrencia_seq INTO NEW.ocorrencia_numero;
  ELSIF NEW.ocorrencia_numero IS DISTINCT FROM OLD.ocorrencia_numero AND OLD.ocorrencia_numero IS NOT NULL THEN
    NEW.ocorrencia_numero := OLD.ocorrencia_numero;
  END IF;
  RETURN NEW;
END $function$;

-- Devices with origem 'base_existente' were already at the client before Fera: activating them never leaves stock.
-- When such a device leaves the client for good (ENCERRADO) it physically enters the warehouse, so stock goes up once.
CREATE OR REPLACE FUNCTION public.comodato_estoque()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o_fora boolean := false; n_fora boolean := false; oq int := 0; nq int := 0;
BEGIN
  IF coalesce(current_setting('fera.estoque_demo', true), '') = '1' OR coalesce(current_setting('fera.estoque_pausa', true), '') = '1' THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN
    oq := public.qtd_aparelhos(OLD.quantidade);
    o_fora := upper(coalesce(OLD.status, '')) IN ('ATIVO','EM_TESTE','RETIRADO') AND coalesce(OLD.origem, '') <> 'base_existente'
      AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = OLD.product_id AND p.is_dispenser);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    nq := public.qtd_aparelhos(NEW.quantidade);
    n_fora := upper(coalesce(NEW.status, '')) IN ('ATIVO','EM_TESTE','RETIRADO') AND coalesce(NEW.origem, '') <> 'base_existente'
      AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.is_dispenser);
  END IF;
  IF TG_OP = 'UPDATE' AND coalesce(OLD.origem, '') = 'base_existente' AND upper(coalesce(OLD.status, '')) IN ('ATIVO','EM_TESTE','RETIRADO')
     AND upper(coalesce(NEW.status, '')) = 'ENCERRADO'
     AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = OLD.product_id AND p.is_dispenser) THEN
    PERFORM public.mov_estoque(OLD.organization_id, OLD.product_id, oq, 'retirada', 'Aparelho da base existente recolhido ao estoque',
      OLD.id, NEW.retirada_schedule_id, NULL);
    RETURN NULL;
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
END $function$;