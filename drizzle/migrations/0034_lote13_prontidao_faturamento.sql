
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS operacao_material text,
  ADD COLUMN IF NOT EXISTS itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exige_nota boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exige_material boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_nota text,
  ADD COLUMN IF NOT EXISTS nota_status text NOT NULL DEFAULT 'nao_exigida',
  ADD COLUMN IF NOT EXISTS material_status text NOT NULL DEFAULT 'nao_exigido',
  ADD COLUMN IF NOT EXISTS prontidao text NOT NULL DEFAULT 'pronto',
  ADD COLUMN IF NOT EXISTS material_separado_em timestamptz,
  ADD COLUMN IF NOT EXISTS material_separado_por uuid,
  ADD COLUMN IF NOT EXISTS prontidao_alertado_em timestamptz,
  ADD COLUMN IF NOT EXISTS levantamento jsonb;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS cnpj_situacao text,
  ADD COLUMN IF NOT EXISTS cnpj_verificado_em timestamptz,
  ADD COLUMN IF NOT EXISTS levantamento jsonb;
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS cnpj_situacao text,
  ADD COLUMN IF NOT EXISTS cnpj_verificado_em timestamptz,
  ADD COLUMN IF NOT EXISTS levantamento jsonb;

CREATE OR REPLACE FUNCTION public.cnpj_valido(_cnpj text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE d text := regexp_replace(coalesce(_cnpj,''),'\D','','g'); s int; r int; i int;
  w1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
  IF length(d) <> 14 OR d ~ '^(\d)\1{13}$' THEN RETURN false; END IF;
  s := 0; FOR i IN 1..12 LOOP s := s + substr(d,i,1)::int * w1[i]; END LOOP;
  r := s % 11; r := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  IF r <> substr(d,13,1)::int THEN RETURN false; END IF;
  s := 0; FOR i IN 1..13 LOOP s := s + substr(d,i,1)::int * w2[i]; END LOOP;
  r := s % 11; r := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  RETURN r = substr(d,14,1)::int;
END $$;

CREATE OR REPLACE FUNCTION public.schedule_prontidao()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.operacao_material IS NOT NULL AND NEW.operacao_material NOT IN
     ('instalacao_teste','instalacao_definitiva','entrega','substituicao','manutencao_reposicao') THEN
    RAISE EXCEPTION 'Operação de material inválida';
  END IF;
  IF NEW.tipo_nota IS NOT NULL AND NEW.tipo_nota NOT IN ('remessa_comodato','remessa_teste','venda','retorno') THEN
    RAISE EXCEPTION 'Tipo de nota inválido';
  END IF;
  NEW.exige_nota := NEW.operacao_material IS NOT NULL;
  NEW.exige_material := NEW.operacao_material IS NOT NULL;
  IF NEW.exige_nota AND NEW.tipo_nota IS NULL THEN
    NEW.tipo_nota := CASE NEW.operacao_material WHEN 'instalacao_teste' THEN 'remessa_teste'
      WHEN 'instalacao_definitiva' THEN 'remessa_comodato' WHEN 'substituicao' THEN 'remessa_comodato' ELSE 'venda' END;
  END IF;
  IF NOT NEW.exige_nota THEN NEW.nota_status := 'nao_exigida'; NEW.tipo_nota := NULL;
  ELSIF NEW.nota_status <> 'anexada' THEN NEW.nota_status := 'pendente'; END IF;
  IF NOT NEW.exige_material THEN NEW.material_status := 'nao_exigido';
  ELSIF NEW.material_status <> 'separado' THEN NEW.material_status := 'pendente'; END IF;
  NEW.prontidao := CASE
    WHEN NEW.nota_status = 'pendente' AND NEW.material_status = 'pendente' THEN 'falta_ambos'
    WHEN NEW.nota_status = 'pendente' THEN 'falta_nota'
    WHEN NEW.material_status = 'pendente' THEN 'falta_material'
    ELSE 'pronto' END;
  IF NEW.prontidao = 'pronto' THEN NEW.prontidao_alertado_em := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS schedule_prontidao ON public.schedules;
CREATE TRIGGER schedule_prontidao BEFORE INSERT OR UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.schedule_prontidao();

CREATE TABLE public.tarefas_faturamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL UNIQUE REFERENCES public.schedules(id) ON DELETE CASCADE,
  numero serial,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  tipo_operacao text NOT NULL,
  tipo_nota text NOT NULL,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  empresa_nome text,
  razao_social text,
  cnpj text,
  cnpj_verificado boolean NOT NULL DEFAULT false,
  endereco text,
  contato text,
  data_visita date NOT NULL,
  prazo timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'aberta',
  numero_nota text,
  pdf_path text,
  notificada_em timestamptz,
  lembrete_d1_em timestamptz,
  concluida_por uuid,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tarefas_faturamento_org_status ON public.tarefas_faturamento (organization_id, status, prazo);
GRANT SELECT, UPDATE ON public.tarefas_faturamento TO authenticated;
GRANT ALL ON public.tarefas_faturamento TO service_role;
ALTER TABLE public.tarefas_faturamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver tarefas de faturamento" ON public.tarefas_faturamento FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR (organization_id = get_user_organization_id(auth.uid())
    AND (is_privileged_user(auth.uid()) OR is_financeiro(auth.uid()) OR can_see_schedule(auth.uid(), schedule_id))));
