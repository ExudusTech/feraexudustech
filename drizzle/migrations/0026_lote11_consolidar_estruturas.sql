ALTER TABLE public.schedule_evidencias
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS precisa_substituir boolean NOT NULL DEFAULT false;
ALTER TABLE public.schedule_evidencias ADD CONSTRAINT schedule_evidencias_estado_chk CHECK (estado IS NULL OR estado IN ('verde','amarelo','vermelho'));
CREATE UNIQUE INDEX IF NOT EXISTS schedule_evidencias_avaliacao_uniq ON public.schedule_evidencias(comodato_id, schedule_id) WHERE estado IS NOT NULL;

ALTER TABLE public.maintenance_schedule DROP CONSTRAINT IF EXISTS maintenance_schedule_tipo_os_check;
ALTER TABLE public.maintenance_schedule ADD CONSTRAINT maintenance_schedule_tipo_os_check
  CHECK (tipo_os = ANY (ARRAY['instalacao','teste','manutencao','retirada','substituicao']));
ALTER TABLE public.maintenance_schedule
  ADD COLUMN IF NOT EXISTS item_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_descricao text,
  ADD COLUMN IF NOT EXISTS quantidade text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem_evidencia_id uuid REFERENCES public.schedule_evidencias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolvida_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_status text,
  ADD COLUMN IF NOT EXISTS decidido_por uuid,
  ADD COLUMN IF NOT EXISTS decidido_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_recusa text,
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_schedule ADD CONSTRAINT maintenance_schedule_aprovacao_chk CHECK (aprovacao_status IS NULL OR aprovacao_status IN ('pendente','aprovado','recusado'));
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_schedule_origem_uniq ON public.maintenance_schedule(origem_evidencia_id) WHERE origem_evidencia_id IS NOT NULL;

COMMENT ON TABLE public.ponto_avaliacoes IS 'DEPRECATED: point evaluations live in schedule_evidencias (estado, precisa_substituir)';
COMMENT ON TABLE public.ocorrencias_ponto IS 'DEPRECATED: replacement tasks are maintenance_schedule rows with tipo_os = substituicao';
COMMENT ON TABLE public.pedidos_visita_emergencial IS 'DEPRECATED: emergency requests are urgent maintenance_schedule rows (aprovacao_status)';
COMMENT ON TABLE public.client_visits IS 'DEPRECATED: client visits are schedules';
COMMENT ON TABLE public.ekkoa_clients IS 'DEPRECATED: replaced by clients';
COMMENT ON TABLE public.ekkoa_equipment IS 'DEPRECATED: replaced by inventory_items';
COMMENT ON TABLE public.ekkoa_installation_equipment IS 'DEPRECATED: replaced by comodatos';
COMMENT ON TABLE public.ekkoa_installations IS 'DEPRECATED: replaced by comodatos';