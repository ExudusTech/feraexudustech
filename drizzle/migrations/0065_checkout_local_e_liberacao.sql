ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS checkout_liberado_por uuid NULL,
  ADD COLUMN IF NOT EXISTS checkout_liberado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS checkout_liberacao_motivo text NULL,
  ADD COLUMN IF NOT EXISTS checkout_latitude double precision NULL,
  ADD COLUMN IF NOT EXISTS checkout_longitude double precision NULL,
  ADD COLUMN IF NOT EXISTS checkout_distancia_m integer NULL,
  ADD COLUMN IF NOT EXISTS checkout_localizacao_origem text NULL;