ALTER TABLE public.leads ADD COLUMN city TEXT;

UPDATE public.leads l
SET city = c.city
FROM public.clients c
WHERE l.city IS NULL
  AND l.client_id = c.id
  AND c.city IS NOT NULL;

CREATE INDEX leads_open_person_company_city_idx
ON public.leads (organization_id, pessoa_id, lower(empresa_nome), lower(city), created_at DESC)
WHERE pessoa_id IS NOT NULL
  AND place_id IS NULL
  AND stage NOT IN ('fechado_ganho', 'fechado_perdido');