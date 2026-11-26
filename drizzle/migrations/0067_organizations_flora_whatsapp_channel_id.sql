ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS flora_whatsapp_channel_id TEXT NOT NULL DEFAULT '3DF9D839DDCF463A3A350ADF91C40B89';

COMMENT ON COLUMN public.organizations.flora_whatsapp_channel_id IS
  'Prefixo do canal WhatsApp da Flora no GPT Maker, usado para enviar confirmações de visita pelo WhatsApp quando o lead veio de outro canal e possui telefone.';