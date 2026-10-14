CREATE TABLE public.pessoas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  whatsapp TEXT,
  instagram_user_id TEXT,
  instagram_handle TEXT,
  messenger_id TEXT,
  chat_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pessoas TO authenticated;
GRANT ALL ON public.pessoas TO service_role;

ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pessoas in their org"
ON public.pessoas FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert pessoas in their org"
ON public.pessoas FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update pessoas in their org"
ON public.pessoas FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Admins can delete pessoas"
ON public.pessoas FOR DELETE TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.is_privileged_user(auth.uid())
);

CREATE UNIQUE INDEX pessoas_org_whatsapp_unique
ON public.pessoas (organization_id, whatsapp)
WHERE whatsapp IS NOT NULL AND btrim(whatsapp) <> '';

CREATE UNIQUE INDEX pessoas_org_instagram_user_unique
ON public.pessoas (organization_id, instagram_user_id)
WHERE instagram_user_id IS NOT NULL AND btrim(instagram_user_id) <> '';

CREATE INDEX pessoas_org_email_idx
ON public.pessoas (organization_id, lower(email))
WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE INDEX pessoas_org_messenger_idx
ON public.pessoas (organization_id, messenger_id)
WHERE messenger_id IS NOT NULL AND btrim(messenger_id) <> '';

CREATE INDEX pessoas_chat_ids_idx ON public.pessoas USING GIN (chat_ids);

CREATE TRIGGER update_pessoas_updated_at
BEFORE UPDATE ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.leads
ADD COLUMN pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL;

CREATE INDEX leads_pessoa_id_idx ON public.leads (pessoa_id);
CREATE INDEX leads_open_establishment_idx
ON public.leads (organization_id, pessoa_id, place_id, created_at DESC)
WHERE pessoa_id IS NOT NULL AND stage NOT IN ('fechado_ganho', 'fechado_perdido');

DO $$
DECLARE
  lead_row RECORD;
  pessoa_uuid UUID;
  resolved_channel TEXT;
  resolved_identifier TEXT;
  email_normalized TEXT;
BEGIN
  FOR lead_row IN
    SELECT id, organization_id, contact_name, contact_email, contact_phone,
           instagram_handle, gptmaker_chat_id, canal_origem, created_at
    FROM public.leads
    WHERE gptmaker_chat_id IS NOT NULL
      AND btrim(gptmaker_chat_id) <> ''
      AND pessoa_id IS NULL
    ORDER BY created_at, id
  LOOP
    resolved_channel := NULL;
    resolved_identifier := NULL;
    email_normalized := NULLIF(lower(btrim(COALESCE(lead_row.contact_email, ''))), '');

    IF lead_row.gptmaker_chat_id LIKE '3DF9D839DDCF463A3A350ADF91C40B89-%' THEN
      resolved_channel := 'WHATSAPP';
      resolved_identifier := substring(lead_row.gptmaker_chat_id from length('3DF9D839DDCF463A3A350ADF91C40B89-') + 1);
    ELSIF lead_row.gptmaker_chat_id LIKE '3E081F8C517E26FF46107A02E12740D2-%' THEN
      resolved_channel := 'INSTAGRAM';
      resolved_identifier := substring(lead_row.gptmaker_chat_id from length('3E081F8C517E26FF46107A02E12740D2-') + 1);
    ELSIF lead_row.gptmaker_chat_id LIKE '3E082145442EE648F743C673F12AF2BE-%' THEN
      resolved_channel := 'MESSENGER';
      resolved_identifier := substring(lead_row.gptmaker_chat_id from length('3E082145442EE648F743C673F12AF2BE-') + 1);
    END IF;

    SELECT p.id INTO pessoa_uuid
    FROM public.pessoas p
    WHERE p.organization_id = lead_row.organization_id
      AND (
        (email_normalized IS NOT NULL AND lower(btrim(p.email)) = email_normalized)
        OR (resolved_channel = 'WHATSAPP' AND p.whatsapp = resolved_identifier)
        OR (resolved_channel = 'INSTAGRAM' AND p.instagram_user_id = resolved_identifier)
        OR (resolved_channel = 'MESSENGER' AND p.messenger_id = resolved_identifier)
      )
    ORDER BY CASE WHEN email_normalized IS NOT NULL AND lower(btrim(p.email)) = email_normalized THEN 0 ELSE 1 END, p.created_at
    LIMIT 1;

    IF pessoa_uuid IS NULL THEN
      INSERT INTO public.pessoas (
        organization_id, nome, email, telefone, whatsapp,
        instagram_user_id, instagram_handle, messenger_id, chat_ids,
        created_at, updated_at
      ) VALUES (
        lead_row.organization_id,
        COALESCE(NULLIF(btrim(lead_row.contact_name), ''), 'Contato'),
        NULLIF(btrim(lead_row.contact_email), ''),
        NULLIF(regexp_replace(COALESCE(lead_row.contact_phone, ''), '\D', '', 'g'), ''),
        CASE WHEN resolved_channel = 'WHATSAPP' THEN resolved_identifier END,
        CASE WHEN resolved_channel = 'INSTAGRAM' THEN resolved_identifier END,
        NULLIF(btrim(lead_row.instagram_handle), ''),
        CASE WHEN resolved_channel = 'MESSENGER' THEN resolved_identifier END,
        ARRAY[lead_row.gptmaker_chat_id],
        lead_row.created_at,
        now()
      ) RETURNING id INTO pessoa_uuid;
    ELSE
      UPDATE public.pessoas
      SET nome = CASE WHEN nome = 'Contato' AND NULLIF(btrim(lead_row.contact_name), '') IS NOT NULL THEN btrim(lead_row.contact_name) ELSE nome END,
          email = COALESCE(NULLIF(email, ''), NULLIF(btrim(lead_row.contact_email), '')),
          telefone = COALESCE(NULLIF(telefone, ''), NULLIF(regexp_replace(COALESCE(lead_row.contact_phone, ''), '\D', '', 'g'), '')),
          whatsapp = COALESCE(NULLIF(whatsapp, ''), CASE WHEN resolved_channel = 'WHATSAPP' THEN resolved_identifier END),
          instagram_user_id = COALESCE(NULLIF(instagram_user_id, ''), CASE WHEN resolved_channel = 'INSTAGRAM' THEN resolved_identifier END),
          instagram_handle = COALESCE(NULLIF(instagram_handle, ''), NULLIF(btrim(lead_row.instagram_handle), '')),
          messenger_id = COALESCE(NULLIF(messenger_id, ''), CASE WHEN resolved_channel = 'MESSENGER' THEN resolved_identifier END),
          chat_ids = CASE WHEN lead_row.gptmaker_chat_id = ANY(chat_ids) THEN chat_ids ELSE array_append(chat_ids, lead_row.gptmaker_chat_id) END,
          updated_at = now()
      WHERE id = pessoa_uuid;
    END IF;

    UPDATE public.leads SET pessoa_id = pessoa_uuid WHERE id = lead_row.id;
    pessoa_uuid := NULL;
  END LOOP;
END $$;