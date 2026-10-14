ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS zip_code TEXT;

COMMENT ON COLUMN public.schedules.zip_code IS 'CEP do local do agendamento, com ou sem máscara.';

UPDATE public.schedules AS s
SET
  location = CASE
    WHEN NULLIF(BTRIM(s.location), '') IS NULL
      OR LOWER(BTRIM(s.location)) = LOWER(BTRIM(COALESCE(l.city, '')))
      OR LOWER(BTRIM(s.location)) = LOWER(BTRIM(COALESCE(l.regiao, '')))
    THEN COALESCE(NULLIF(BTRIM(l.endereco), ''), s.location)
    ELSE s.location
  END,
  zip_code = CASE
    WHEN NULLIF(BTRIM(s.zip_code), '') IS NULL THEN NULLIF(BTRIM(l.zip_code), '')
    ELSE s.zip_code
  END,
  notes = CASE
    WHEN NULLIF(BTRIM(s.notes), '') IS NULL
      OR LOWER(BTRIM(s.notes)) = LOWER(BTRIM(COALESCE(l.city, '')))
      OR LOWER(BTRIM(s.notes)) = LOWER(BTRIM(COALESCE(l.regiao, '')))
    THEN CONCAT_WS(' | ',
      CASE WHEN NULLIF(BTRIM(COALESCE(l.empresa_nome, l.company, l.title)), '') IS NOT NULL THEN 'Empresa: ' || BTRIM(COALESCE(l.empresa_nome, l.company, l.title)) END,
      CASE WHEN NULLIF(BTRIM(COALESCE(p.nome, l.contact_name)), '') IS NOT NULL THEN 'Contato: ' || BTRIM(COALESCE(p.nome, l.contact_name)) END,
      CASE WHEN NULLIF(BTRIM(COALESCE(l.contact_phone, p.whatsapp, p.telefone)), '') IS NOT NULL THEN 'Telefone: ' || BTRIM(COALESCE(l.contact_phone, p.whatsapp, p.telefone)) END,
      CASE WHEN NULLIF(BTRIM(COALESCE(l.contact_email, p.email)), '') IS NOT NULL THEN 'E-mail: ' || BTRIM(COALESCE(l.contact_email, p.email)) END,
      CASE WHEN NULLIF(BTRIM(l.category), '') IS NOT NULL THEN 'Produto: ' || BTRIM(l.category) END,
      CASE WHEN NULLIF(BTRIM(l.maps_url), '') IS NOT NULL THEN 'Mapa: ' || BTRIM(l.maps_url) END
    )
    ELSE s.notes
  END,
  updated_at = NOW()
FROM public.leads AS l
LEFT JOIN public.pessoas AS p ON p.id = l.pessoa_id AND p.organization_id = l.organization_id
WHERE s.source = 'flora'
  AND s.lead_id = l.id
  AND s.organization_id = l.organization_id
  AND (
    NULLIF(BTRIM(s.location), '') IS NULL
    OR LOWER(BTRIM(s.location)) = LOWER(BTRIM(COALESCE(l.city, '')))
    OR LOWER(BTRIM(s.location)) = LOWER(BTRIM(COALESCE(l.regiao, '')))
    OR NULLIF(BTRIM(s.zip_code), '') IS NULL
    OR NULLIF(BTRIM(s.notes), '') IS NULL
    OR LOWER(BTRIM(s.notes)) = LOWER(BTRIM(COALESCE(l.city, '')))
    OR LOWER(BTRIM(s.notes)) = LOWER(BTRIM(COALESCE(l.regiao, '')))
  );