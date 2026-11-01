CREATE TABLE public.lead_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  pessoa_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  canal text,
  chat_id text,
  tipo text NOT NULL CHECK (tipo IN ('resumo','criar_lead','agendamento','transferencia','fora_perfil','encerramento')),
  resumo text NOT NULL CHECK (char_length(resumo) BETWEEN 1 AND 500),
  proximo_passo text CHECK (proximo_passo IS NULL OR char_length(proximo_passo) <= 200),
  origem text NOT NULL DEFAULT 'flora' CHECK (origem IN ('flora','fera')),
  referencia_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_timeline_pessoa_idx ON public.lead_timeline (organization_id, pessoa_id, created_at DESC);
CREATE INDEX lead_timeline_lead_idx ON public.lead_timeline (lead_id, created_at DESC);
GRANT SELECT ON public.lead_timeline TO authenticated;
GRANT ALL ON public.lead_timeline TO service_role;
ALTER TABLE public.lead_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Timeline visible with its lead" ON public.lead_timeline FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'super_admin') OR organization_id = public.get_user_organization_id(auth.uid()))
  AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_timeline.lead_id)
);