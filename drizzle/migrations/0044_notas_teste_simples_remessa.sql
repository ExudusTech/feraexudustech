ALTER TABLE public.comodatos DROP CONSTRAINT comodatos_status_check;
ALTER TABLE public.comodatos ADD CONSTRAINT comodatos_status_check CHECK (status = ANY (ARRAY['ATIVO','SUSPENSO','ENCERRADO','PENDENTE','PREVISTO','EM_TESTE']));
ALTER TABLE public.tarefas_faturamento ADD COLUMN IF NOT EXISTS comodato_ids uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.validate_tarefa_faturamento()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('aberta','concluida','cancelada') THEN RAISE EXCEPTION 'Status de tarefa inválido'; END IF;
  IF NEW.acao NOT IN ('emitir','cancelar','devolucao','devolucao_remessa','baixar_remessa','emitir_comodato') THEN RAISE EXCEPTION 'Ação de tarefa inválida'; END IF;
  IF TG_OP = 'UPDATE' AND auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
       OR NEW.itens IS DISTINCT FROM OLD.itens OR NEW.data_visita IS DISTINCT FROM OLD.data_visita OR NEW.acao IS DISTINCT FROM OLD.acao
       OR NEW.cnpj IS DISTINCT FROM OLD.cnpj OR NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao OR NEW.comodato_ids IS DISTINCT FROM OLD.comodato_ids THEN
      RAISE EXCEPTION 'Dados da operação não podem ser alterados pela tarefa';
    END IF;
    IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN RAISE EXCEPTION 'Tarefa só é cancelada pelo agendamento'; END IF;
  END IF;
  IF NEW.pdf_path IS NOT NULL AND split_part(NEW.pdf_path,'/',1) <> NEW.organization_id::text THEN
    RAISE EXCEPTION 'Arquivo da nota inválido';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    IF NEW.acao NOT IN ('cancelar','baixar_remessa') AND (NEW.pdf_path IS NULL OR coalesce(btrim(NEW.numero_nota),'') = '') THEN
      RAISE EXCEPTION 'Anexe o PDF e informe o número da nota para concluir';
    END IF;
    NEW.concluida_em := now(); NEW.concluida_por := coalesce(NEW.concluida_por, auth.uid());
    IF NEW.acao = 'emitir' THEN
      UPDATE public.schedules SET nota_status = 'anexada' WHERE id = NEW.schedule_id;
    ELSIF NEW.acao = 'devolucao_remessa' THEN
      -- Test not approved: the device leaves EM_TESTE and goes back to stock once the return invoice exists.
      UPDATE public.inventory_items SET status = 'disponivel', em_comodato = false, client_id = NULL
        WHERE id IN (SELECT inventory_item_id FROM public.comodatos WHERE id = ANY(NEW.comodato_ids) AND organization_id = NEW.organization_id AND inventory_item_id IS NOT NULL);
      UPDATE public.comodatos SET status = 'ENCERRADO', data_fim = current_date,
        notes = concat_ws(E'\n', notes, 'Teste não aprovado — devolvido (NF ' || NEW.numero_nota || ')')
        WHERE id = ANY(NEW.comodato_ids) AND organization_id = NEW.organization_id AND status = 'EM_TESTE';
    ELSIF NEW.acao = 'emitir_comodato' THEN
      -- Sale accepted: the same test device becomes an active loan only with the loan invoice.
      UPDATE public.comodatos SET status = 'ATIVO' WHERE id = ANY(NEW.comodato_ids) AND organization_id = NEW.organization_id AND status = 'EM_TESTE';
    END IF;
    IF NEW.lead_id IS NOT NULL THEN
      INSERT INTO public.lead_timeline (organization_id, lead_id, tipo, origem, resumo, referencia_id)
        VALUES (NEW.organization_id, NEW.lead_id, 'resumo', 'fera',
          CASE NEW.acao WHEN 'cancelar' THEN 'Nota cancelada'
            WHEN 'devolucao' THEN 'Nota de devolução ' || coalesce(NEW.numero_nota,'') || ' anexada'
            WHEN 'devolucao_remessa' THEN 'NF de Devolução de Simples Remessa ' || coalesce(NEW.numero_nota,'') || ' anexada — aparelho volta ao estoque'
            WHEN 'baixar_remessa' THEN 'Simples Remessa baixada'
            WHEN 'emitir_comodato' THEN 'NF de Comodato ' || coalesce(NEW.numero_nota,'') || ' anexada — aparelho ativo'
            ELSE 'Nota ' || coalesce(NEW.numero_nota,'') || ' anexada' END, NEW.schedule_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'concluida' AND NEW.status = 'aberta' THEN
    NEW.concluida_em := NULL; NEW.concluida_por := NULL;
    IF NEW.acao = 'emitir' THEN UPDATE public.schedules SET nota_status = 'pendente' WHERE id = NEW.schedule_id; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.lead_comodatos_para_cliente()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ids uuid[]; c record; t record; _ultimo uuid; _itens jsonb; _end text; _cont text;
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    -- Points (planned and EM_TESTE devices), proposals, visits and billing tasks follow the new client.
    -- EM_TESTE devices stay EM_TESTE until the loan invoice (emitir_comodato) is concluded.
    SELECT coalesce(array_agg(id), '{}') INTO ids FROM public.comodatos
      WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id AND upper(coalesce(status,'')) = 'EM_TESTE';
    UPDATE public.comodatos SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
    UPDATE public.proposals SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
    UPDATE public.schedules SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
    UPDATE public.tarefas_faturamento SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;

    IF array_length(ids, 1) > 0 THEN
      SELECT name, company, document, razao_social, address, city, zip_code, phone, email INTO c FROM public.clients WHERE id = NEW.client_id;
      _end := NULLIF(concat_ws(', ', c.address, c.city, c.zip_code), ''); _cont := NULLIF(concat_ws(' · ', c.phone, c.email), '');
      SELECT coalesce(jsonb_agg(jsonb_build_object('product_id', m.product_id, 'descricao', coalesce(p.name, m.aparelho_descricao, 'Aparelho'),
          'quantidade', m.quantidade, 'comodato_id', m.id, 'local', m.localizacao_interna)), '[]') INTO _itens
        FROM public.comodatos m LEFT JOIN public.products p ON p.id = m.product_id WHERE m.id = ANY(ids);
      FOR t IN SELECT * FROM public.tarefas_faturamento WHERE organization_id = NEW.organization_id AND lead_id = NEW.id
          AND acao = 'emitir' AND tipo_nota = 'remessa_teste' AND status <> 'cancelada' ORDER BY data_visita LOOP
        INSERT INTO public.tarefas_faturamento (organization_id, schedule_id, acao, client_id, lead_id, tipo_operacao, tipo_nota, itens, empresa_nome, razao_social,
            cnpj, cnpj_verificado, endereco, contato, data_visita, prazo, referencia_tarefa_id, comodato_ids, observacao)
          VALUES (NEW.organization_id, t.schedule_id, 'baixar_remessa', NEW.client_id, NEW.id, 'instalacao_definitiva', 'remessa_teste', t.itens,
            coalesce(c.company, c.name), coalesce(c.razao_social, t.razao_social), coalesce(c.document, t.cnpj), public.cnpj_valido(coalesce(c.document, t.cnpj)),
            coalesce(_end, t.endereco), coalesce(_cont, t.contato), current_date, now() + interval '24 hours', t.id, ids,
            'Baixar a Simples Remessa nº ' || coalesce(NULLIF(btrim(t.numero_nota),''), '(número pendente)') || ' — teste aprovado, aparelho fica instalado')
          ON CONFLICT (schedule_id, acao) DO NOTHING;
        _ultimo := t.schedule_id;
      END LOOP;
      IF _ultimo IS NULL THEN
        SELECT s.id INTO _ultimo FROM public.schedules s WHERE s.organization_id = NEW.organization_id AND s.lead_id = NEW.id
          ORDER BY (s.operacao_material = 'instalacao_teste') DESC NULLS LAST, s.scheduled_date DESC LIMIT 1;
      END IF;
      IF _ultimo IS NOT NULL THEN
        INSERT INTO public.tarefas_faturamento (organization_id, schedule_id, acao, client_id, lead_id, tipo_operacao, tipo_nota, itens, empresa_nome, razao_social,
            cnpj, cnpj_verificado, endereco, contato, data_visita, prazo, comodato_ids, observacao)
          VALUES (NEW.organization_id, _ultimo, 'emitir_comodato', NEW.client_id, NEW.id, 'instalacao_definitiva', 'remessa_comodato', _itens,
            coalesce(c.company, c.name), c.razao_social, c.document, public.cnpj_valido(c.document), _end, _cont, current_date, now() + interval '24 hours', ids,
            'Emitir NF de Comodato do aparelho que já está instalado (teste aprovado). O aparelho fica ativo quando esta nota for concluída.')
          ON CONFLICT (schedule_id, acao) DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;