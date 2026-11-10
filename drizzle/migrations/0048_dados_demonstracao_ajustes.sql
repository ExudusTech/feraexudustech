-- Demo set: derived children are always restricted to the demo organization; deletion order respects foreign keys.
CREATE OR REPLACE FUNCTION public.demo_conjunto(_org uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE reg uuid[]; orgs uuid[]; L uuid[]; C uuid[]; PS uuid[]; S uuid[]; PR uuid[]; M uuid[]; T uuid[]; A uuid[]; O uuid[]; ORD uuid[]; EC uuid[];
BEGIN
  SELECT coalesce(array_agg(registro_id), '{}'), coalesce(array_agg(DISTINCT organization_id), '{}') INTO reg, orgs
    FROM public.demo_registros WHERE registro_id IS NOT NULL AND (_org IS NULL OR organization_id = _org);
  IF cardinality(reg) = 0 THEN
    RETURN jsonb_build_object('leads','[]'::jsonb,'clients','[]'::jsonb,'pessoas','[]'::jsonb,'schedules','[]'::jsonb,'proposals','[]'::jsonb,'comodatos','[]'::jsonb,
      'tarefas','[]'::jsonb,'atendimentos','[]'::jsonb,'ordens','[]'::jsonb,'orders','[]'::jsonb,'contatos','[]'::jsonb);
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO L FROM public.leads WHERE organization_id = ANY(orgs) AND id = ANY(reg);
  SELECT coalesce(array_agg(id), '{}') INTO C FROM public.clients WHERE organization_id = ANY(orgs) AND (id = ANY(reg) OR lead_origem_id = ANY(L));
  SELECT coalesce(array_agg(id), '{}') INTO PS FROM public.pessoas WHERE organization_id = ANY(orgs) AND id = ANY(reg);
  SELECT coalesce(array_agg(id), '{}') INTO S FROM public.schedules WHERE organization_id = ANY(orgs) AND (id = ANY(reg) OR lead_id = ANY(L) OR client_id = ANY(C));
  SELECT coalesce(array_agg(id), '{}') INTO PR FROM public.proposals WHERE organization_id = ANY(orgs) AND (id = ANY(reg) OR lead_id = ANY(L) OR client_id = ANY(C) OR origem_schedule_id = ANY(S));
  SELECT coalesce(array_agg(id), '{}') INTO M FROM public.comodatos WHERE organization_id = ANY(orgs) AND (id = ANY(reg) OR lead_id = ANY(L) OR client_id = ANY(C) OR origem_schedule_id = ANY(S));
  SELECT coalesce(array_agg(id), '{}') INTO T FROM public.tarefas_faturamento WHERE organization_id = ANY(orgs) AND (id = ANY(reg) OR schedule_id = ANY(S) OR lead_id = ANY(L) OR client_id = ANY(C));
  SELECT coalesce(array_agg(id), '{}') INTO A FROM public.atendimentos WHERE organization_id = ANY(orgs) AND (id = ANY(reg) OR lead_id = ANY(L) OR pessoa_id = ANY(PS));
  SELECT coalesce(array_agg(id), '{}') INTO O FROM public.maintenance_schedule WHERE organization_id = ANY(orgs) AND (id = ANY(reg) OR client_id = ANY(C) OR schedule_id = ANY(S) OR comodato_id = ANY(M));
  SELECT coalesce(array_agg(id), '{}') INTO ORD FROM public.orders WHERE organization_id = ANY(orgs) AND (proposal_id = ANY(PR) OR client_id = ANY(C));
  SELECT coalesce(array_agg(id), '{}') INTO EC FROM public.empresa_contatos WHERE organization_id = ANY(orgs) AND (id = ANY(reg) OR lead_id = ANY(L) OR client_id = ANY(C) OR pessoa_id = ANY(PS));
  RETURN jsonb_build_object('leads', to_jsonb(L), 'clients', to_jsonb(C), 'pessoas', to_jsonb(PS), 'schedules', to_jsonb(S), 'proposals', to_jsonb(PR),
    'comodatos', to_jsonb(M), 'tarefas', to_jsonb(T), 'atendimentos', to_jsonb(A), 'ordens', to_jsonb(O), 'orders', to_jsonb(ORD), 'contatos', to_jsonb(EC));
END $$;

CREATE OR REPLACE FUNCTION public.apagar_cenario_demo(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb; cont jsonb; L uuid[]; C uuid[]; PS uuid[]; S uuid[]; PR uuid[]; M uuid[]; T uuid[]; A uuid[]; O uuid[]; ORD uuid[];
  arquivos jsonb; oc_min int; oc_max int; oc_n int; pr_min int; pr_max int; pr_n int; seq int;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'Organização obrigatória'; END IF;
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
  DELETE FROM public.flora_interactions WHERE organization_id = _org AND lead_id = ANY(L);
  DELETE FROM public.lead_timeline WHERE organization_id = _org AND (lead_id = ANY(L) OR referencia_id = ANY(S));
  DELETE FROM public.financial_transactions WHERE organization_id = _org AND (client_id = ANY(C) OR order_id = ANY(ORD));
  DELETE FROM public.orders WHERE id = ANY(ORD);
  DELETE FROM public.tarefas_faturamento WHERE id = ANY(T);
  DELETE FROM public.maintenance_schedule WHERE id = ANY(O);
  DELETE FROM public.pedidos_visita_emergencial WHERE organization_id = _org AND (client_id = ANY(C) OR schedule_id = ANY(S));
  DELETE FROM public.ocorrencias_ponto WHERE organization_id = _org AND (client_id = ANY(C) OR comodato_id = ANY(M));
  DELETE FROM public.ponto_avaliacoes WHERE organization_id = _org AND (schedule_id = ANY(S) OR comodato_id = ANY(M));
  DELETE FROM public.proposals WHERE id = ANY(PR);
  DELETE FROM public.comodatos WHERE id = ANY(M);
  DELETE FROM public.schedules WHERE id = ANY(S);
  DELETE FROM public.atendimentos WHERE id = ANY(A);
  DELETE FROM public.planos_manutencao WHERE organization_id = _org AND client_id = ANY(C);
  DELETE FROM public.empresa_contatos WHERE organization_id = _org AND (lead_id = ANY(L) OR client_id = ANY(C) OR pessoa_id = ANY(PS));
  DELETE FROM public.leads WHERE id = ANY(L);
  DELETE FROM public.client_visits WHERE organization_id = _org AND client_id = ANY(C);
  DELETE FROM public.operations WHERE organization_id = _org AND client_id = ANY(C);
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
REVOKE ALL ON FUNCTION public.apagar_cenario_demo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_conjunto(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apagar_cenario_demo(uuid) TO service_role;