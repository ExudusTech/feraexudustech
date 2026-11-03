ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS confirmacao_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmacao_ultimo_erro text;

-- Client confirmations only for visits created from 2026-11-03 (São Paulo) with a client chat.
UPDATE public.schedules SET confirmacao_status = 'nao_aplicavel'
  WHERE confirmacao_status = 'pendente' AND created_at < '2026-11-03T03:00:00Z';

-- A new visit for a lead whose client asked to reschedule cancels the old one in the same transaction.
CREATE OR REPLACE FUNCTION public.cancel_rescheduled_visits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.status NOT IN ('agendado','confirmado') THEN RETURN NEW; END IF;
  FOR r IN SELECT id FROM public.schedules
    WHERE organization_id = NEW.organization_id AND lead_id = NEW.lead_id AND id <> NEW.id
      AND confirmacao_status = 'remarcar' AND status IN ('agendado','confirmado') FOR UPDATE
  LOOP
    UPDATE public.schedules SET status = 'cancelado', nao_realizado_motivo = 'remarcado',
      notes = concat_ws(E'\n', notes, 'Remarcado pelo cliente — nova visita ' || NEW.id::text) WHERE id = r.id;
    INSERT INTO public.lead_timeline (organization_id, lead_id, tipo, origem, resumo, referencia_id)
      VALUES (NEW.organization_id, NEW.lead_id, 'visita', 'fera', 'Visita remarcada: anterior cancelada e nova criada', NEW.id);
  END LOOP;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.cancel_rescheduled_visits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cancel_rescheduled_visits ON public.schedules;
CREATE TRIGGER trg_cancel_rescheduled_visits AFTER INSERT ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.cancel_rescheduled_visits();