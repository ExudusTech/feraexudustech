ALTER TABLE public.schedule_checkins ADD COLUMN IF NOT EXISTS destino_sem_coordenadas boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS geocode_tentado_em timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS geocode_tentado_em timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS localizacao_origem text;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS geocode_tentado_em timestamptz;
UPDATE public.schedule_checkins SET destino_sem_coordenadas = true WHERE distancia_m IS NULL AND latitude IS NOT NULL;