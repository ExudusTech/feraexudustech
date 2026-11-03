CREATE TABLE IF NOT EXISTS public.backup_20261103b_schedules AS SELECT s.*, now() AS backup_at FROM public.schedules s WHERE s.status = 'em_andamento';
REVOKE ALL ON public.backup_20261103b_schedules FROM anon, authenticated;
ALTER TABLE public.backup_20261103b_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS confirmacao_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_em timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_em timestamptz,
  ADD COLUMN IF NOT EXISTS duracao_min integer,
  ADD COLUMN IF NOT EXISTS resultado text,
  ADD COLUMN IF NOT EXISTS resumo_execucao text,
  ADD COLUMN IF NOT EXISTS nao_realizado_motivo text,
  ADD COLUMN IF NOT EXISTS confirmacao_d1_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS confirmacao_dia_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS atraso_alertado_em timestamptz,
  ADD COLUMN IF NOT EXISTS sem_confirmacao_alertado_em timestamptz;

UPDATE public.schedules SET status = 'em_atendimento' WHERE status = 'em_andamento';
UPDATE public.schedules SET latitude = l.latitude, longitude = l.longitude
  FROM public.leads l WHERE l.id = schedules.lead_id AND schedules.latitude IS NULL AND l.latitude IS NOT NULL;
UPDATE public.schedules SET confirmacao_status = 'nao_aplicavel'
  WHERE lead_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = schedules.lead_id AND l.gptmaker_chat_id IS NOT NULL);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS raio_checkin_m integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS confirmacao_d1_hora text NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS confirmacao_dia_horas_antes integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS alerta_atraso_min integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS retencao_localizacao_dias integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS retencao_fotos_dias integer NOT NULL DEFAULT 730;

CREATE TABLE public.schedule_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL UNIQUE REFERENCES public.schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  checkin_em timestamptz NOT NULL DEFAULT now(),
  latitude double precision, longitude double precision, precisao_m double precision,
  distancia_m integer, fora_do_raio boolean NOT NULL DEFAULT false, sem_permissao boolean NOT NULL DEFAULT false,
  justificativa text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.schedule_evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  comodato_id uuid REFERENCES public.comodatos(id) ON DELETE SET NULL,
  foto_path text, observacoes text, itens text[] NOT NULL DEFAULT '{}',
  autor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.schedule_proximo_passo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL UNIQUE REFERENCES public.schedules(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('novo_agendamento','proposta','follow_up','perdido')),
  data_alvo date, motivo_perda text, descricao text, referencia_id uuid,
  proposta_enviada_em timestamptz, autor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.schedule_evidencias(schedule_id);
CREATE INDEX ON public.schedules(organization_id, scheduled_date);

GRANT SELECT ON public.schedule_checkins, public.schedule_evidencias, public.schedule_proximo_passo TO authenticated;
GRANT UPDATE (proposta_enviada_em) ON public.schedule_proximo_passo TO authenticated;
GRANT ALL ON public.schedule_checkins, public.schedule_evidencias, public.schedule_proximo_passo TO service_role;
ALTER TABLE public.schedule_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_proximo_passo ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_see_schedule(_user uuid, _schedule uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = _schedule
    AND (has_role(_user,'super_admin') OR (s.organization_id = get_user_organization_id(_user)
      AND (is_privileged_user(_user) OR is_operacional(_user) OR s.assigned_to = _user OR s.created_by = _user))))
$$;

CREATE POLICY "Checkins visible with schedule" ON public.schedule_checkins FOR SELECT TO authenticated USING (can_see_schedule(auth.uid(), schedule_id));
CREATE POLICY "Evidencias visible with schedule" ON public.schedule_evidencias FOR SELECT TO authenticated USING (can_see_schedule(auth.uid(), schedule_id));
CREATE POLICY "Proximo passo visible with schedule" ON public.schedule_proximo_passo FOR SELECT TO authenticated USING (can_see_schedule(auth.uid(), schedule_id));
CREATE POLICY "Proximo passo owner marks proposal" ON public.schedule_proximo_passo FOR UPDATE TO authenticated
  USING (can_see_schedule(auth.uid(), schedule_id)) WITH CHECK (can_see_schedule(auth.uid(), schedule_id));

-- Consultants see only their own visits; managers/operations see the whole organization.
DROP POLICY IF EXISTS "Users can view schedules in their org" ON public.schedules;
CREATE POLICY "Users view own or managed schedules" ON public.schedules FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'super_admin') OR (organization_id = get_user_organization_id(auth.uid())
    AND (is_privileged_user(auth.uid()) OR is_operacional(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid())));

CREATE OR REPLACE FUNCTION public.validate_schedule_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('agendado','confirmado','em_atendimento','concluido','nao_realizado','cancelado') THEN
    RAISE EXCEPTION 'Status de agendamento inválido';
  END IF;
  IF NEW.confirmacao_status NOT IN ('pendente','confirmado','remarcar','sem_resposta','nao_aplicavel') THEN
    RAISE EXCEPTION 'Confirmação inválida';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('concluido','nao_realizado','cancelado') THEN
      RAISE EXCEPTION 'Agendamento já finalizado';
    END IF;
    IF NEW.status = 'concluido' AND auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Use Encerrar para concluir a visita';
    END IF;
  END IF;
  IF NEW.status = 'concluido' AND NEW.checkout_em IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.schedule_proximo_passo p WHERE p.schedule_id = NEW.id) THEN
    RAISE EXCEPTION 'Defina o próximo passo antes de encerrar';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER validate_schedule_status BEFORE INSERT OR UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_status();

ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_checkins;