CREATE POLICY "Financeiro atualiza tarefas" ON public.tarefas_faturamento FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR (organization_id = get_user_organization_id(auth.uid())
    AND (is_privileged_user(auth.uid()) OR is_financeiro(auth.uid()))))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR (organization_id = get_user_organization_id(auth.uid())
    AND (is_privileged_user(auth.uid()) OR is_financeiro(auth.uid()))));

CREATE OR REPLACE FUNCTION public.validate_tarefa_faturamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('aberta','concluida','cancelada') THEN RAISE EXCEPTION 'Status de tarefa inválido'; END IF;
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
       OR NEW.itens IS DISTINCT FROM OLD.itens OR NEW.data_visita IS DISTINCT FROM OLD.data_visita
       OR NEW.cnpj IS DISTINCT FROM OLD.cnpj OR NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao THEN
      RAISE EXCEPTION 'Dados da operação não podem ser alterados pela tarefa';
    END IF;
    IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN RAISE EXCEPTION 'Tarefa só é cancelada pelo agendamento'; END IF;
  END IF;
  IF NEW.pdf_path IS NOT NULL AND split_part(NEW.pdf_path,'/',1) <> NEW.organization_id::text THEN
    RAISE EXCEPTION 'Arquivo da nota inválido';
  END IF;
  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    IF NEW.pdf_path IS NULL OR coalesce(btrim(NEW.numero_nota),'') = '' THEN
      RAISE EXCEPTION 'Anexe o PDF e informe o número da nota para concluir';
    END IF;
    NEW.concluida_em := now(); NEW.concluida_por := coalesce(NEW.concluida_por, auth.uid());
    UPDATE public.schedules SET nota_status = 'anexada' WHERE id = NEW.schedule_id;
    IF NEW.lead_id IS NOT NULL THEN
      INSERT INTO public.lead_timeline (organization_id, lead_id, tipo, origem, resumo, referencia_id)
        VALUES (NEW.organization_id, NEW.lead_id, 'resumo', 'fera', 'Nota ' || NEW.numero_nota || ' anexada', NEW.schedule_id);
    END IF;
  ELSIF OLD.status = 'concluida' AND NEW.status = 'aberta' THEN
    NEW.concluida_em := NULL; NEW.concluida_por := NULL;
    UPDATE public.schedules SET nota_status = 'pendente' WHERE id = NEW.schedule_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER validate_tarefa_faturamento BEFORE UPDATE ON public.tarefas_faturamento
  FOR EACH ROW EXECUTE FUNCTION public.validate_tarefa_faturamento();

CREATE OR REPLACE FUNCTION public.sync_tarefa_faturamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; l record; _cnpj text; _nome text; _razao text; _end text; _cont text; _prazo timestamptz;
BEGIN
  IF NOT NEW.exige_nota OR NEW.status IN ('cancelado','nao_realizado') THEN
    UPDATE public.tarefas_faturamento SET status = 'cancelada', updated_at = now()
      WHERE schedule_id = NEW.id AND status = 'aberta';
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
  INSERT INTO public.tarefas_faturamento (organization_id, schedule_id, client_id, lead_id, tipo_operacao, tipo_nota, itens,
      empresa_nome, razao_social, cnpj, cnpj_verificado, endereco, contato, data_visita, prazo)
    VALUES (NEW.organization_id, NEW.id, NEW.client_id, NEW.lead_id, NEW.operacao_material, NEW.tipo_nota, NEW.itens,
      _nome, _razao, _cnpj, public.cnpj_valido(_cnpj), NULLIF(_end,''), NULLIF(_cont,''), NEW.scheduled_date, _prazo)
  ON CONFLICT (schedule_id) DO UPDATE SET
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
CREATE TRIGGER sync_tarefa_faturamento AFTER INSERT OR UPDATE OF operacao_material, itens, tipo_nota, scheduled_date, status, client_id, lead_id
  ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.sync_tarefa_faturamento();

ALTER TABLE public.notification_recipients DROP CONSTRAINT IF EXISTS team_recipient_events_valid;
ALTER TABLE public.notification_recipients ADD CONSTRAINT team_recipient_events_valid CHECK (eventos <@ ARRAY[
  'agendamento_comercial','agendamento_tecnico','transferencia','lead_matriz','visita_concluida','checkin_fora_do_local',
  'visita_atrasada','visita_sem_confirmacao','manutencao_do_dia','pedido_emergencial','pedido_emergencial_decidido','visita_aberta',
  'tarefa_nota_criada','tarefa_nota_d1','prontidao_pendente']::text[]);
