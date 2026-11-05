
CREATE OR REPLACE FUNCTION public.is_faturamento(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'faturamento')
$$;

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS bloquear_checkin_sem_nota boolean NOT NULL DEFAULT true;
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS checkin_liberado_por uuid,
  ADD COLUMN IF NOT EXISTS checkin_liberado_em timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_liberacao_motivo text,
  ADD COLUMN IF NOT EXISTS substituicao_resultado text,
  ADD COLUMN IF NOT EXISTS coleta_devolucao_tarefa_id uuid,
  ADD COLUMN IF NOT EXISTS devolucao_assinada_em timestamptz,
  ADD COLUMN IF NOT EXISTS devolucao_assinatura_path text;

ALTER TABLE public.tarefas_faturamento
  ADD COLUMN IF NOT EXISTS acao text NOT NULL DEFAULT 'emitir',
  ADD COLUMN IF NOT EXISTS referencia_tarefa_id uuid REFERENCES public.tarefas_faturamento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ordem_servico_id uuid,
  ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE public.tarefas_faturamento DROP CONSTRAINT IF EXISTS tarefas_faturamento_schedule_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS tarefas_faturamento_schedule_acao ON public.tarefas_faturamento (schedule_id, acao);

DROP POLICY IF EXISTS "Ver tarefas de faturamento" ON public.tarefas_faturamento;
DROP POLICY IF EXISTS "Financeiro atualiza tarefas" ON public.tarefas_faturamento;
CREATE POLICY "Ver tarefas de faturamento" ON public.tarefas_faturamento FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR (organization_id = get_user_organization_id(auth.uid())
    AND (is_privileged_user(auth.uid()) OR is_faturamento(auth.uid()) OR can_see_schedule(auth.uid(), schedule_id))));
CREATE POLICY "Faturamento atualiza tarefas" ON public.tarefas_faturamento FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR (organization_id = get_user_organization_id(auth.uid())
    AND (is_privileged_user(auth.uid()) OR is_faturamento(auth.uid()))))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR (organization_id = get_user_organization_id(auth.uid())
    AND (is_privileged_user(auth.uid()) OR is_faturamento(auth.uid()))));

DROP POLICY IF EXISTS "Notas: financeiro envia" ON storage.objects;
DROP POLICY IF EXISTS "Notas: financeiro substitui" ON storage.objects;
CREATE POLICY "Notas: faturamento envia" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notas-fiscais' AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    AND (public.is_privileged_user(auth.uid()) OR public.is_faturamento(auth.uid())));
CREATE POLICY "Notas: faturamento substitui" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'notas-fiscais' AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    AND (public.is_privileged_user(auth.uid()) OR public.is_faturamento(auth.uid())));

