ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS localizacao_origem text,
  ADD COLUMN IF NOT EXISTS localizacao_confirmada_em timestamptz,
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS coverage_area_id uuid REFERENCES public.ekkoa_coverage_areas(id) ON DELETE SET NULL;

ALTER TABLE public.comodatos
  ADD COLUMN IF NOT EXISTS refil_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantidade text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS foto_path text,
  ADD COLUMN IF NOT EXISTS estado_atual text,
  ADD COLUMN IF NOT EXISTS ultima_avaliacao_em timestamptz,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

CREATE OR REPLACE FUNCTION public.can_see_client(_user uuid, _client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client
    AND (has_role(_user,'super_admin') OR (c.organization_id = get_user_organization_id(_user)
      AND (is_privileged_user(_user) OR is_operacional(_user) OR is_financeiro(_user) OR c.created_by = _user OR c.assigned_user_id = _user))))
$$;

CREATE TABLE public.planos_manutencao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  frequencia text NOT NULL DEFAULT 'quinzenal',
  intervalo_dias integer,
  dia_semana smallint,
  hora_inicio time NOT NULL DEFAULT '09:00',
  duracao_min integer NOT NULL DEFAULT 60,
  consultor_id uuid,
  data_inicio date NOT NULL DEFAULT current_date,
  horizonte_dias integer NOT NULL DEFAULT 30,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planos_freq_chk CHECK (frequencia IN ('semanal','quinzenal','mensal','personalizada')),
  CONSTRAINT planos_dia_chk CHECK (dia_semana IS NULL OR dia_semana BETWEEN 0 AND 6),
  CONSTRAINT planos_intervalo_chk CHECK (intervalo_dias IS NULL OR intervalo_dias BETWEEN 1 AND 180)
);
CREATE UNIQUE INDEX planos_um_ativo_por_cliente ON public.planos_manutencao(client_id) WHERE ativo;

CREATE TABLE public.ponto_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  comodato_id uuid NOT NULL REFERENCES public.comodatos(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  estado text NOT NULL,
  manutencoes text[] NOT NULL DEFAULT '{}',
  precisa_substituir boolean NOT NULL DEFAULT false,
  foto_path text,
  observacao text,
  autor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ponto_estado_chk CHECK (estado IN ('verde','amarelo','vermelho')),
  UNIQUE (comodato_id, schedule_id)
);

CREATE TABLE public.ocorrencias_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  comodato_id uuid REFERENCES public.comodatos(id) ON DELETE SET NULL,
  avaliacao_id uuid REFERENCES public.ponto_avaliacoes(id) ON DELETE SET NULL,
  item_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_descricao text,
  quantidade text NOT NULL DEFAULT '1',
  urgente boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'aberta',
  responsavel_id uuid,
  resolvida_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  resolvida_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocorr_status_chk CHECK (status IN ('aberta','separada','resolvida','cancelada'))
);

CREATE TABLE public.pedidos_visita_emergencial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ocorrencia_id uuid REFERENCES public.ocorrencias_ponto(id) ON DELETE SET NULL,
  motivo text,
  status text NOT NULL DEFAULT 'pendente',
  solicitado_por uuid,
  decidido_por uuid,
  decidido_em timestamptz,
  motivo_recusa text,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_status_chk CHECK (status IN ('pendente','aprovado','recusado'))
);

ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS plano_manutencao_id uuid REFERENCES public.planos_manutencao(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS schedules_plano_data_uniq ON public.schedules(plano_manutencao_id, scheduled_date) WHERE plano_manutencao_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.planos_manutencao TO authenticated;
GRANT SELECT ON public.ponto_avaliacoes, public.ocorrencias_ponto, public.pedidos_visita_emergencial TO authenticated;
GRANT ALL ON public.planos_manutencao, public.ponto_avaliacoes, public.ocorrencias_ponto, public.pedidos_visita_emergencial TO service_role;

ALTER TABLE public.planos_manutencao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ponto_avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_visita_emergencial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver planos dos clientes visiveis" ON public.planos_manutencao FOR SELECT TO authenticated USING (public.can_see_client(auth.uid(), client_id));
CREATE POLICY "Gestores criam planos" ON public.planos_manutencao FOR INSERT TO authenticated
  WITH CHECK ((organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid())) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Gestores editam planos" ON public.planos_manutencao FOR UPDATE TO authenticated
  USING ((organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid())) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Ver avaliacoes" ON public.ponto_avaliacoes FOR SELECT TO authenticated USING (public.can_see_schedule(auth.uid(), schedule_id));
CREATE POLICY "Ver ocorrencias" ON public.ocorrencias_ponto FOR SELECT TO authenticated USING (public.can_see_client(auth.uid(), client_id) OR responsavel_id = auth.uid());
CREATE POLICY "Ver pedidos emergenciais" ON public.pedidos_visita_emergencial FOR SELECT TO authenticated USING (public.can_see_client(auth.uid(), client_id) OR solicitado_por = auth.uid());

CREATE TRIGGER update_planos_manutencao_updated_at BEFORE UPDATE ON public.planos_manutencao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();