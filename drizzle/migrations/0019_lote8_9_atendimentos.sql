-- Lote 8: human service hours
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS human_hours jsonb NOT NULL DEFAULT '{"days":[1,2,3,4,5],"start":"08:00","end":"18:00"}'::jsonb,
  ADD COLUMN IF NOT EXISTS human_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS human_urgent_bypass boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ponto_facultativo_util boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS atendimento_alerta_amarelo_min integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS atendimento_alerta_vermelho_min integer NOT NULL DEFAULT 60;

ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS release_at timestamptz,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz;
CREATE INDEX IF NOT EXISTS notification_logs_queue_idx ON public.notification_logs (release_at) WHERE status = 'QUEUED';

-- Lote 9: lead stages (editable per organization)
CREATE TABLE public.lead_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  cor text,
  tipo text NOT NULL DEFAULT 'aberta' CHECK (tipo IN ('aberta','ganho','perdido','cliente')),
  chave text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_stages TO authenticated;
GRANT ALL ON public.lead_stages TO service_role;
ALTER TABLE public.lead_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_stages read own org" ON public.lead_stages FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "lead_stages admin insert" ON public.lead_stages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "lead_stages admin update" ON public.lead_stages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.has_role(auth.uid(),'admin')))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "lead_stages admin delete" ON public.lead_stages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.has_role(auth.uid(),'admin')));

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.lead_stages(id) ON DELETE SET NULL;

-- Lote 9: atendimentos (human service requests from Flora)
CREATE TABLE public.atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  pessoa_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  empresa text,
  contato_nome text,
  canal text,
  chat_id text,
  whatsapp text,
  instagram text,
  tipo text NOT NULL DEFAULT 'transferencia' CHECK (tipo IN ('transferencia','matriz')),
  motivo text,
  resumo text,
  urgencia text NOT NULL DEFAULT 'media' CHECK (urgencia IN ('baixa','media','alta')),
  responsavel_id uuid,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_atendimento','resolvido','encerrado_sem_resposta')),
  aberto_em timestamptz NOT NULL DEFAULT now(),
  relogio_inicia_em timestamptz NOT NULL DEFAULT now(),
  recebido_fora_horario boolean NOT NULL DEFAULT false,
  cobrancas integer NOT NULL DEFAULT 0,
  ultima_cobranca_em timestamptz,
  assumido_em timestamptz,
  assumido_por uuid,
  resolvido_em timestamptz,
  resolvido_por uuid,
  resolucao text,
  resultado text CHECK (resultado IS NULL OR resultado IN ('virou_agendamento','virou_proposta','duvida_resolvida','perdido','outro')),
  alerta_nivel text NOT NULL DEFAULT 'verde' CHECK (alerta_nivel IN ('verde','amarelo','vermelho')),
  humano_ativo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX atendimentos_one_open_per_lead ON public.atendimentos (lead_id) WHERE status IN ('aberto','em_atendimento') AND lead_id IS NOT NULL;
CREATE INDEX atendimentos_org_status_idx ON public.atendimentos (organization_id, status, aberto_em DESC);
GRANT SELECT, INSERT, UPDATE ON public.atendimentos TO authenticated;
GRANT ALL ON public.atendimentos TO service_role;
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atendimentos read" ON public.atendimentos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid())
    AND (public.is_privileged_user(auth.uid()) OR responsavel_id = auth.uid() OR assumido_por = auth.uid())));
CREATE POLICY "atendimentos insert privileged" ON public.atendimentos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_privileged_user(auth.uid())));
CREATE POLICY "atendimentos update" ON public.atendimentos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (organization_id = public.get_user_organization_id(auth.uid())
    AND (public.is_privileged_user(auth.uid()) OR responsavel_id = auth.uid() OR assumido_por = auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR organization_id = public.get_user_organization_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_atendimento()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
       OR NEW.aberto_em IS DISTINCT FROM OLD.aberto_em THEN
      RAISE EXCEPTION 'Campos de origem do atendimento não podem ser alterados';
    END IF;
  END IF;
  IF NEW.status = 'em_atendimento' AND NEW.assumido_em IS NULL THEN
    NEW.assumido_em := now(); NEW.assumido_por := COALESCE(NEW.assumido_por, auth.uid());
  END IF;
  IF NEW.status IN ('resolvido','encerrado_sem_resposta') THEN
    IF NEW.status = 'resolvido' AND (NEW.resolucao IS NULL OR length(btrim(NEW.resolucao)) < 3 OR NEW.resultado IS NULL) THEN
      RAISE EXCEPTION 'Informe a resolução e o resultado para resolver o atendimento';
    END IF;
    IF NEW.resolvido_em IS NULL THEN NEW.resolvido_em := now(); END IF;
    IF NEW.resolvido_por IS NULL THEN NEW.resolvido_por := auth.uid(); END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER validate_atendimento BEFORE INSERT OR UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.validate_atendimento();