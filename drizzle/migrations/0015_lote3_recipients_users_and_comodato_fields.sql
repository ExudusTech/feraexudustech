ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'externo';
ALTER TABLE public.notification_recipients ADD CONSTRAINT notification_recipients_tipo_check CHECK (tipo IN ('usuario','externo'));
CREATE UNIQUE INDEX IF NOT EXISTS notification_recipients_org_user_uniq ON public.notification_recipients (organization_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_recipients_org_whatsapp_uniq ON public.notification_recipients (organization_id, whatsapp) WHERE user_id IS NULL;

CREATE OR REPLACE FUNCTION public.validate_notification_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    SELECT name, email, phone INTO p FROM public.profiles WHERE user_id = NEW.user_id AND organization_id = NEW.organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Destinatário deve ser um usuário da organização'; END IF;
    NEW.tipo := 'usuario'; NEW.whatsapp := NULL; NEW.nome := p.name; NEW.email := p.email;
    IF p.phone IS NOT NULL AND EXISTS (SELECT 1 FROM public.notification_recipients r WHERE r.organization_id = NEW.organization_id
        AND r.user_id IS NULL AND r.whatsapp = p.phone AND r.id <> NEW.id) THEN
      RAISE EXCEPTION 'Este WhatsApp já está cadastrado como destinatário';
    END IF;
  ELSE
    NEW.tipo := 'externo';
    IF NEW.whatsapp IS NULL OR NEW.whatsapp !~ '^[1-9][0-9]{9,14}$' OR (NEW.whatsapp LIKE '55%' AND length(NEW.whatsapp) NOT IN (12,13)) THEN
      RAISE EXCEPTION 'WhatsApp inválido';
    END IF;
    IF EXISTS (SELECT 1 FROM public.notification_recipients r JOIN public.profiles pr ON pr.user_id = r.user_id
        WHERE r.organization_id = NEW.organization_id AND pr.phone = NEW.whatsapp AND r.id <> NEW.id) THEN
      RAISE EXCEPTION 'Este WhatsApp já está cadastrado como destinatário';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER validate_notification_recipient BEFORE INSERT OR UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.validate_notification_recipient();
COMMENT ON COLUMN public.notification_recipients.user_id IS 'Linked org user; WhatsApp is read live from profiles.phone';

ALTER TABLE public.comodatos ADD COLUMN IF NOT EXISTS fabricante text;
ALTER TABLE public.maintenance_schedule
  ADD COLUMN IF NOT EXISTS fabricante text,
  ADD COLUMN IF NOT EXISTS tipo_os text NOT NULL DEFAULT 'manutencao',
  ADD COLUMN IF NOT EXISTS motivo_retirada text;
ALTER TABLE public.maintenance_schedule ADD CONSTRAINT maintenance_schedule_tipo_os_check CHECK (tipo_os IN ('instalacao','teste','manutencao','retirada'));

COMMENT ON TABLE public.ekkoa_installations IS 'DEPRECATED: replaced by comodatos';
COMMENT ON TABLE public.ekkoa_contracts IS 'DEPRECATED: replaced by comodatos';
COMMENT ON TABLE public.ekkoa_installation_equipment IS 'DEPRECATED: replaced by comodatos/inventory_items';
COMMENT ON TABLE public.ekkoa_equipment IS 'DEPRECATED: replaced by inventory_items';
COMMENT ON TABLE public.ekkoa_technical_visits IS 'DEPRECATED: replaced by schedules/maintenance_schedule';
COMMENT ON TABLE public.ekkoa_leads IS 'DEPRECATED: replaced by leads';
COMMENT ON TABLE public.ekkoa_clients IS 'DEPRECATED: replaced by clients';
COMMENT ON TABLE public.operations IS 'DEPRECATED: replaced by maintenance_schedule work orders';