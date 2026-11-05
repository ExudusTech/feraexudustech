ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS ocorrencia_seq integer NOT NULL DEFAULT 0;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS ocorrencia_numero integer,
  ADD COLUMN IF NOT EXISTS ocorrencia_tipo text,
  ADD COLUMN IF NOT EXISTS coleta_status text,
  ADD COLUMN IF NOT EXISTS coleta_rascunho jsonb,
  ADD COLUMN IF NOT EXISTS coleta_resumo text,
  ADD COLUMN IF NOT EXISTS coleta_pendencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coleta_confirmada_em timestamptz,
  ADD COLUMN IF NOT EXISTS coleta_confirmada_por uuid,
  ADD COLUMN IF NOT EXISTS coleta_processada_em timestamptz;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS ocorrencia_codigo text
  GENERATED ALWAYS AS (CASE WHEN ocorrencia_numero IS NULL THEN NULL ELSE 'OC-' || lpad(ocorrencia_numero::text, 6, '0') END) STORED;

CREATE OR REPLACE FUNCTION public.ocorrencia_tipo_padrao(_type text, _sub text, _op text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _op = 'substituicao' THEN 'substituicao'
    WHEN _op = 'instalacao_teste' THEN 'instalacao_teste'
    WHEN _op = 'instalacao_definitiva' THEN 'venda_direta'
    WHEN _op = 'entrega' OR _type = 'entrega' THEN 'entrega'
    WHEN _type = 'visita_comercial' THEN 'primeira_visita'
    WHEN _type = 'manutencao' AND _sub = 'REPOSICAO' THEN 'chamado_corretivo'
    WHEN _type = 'manutencao' THEN 'manutencao_preventiva'
    WHEN _sub = 'INSTALACAO' THEN 'instalacao_teste'
    ELSE 'chamado_corretivo' END
$$;

CREATE OR REPLACE FUNCTION public.schedule_ocorrencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.ocorrencia_tipo IS NULL THEN
    NEW.ocorrencia_tipo := public.ocorrencia_tipo_padrao(NEW.schedule_type, NEW.schedule_subtype, NEW.operacao_material);
  END IF;
  IF NEW.ocorrencia_tipo NOT IN ('primeira_visita','instalacao_teste','venda_direta','manutencao_preventiva','chamado_corretivo','entrega','substituicao','coleta_devolucao') THEN
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
END $$;
DROP TRIGGER IF EXISTS schedule_ocorrencia ON public.schedules;
CREATE TRIGGER schedule_ocorrencia BEFORE INSERT OR UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.schedule_ocorrencia();

WITH n AS (SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS rn FROM public.schedules WHERE ocorrencia_numero IS NULL)
UPDATE public.schedules s SET ocorrencia_numero = n.rn FROM n WHERE s.id = n.id;
UPDATE public.organizations o SET ocorrencia_seq = GREATEST(o.ocorrencia_seq, coalesce((SELECT max(ocorrencia_numero) FROM public.schedules s WHERE s.organization_id = o.id), 0));
CREATE UNIQUE INDEX IF NOT EXISTS schedules_org_ocorrencia ON public.schedules (organization_id, ocorrencia_numero);

ALTER TABLE public.schedule_evidencias
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'foto',
  ADD COLUMN IF NOT EXISTS audio_path text,
  ADD COLUMN IF NOT EXISTS duracao_s integer,
  ADD COLUMN IF NOT EXISTS transcricao text,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS client_uuid uuid;
ALTER TABLE public.schedule_evidencias DROP CONSTRAINT IF EXISTS schedule_evidencias_tipo_chk;
ALTER TABLE public.schedule_evidencias ADD CONSTRAINT schedule_evidencias_tipo_chk CHECK (tipo IN ('foto','audio','texto'));
CREATE UNIQUE INDEX IF NOT EXISTS schedule_evidencias_client_uuid ON public.schedule_evidencias (client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE public.comodatos ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aparelho_descricao text;
ALTER TABLE public.comodatos DROP CONSTRAINT IF EXISTS comodatos_status_check;
ALTER TABLE public.comodatos ADD CONSTRAINT comodatos_status_check CHECK (status IN ('ATIVO','SUSPENSO','ENCERRADO','PENDENTE','PREVISTO'));

CREATE OR REPLACE FUNCTION public.lead_comodatos_para_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    UPDATE public.comodatos SET client_id = NEW.client_id WHERE lead_id = NEW.id AND client_id IS NULL AND organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lead_comodatos_para_cliente ON public.leads;
CREATE TRIGGER lead_comodatos_para_cliente AFTER UPDATE OF client_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lead_comodatos_para_cliente();

DROP POLICY IF EXISTS "Audio visita: envia" ON storage.objects;
DROP POLICY IF EXISTS "Audio visita: le" ON storage.objects;
CREATE POLICY "Audio visita: envia" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'visit-audio' AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    AND public.can_see_schedule(auth.uid(), ((storage.foldername(name))[2])::uuid));
CREATE POLICY "Audio visita: le" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'visit-audio' AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    AND public.can_see_schedule(auth.uid(), ((storage.foldername(name))[2])::uuid));

CREATE INDEX IF NOT EXISTS schedules_coleta_pendente ON public.schedules (organization_id, assigned_to) WHERE coleta_status = 'pendente';