CREATE OR REPLACE FUNCTION public.validate_tarefa_faturamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('aberta','concluida','cancelada') THEN RAISE EXCEPTION 'Status de tarefa inválido'; END IF;
  IF NEW.acao NOT IN ('emitir','cancelar','devolucao') THEN RAISE EXCEPTION 'Ação de tarefa inválida'; END IF;
  IF TG_OP = 'UPDATE' AND auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
       OR NEW.itens IS DISTINCT FROM OLD.itens OR NEW.data_visita IS DISTINCT FROM OLD.data_visita OR NEW.acao IS DISTINCT FROM OLD.acao
       OR NEW.cnpj IS DISTINCT FROM OLD.cnpj OR NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao THEN
      RAISE EXCEPTION 'Dados da operação não podem ser alterados pela tarefa';
    END IF;
    IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN RAISE EXCEPTION 'Tarefa só é cancelada pelo agendamento'; END IF;
  END IF;
  IF NEW.pdf_path IS NOT NULL AND split_part(NEW.pdf_path,'/',1) <> NEW.organization_id::text THEN
    RAISE EXCEPTION 'Arquivo da nota inválido';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    IF NEW.acao <> 'cancelar' AND (NEW.pdf_path IS NULL OR coalesce(btrim(NEW.numero_nota),'') = '') THEN
      RAISE EXCEPTION 'Anexe o PDF e informe o número da nota para concluir';
    END IF;
    NEW.concluida_em := now(); NEW.concluida_por := coalesce(NEW.concluida_por, auth.uid());
    IF NEW.acao = 'emitir' THEN
      UPDATE public.schedules SET nota_status = 'anexada' WHERE id = NEW.schedule_id;
    END IF;
    IF NEW.lead_id IS NOT NULL THEN
      INSERT INTO public.lead_timeline (organization_id, lead_id, tipo, origem, resumo, referencia_id)
        VALUES (NEW.organization_id, NEW.lead_id, 'resumo', 'fera',
          CASE NEW.acao WHEN 'cancelar' THEN 'Nota cancelada' WHEN 'devolucao' THEN 'Nota de devolução ' || NEW.numero_nota || ' anexada'
            ELSE 'Nota ' || NEW.numero_nota || ' anexada' END, NEW.schedule_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'concluida' AND NEW.status = 'aberta' THEN
    NEW.concluida_em := NULL; NEW.concluida_por := NULL;
    IF NEW.acao = 'emitir' THEN UPDATE public.schedules SET nota_status = 'pendente' WHERE id = NEW.schedule_id; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_tarefa_faturamento ON public.tarefas_faturamento;
CREATE TRIGGER validate_tarefa_faturamento BEFORE INSERT OR UPDATE ON public.tarefas_faturamento
  FOR EACH ROW EXECUTE FUNCTION public.validate_tarefa_faturamento();

CREATE OR REPLACE FUNCTION public.sync_tarefa_faturamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; l record; _cnpj text; _nome text; _razao text; _end text; _cont text; _prazo timestamptz;
BEGIN
  IF NOT NEW.exige_nota OR NEW.status IN ('cancelado','nao_realizado') THEN
    UPDATE public.tarefas_faturamento SET status = 'cancelada', updated_at = now()
      WHERE schedule_id = NEW.id AND acao = 'emitir' AND status = 'aberta';
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NOT NULL THEN
    SELECT name, company, document, razao_social, address, city, zip_code, phone, email INTO c FROM public.clients WHERE id = NEW.client_id;
    _nome := coalesce(c.company, c.name); _cnpj := c.document; _razao := c.razao_social;
    _end := concat_ws(', ', c.address, c.city, c.zip_code); _cont := concat_ws(' · ', c.phone, c.email);
  ELSIF NEW.lead_id IS NOT NULL THEN
    SELECT empresa_nome, company, title, cnpj, razao_social, endereco, city, zip_code, contact_name, contact_phone, contact_email INTO l FROM public.leads WHERE id = NEW.lead_id;
    _nome := coalesce(l.empresa_nome, l.company, l.title); _cnpj := l.cnpj; _razao := l.razao_social;
    _end := concat_ws(', ', l.endereco, l.city, l.zip_code); _cont := concat_ws(' · ', l.contact_name, l.contact_phone, l.contact_email);
  END IF;
  _prazo := ((NEW.scheduled_date - 1)::timestamp + time '17:00') AT TIME ZONE 'America/Sao_Paulo';
  INSERT INTO public.tarefas_faturamento (organization_id, schedule_id, acao, client_id, lead_id, tipo_operacao, tipo_nota, itens,
      empresa_nome, razao_social, cnpj, cnpj_verificado, endereco, contato, data_visita, prazo)
    VALUES (NEW.organization_id, NEW.id, 'emitir', NEW.client_id, NEW.lead_id, NEW.operacao_material, NEW.tipo_nota, NEW.itens,
      _nome, _razao, _cnpj, public.cnpj_valido(_cnpj), NULLIF(_end,''), NULLIF(_cont,''), NEW.scheduled_date, _prazo)
  ON CONFLICT (schedule_id, acao) DO UPDATE SET
      tipo_operacao = EXCLUDED.tipo_operacao, tipo_nota = EXCLUDED.tipo_nota, itens = EXCLUDED.itens,
      empresa_nome = EXCLUDED.empresa_nome, razao_social = EXCLUDED.razao_social, cnpj = EXCLUDED.cnpj,
      cnpj_verificado = EXCLUDED.cnpj_verificado, endereco = EXCLUDED.endereco, contato = EXCLUDED.contato,
      data_visita = EXCLUDED.data_visita, prazo = EXCLUDED.prazo,
      lembrete_d1_em = CASE WHEN tarefas_faturamento.data_visita IS DISTINCT FROM EXCLUDED.data_visita THEN NULL ELSE tarefas_faturamento.lembrete_d1_em END,
      status = CASE WHEN tarefas_faturamento.status = 'cancelada' THEN 'aberta' ELSE tarefas_faturamento.status END,
      updated_at = now()
    WHERE tarefas_faturamento.status <> 'concluida';
  RETURN NEW;
END $$;
