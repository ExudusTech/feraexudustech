ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS aparelhos_previstos uuid[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.schedules.aparelhos_previstos IS 'Concentrated revisit: comodatos (devices) whose next maintenance is due in this visit';

ALTER TABLE public.planos_manutencao
  ADD COLUMN IF NOT EXISTS modo_agenda text NOT NULL DEFAULT 'rota',
  ADD COLUMN IF NOT EXISTS regra_data text,
  ADD COLUMN IF NOT EXISTS proxima_data date,
  ADD COLUMN IF NOT EXISTS dia_mes smallint;
ALTER TABLE public.planos_manutencao ADD CONSTRAINT planos_modo_agenda_chk CHECK (modo_agenda IN ('rota', 'data'));
ALTER TABLE public.planos_manutencao ADD CONSTRAINT planos_regra_data_chk CHECK (regra_data IS NULL OR regra_data IN ('manual', 'dia_mes', 'intervalo'));
ALTER TABLE public.planos_manutencao ADD CONSTRAINT planos_dia_mes_chk CHECK (dia_mes IS NULL OR dia_mes BETWEEN 1 AND 31);
COMMENT ON COLUMN public.planos_manutencao.modo_agenda IS 'rota = client follows the city route day; data = served on specific dates (outside the route)';

-- A cancelled plan visit no longer blocks booking the same plan on that date.
DROP INDEX IF EXISTS public.schedules_plano_data_uniq;
CREATE UNIQUE INDEX schedules_plano_data_uniq ON public.schedules USING btree (plano_manutencao_id, scheduled_date) WHERE plano_manutencao_id IS NOT NULL AND status <> 'cancelado';