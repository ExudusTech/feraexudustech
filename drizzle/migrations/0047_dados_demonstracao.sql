CREATE TABLE public.demo_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tabela text NOT NULL,
  registro_id uuid,
  storage_bucket text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_registros_alvo CHECK ((registro_id IS NOT NULL) OR (storage_bucket IS NOT NULL AND storage_path IS NOT NULL))
);
CREATE UNIQUE INDEX demo_registros_registro_uq ON public.demo_registros (tabela, registro_id) WHERE registro_id IS NOT NULL;
CREATE INDEX demo_registros_org_idx ON public.demo_registros (organization_id);
GRANT ALL ON public.demo_registros TO service_role;
ALTER TABLE public.demo_registros ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.demo_registros IS 'Technical demo marker: every record created by the demo scenario (Configurações → Dados de demonstração). Only service_role reads/writes.';

-- Every id that belongs to the demo scenario: registered rows plus anything created later from them (children by lead/client/schedule).
CREATE OR REPLACE FUNCTION public.demo_conjunto(_org uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE reg uuid[]; L uuid[]; C uuid[]; PS uuid[]; S uuid[]; PR uuid[]; M uuid[]; T uuid[]; A uuid[]; O uuid[]; ORD uuid[]; EC uuid[];
BEGIN
  SELECT coalesce(array_agg(registro_id), '{}') INTO reg FROM public.demo_registros WHERE registro_id IS NOT NULL AND (_org IS NULL OR organization_id = _org);
  IF cardinality(reg) = 0 THEN
    RETURN jsonb_build_object('leads','[]'::jsonb,'clients','[]'::jsonb,'pessoas','[]'::jsonb,'schedules','[]'::jsonb,'proposals','[]'::jsonb,'comodatos','[]'::jsonb,
      'tarefas','[]'::jsonb,'atendimentos','[]'::jsonb,'ordens','[]'::jsonb,'orders','[]'::jsonb,'contatos','[]'::jsonb);
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO L FROM public.leads WHERE id = ANY(reg);
  SELECT coalesce(array_agg(id), '{}') INTO C FROM public.clients WHERE id = ANY(reg) OR lead_origem_id = ANY(L);
  SELECT coalesce(array_agg(id), '{}') INTO PS FROM public.pessoas WHERE id = ANY(reg);
  SELECT coalesce(array_agg(id), '{}') INTO S FROM public.schedules WHERE id = ANY(reg) OR lead_id = ANY(L) OR client_id = ANY(C);
  SELECT coalesce(array_agg(id), '{}') INTO PR FROM public.proposals WHERE id = ANY(reg) OR lead_id = ANY(L) OR client_id = ANY(C) OR origem_schedule_id = ANY(S);
  SELECT coalesce(array_agg(id), '{}') INTO M FROM public.comodatos WHERE id = ANY(reg) OR lead_id = ANY(L) OR client_id = ANY(C) OR origem_schedule_id = ANY(S);
  SELECT coalesce(array_agg(id), '{}') INTO T FROM public.tarefas_faturamento WHERE id = ANY(reg) OR schedule_id = ANY(S) OR lead_id = ANY(L) OR client_id = ANY(C);
  SELECT coalesce(array_agg(id), '{}') INTO A FROM public.atendimentos WHERE id = ANY(reg) OR lead_id = ANY(L) OR pessoa_id = ANY(PS);
  SELECT coalesce(array_agg(id), '{}') INTO O FROM public.maintenance_schedule WHERE id = ANY(reg) OR client_id = ANY(C) OR schedule_id = ANY(S) OR comodato_id = ANY(M);
  SELECT coalesce(array_agg(id), '{}') INTO ORD FROM public.orders WHERE proposal_id = ANY(PR) OR client_id = ANY(C);
  SELECT coalesce(array_agg(id), '{}') INTO EC FROM public.empresa_contatos WHERE id = ANY(reg) OR lead_id = ANY(L) OR client_id = ANY(C) OR pessoa_id = ANY(PS);
  RETURN jsonb_build_object('leads', to_jsonb(L), 'clients', to_jsonb(C), 'pessoas', to_jsonb(PS), 'schedules', to_jsonb(S), 'proposals', to_jsonb(PR),
    'comodatos', to_jsonb(M), 'tarefas', to_jsonb(T), 'atendimentos', to_jsonb(A), 'ordens', to_jsonb(O), 'orders', to_jsonb(ORD), 'contatos', to_jsonb(EC));
END $$;

-- Notification guard: true when any given id is part of the demo scenario.
CREATE OR REPLACE FUNCTION public.demo_envolvido(_ids uuid[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb;
BEGIN
  IF _ids IS NULL OR cardinality(_ids) = 0 OR NOT EXISTS (SELECT 1 FROM public.demo_registros) THEN RETURN false; END IF;
  j := public.demo_conjunto(NULL);
  RETURN EXISTS (SELECT 1 FROM jsonb_each(j) e, jsonb_array_elements_text(e.value) v WHERE v.value::uuid = ANY(_ids));
END $$;

CREATE OR REPLACE FUNCTION public.demo_contagem(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb; S uuid[]; L uuid[]; T uuid[]; A uuid[]; C uuid[];
BEGIN
  j := public.demo_conjunto(_org);
  S := ARRAY(SELECT jsonb_array_elements_text(j->'schedules')::uuid); L := ARRAY(SELECT jsonb_array_elements_text(j->'leads')::uuid);
  T := ARRAY(SELECT jsonb_array_elements_text(j->'tarefas')::uuid); A := ARRAY(SELECT jsonb_array_elements_text(j->'atendimentos')::uuid);
  C := ARRAY(SELECT jsonb_array_elements_text(j->'clients')::uuid);
  RETURN jsonb_build_object(
    'leads', jsonb_array_length(j->'leads'), 'clientes', jsonb_array_length(j->'clients'), 'pessoas', jsonb_array_length(j->'pessoas'),
    'visitas', jsonb_array_length(j->'schedules'), 'propostas', jsonb_array_length(j->'proposals'), 'aparelhos_pontos', jsonb_array_length(j->'comodatos'),
    'tarefas_faturamento', jsonb_array_length(j->'tarefas'), 'atendimentos', jsonb_array_length(j->'atendimentos'), 'ordens_servico', jsonb_array_length(j->'ordens'),
    'evidencias', (SELECT count(*) FROM public.schedule_evidencias WHERE schedule_id = ANY(S)),
    'historico', (SELECT count(*) FROM public.lead_timeline WHERE lead_id = ANY(L) OR referencia_id = ANY(S)),
    'notificacoes', (SELECT count(*) FROM public.notification_logs n WHERE n.organization_id = _org AND (
      (n.payload->>'schedule_id') = ANY(S::text[]) OR (n.payload->>'lead_id') = ANY(L::text[]) OR (n.payload->>'tarefa_id') = ANY(T::text[])
      OR (n.payload->>'atendimento_id') = ANY(A::text[]) OR (n.payload->>'client_id') = ANY(C::text[]))),
    'arquivos', (SELECT count(*) FROM public.demo_registros WHERE organization_id = _org AND storage_path IS NOT NULL));
END $$;

-- Removes everything marked demo (and its children) and nothing else; returns counts and storage paths for the caller to remove.
CREATE OR REPLACE FUNCTION public.apagar_cenario_demo(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb; cont jsonb; L uuid[]; C uuid[]; PS uuid[]; S uuid[]; PR uuid[]; M uuid[]; T uuid[]; A uuid[]; O uuid[]; ORD uuid[];
  arquivos jsonb; oc_min int; oc_max int; oc_n int; pr_min int; pr_max int; pr_n int; seq int;
BEGIN
  j := public.demo_conjunto(_org);
  cont := public.demo_contagem(_org);
  L := ARRAY(SELECT jsonb_array_elements_text(j->'leads')::uuid); C := ARRAY(SELECT jsonb_array_elements_text(j->'clients')::uuid);
  PS := ARRAY(SELECT jsonb_array_elements_text(j->'pessoas')::uuid); S := ARRAY(SELECT jsonb_array_elements_text(j->'schedules')::uuid);
  PR := ARRAY(SELECT jsonb_array_elements_text(j->'proposals')::uuid); M := ARRAY(SELECT jsonb_array_elements_text(j->'comodatos')::uuid);
  T := ARRAY(SELECT jsonb_array_elements_text(j->'tarefas')::uuid); A := ARRAY(SELECT jsonb_array_elements_text(j->'atendimentos')::uuid);
  O := ARRAY(SELECT jsonb_array_elements_text(j->'ordens')::uuid); ORD := ARRAY(SELECT jsonb_array_elements_text(j->'orders')::uuid);

  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('bucket', x.b, 'path', x.p)), '[]'::jsonb) INTO arquivos FROM (
    SELECT 'visit-photos' b, foto_path p FROM public.schedule_evidencias WHERE schedule_id = ANY(S) AND foto_path IS NOT NULL
    UNION SELECT 'visit-audio', audio_path FROM public.schedule_evidencias WHERE schedule_id = ANY(S) AND audio_path IS NOT NULL
    UNION SELECT 'visit-photos', foto_path FROM public.ponto_avaliacoes WHERE (schedule_id = ANY(S) OR comodato_id = ANY(M)) AND foto_path IS NOT NULL
    UNION SELECT 'visit-photos', foto_path FROM public.comodatos WHERE id = ANY(M) AND foto_path IS NOT NULL
    UNION SELECT 'visit-photos', devolucao_assinatura_path FROM public.schedules WHERE id = ANY(S) AND devolucao_assinatura_path IS NOT NULL
    UNION SELECT 'notas-fiscais', pdf_path FROM public.tarefas_faturamento WHERE id = ANY(T) AND pdf_path IS NOT NULL
    UNION SELECT 'proposal-pdfs', pdf_path FROM public.proposals WHERE id = ANY(PR) AND pdf_path IS NOT NULL
    UNION SELECT storage_bucket, storage_path FROM public.demo_registros WHERE organization_id = _org AND storage_path IS NOT NULL) x;

  SELECT min(ocorrencia_numero), max(ocorrencia_numero), count(ocorrencia_numero) INTO oc_min, oc_max, oc_n FROM public.schedules WHERE id = ANY(S);
  SELECT min(numero), max(numero), count(numero) INTO pr_min, pr_max, pr_n FROM public.proposals WHERE id = ANY(PR);

  DELETE FROM public.notification_logs n WHERE n.organization_id = _org AND (
    (n.payload->>'schedule_id') = ANY(S::text[]) OR (n.payload->>'lead_id') = ANY(L::text[]) OR (n.payload->>'tarefa_id') = ANY(T::text[])
    OR (n.payload->>'atendimento_id') = ANY(A::text[]) OR (n.payload->>'client_id') = ANY(C::text[]));
  DELETE FROM public.flora_interactions WHERE lead_id = ANY(L);
  DELETE FROM public.lead_timeline WHERE lead_id = ANY(L) OR referencia_id = ANY(S);
  DELETE FROM public.orders WHERE id = ANY(ORD);
  DELETE FROM public.tarefas_faturamento WHERE id = ANY(T);
  DELETE FROM public.maintenance_schedule WHERE id = ANY(O);
  DELETE FROM public.pedidos_visita_emergencial WHERE client_id = ANY(C) OR schedule_id = ANY(S);
  DELETE FROM public.ocorrencias_ponto WHERE client_id = ANY(C) OR comodato_id = ANY(M);
  DELETE FROM public.ponto_avaliacoes WHERE schedule_id = ANY(S) OR comodato_id = ANY(M);
  DELETE FROM public.proposals WHERE id = ANY(PR);
  DELETE FROM public.comodatos WHERE id = ANY(M);
  DELETE FROM public.schedules WHERE id = ANY(S);
  DELETE FROM public.atendimentos WHERE id = ANY(A);
  DELETE FROM public.planos_manutencao WHERE client_id = ANY(C);
  DELETE FROM public.empresa_contatos WHERE lead_id = ANY(L) OR client_id = ANY(C) OR pessoa_id = ANY(PS);
  DELETE FROM public.leads WHERE id = ANY(L);
  DELETE FROM public.client_visits WHERE client_id = ANY(C);
  DELETE FROM public.financial_transactions WHERE client_id = ANY(C);
  DELETE FROM public.operations WHERE client_id = ANY(C);
  DELETE FROM public.clients WHERE id = ANY(C);
  DELETE FROM public.pessoas p WHERE p.id = ANY(PS)
    AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.pessoa_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.empresa_contatos e WHERE e.pessoa_id = p.id);
  DELETE FROM public.demo_registros WHERE organization_id = _org;

  -- Give back occurrence/proposal numbers only when the demo block is the last one issued (no real record numbered after it).
  SELECT ocorrencia_seq INTO seq FROM public.organizations WHERE id = _org;
  IF oc_n > 0 AND seq = oc_max AND oc_n = oc_max - oc_min + 1 THEN
    UPDATE public.organizations SET ocorrencia_seq = oc_min - 1 WHERE id = _org AND ocorrencia_seq = oc_max;
  END IF;
  SELECT proposta_seq INTO seq FROM public.organizations WHERE id = _org;
  IF pr_n > 0 AND seq = pr_max AND pr_n = pr_max - pr_min + 1 THEN
    UPDATE public.organizations SET proposta_seq = pr_min - 1 WHERE id = _org AND proposta_seq = pr_max;
  END IF;
  RETURN jsonb_build_object('apagado', cont, 'arquivos', arquivos);
END $$;

REVOKE ALL ON FUNCTION public.demo_conjunto(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_envolvido(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_contagem(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apagar_cenario_demo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_conjunto(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_envolvido(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_contagem(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apagar_cenario_demo(uuid) TO service_role;