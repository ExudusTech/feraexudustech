-- Demo count also reports the funnel/proposal history; rows are removed with their lead/proposal (ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION public.demo_contagem(_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE j jsonb; S uuid[]; L uuid[]; T uuid[]; A uuid[]; C uuid[]; PR uuid[];
BEGIN
  j := public.demo_conjunto(_org);
  S := ARRAY(SELECT jsonb_array_elements_text(j->'schedules')::uuid); L := ARRAY(SELECT jsonb_array_elements_text(j->'leads')::uuid);
  T := ARRAY(SELECT jsonb_array_elements_text(j->'tarefas')::uuid); A := ARRAY(SELECT jsonb_array_elements_text(j->'atendimentos')::uuid);
  C := ARRAY(SELECT jsonb_array_elements_text(j->'clients')::uuid); PR := ARRAY(SELECT jsonb_array_elements_text(j->'proposals')::uuid);
  RETURN jsonb_build_object(
    'leads', jsonb_array_length(j->'leads'), 'clientes', jsonb_array_length(j->'clients'), 'pessoas', jsonb_array_length(j->'pessoas'),
    'visitas', jsonb_array_length(j->'schedules'), 'propostas', jsonb_array_length(j->'proposals'), 'aparelhos_pontos', jsonb_array_length(j->'comodatos'),
    'tarefas_faturamento', jsonb_array_length(j->'tarefas'), 'atendimentos', jsonb_array_length(j->'atendimentos'), 'ordens_servico', jsonb_array_length(j->'ordens'),
    'evidencias', (SELECT count(*) FROM public.schedule_evidencias WHERE schedule_id = ANY(S)),
    'historico', (SELECT count(*) FROM public.lead_timeline WHERE lead_id = ANY(L) OR referencia_id = ANY(S)),
    'historico_etapas', (SELECT count(*) FROM public.lead_stage_history WHERE organization_id = _org AND lead_id = ANY(L)),
    'historico_propostas', (SELECT count(*) FROM public.proposal_status_history WHERE organization_id = _org AND proposal_id = ANY(PR)),
    'notificacoes', (SELECT count(*) FROM public.notification_logs n WHERE n.organization_id = _org AND (
      (n.payload->>'schedule_id') = ANY(S::text[]) OR (n.payload->>'lead_id') = ANY(L::text[]) OR (n.payload->>'tarefa_id') = ANY(T::text[])
      OR (n.payload->>'atendimento_id') = ANY(A::text[]) OR (n.payload->>'client_id') = ANY(C::text[]))),
    'arquivos', (SELECT count(*) FROM public.demo_registros WHERE organization_id = _org AND storage_path IS NOT NULL));
END $function$;
