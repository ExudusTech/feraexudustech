-- Legacy lead.stage <-> configurable lead_stages mapping, kept in one place so the old column stays in sync.
CREATE OR REPLACE FUNCTION public.lead_stage_chave_for_legacy(_stage text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE _stage WHEN 'novo' THEN 'novo' WHEN 'qualificacao' THEN 'qualificado' WHEN 'proposta' THEN 'proposta_enviada'
    WHEN 'negociacao' THEN 'proposta_enviada' WHEN 'em_teste' THEN 'teste_amostra' WHEN 'feedback' THEN 'teste_amostra'
    WHEN 'fechado_ganho' THEN 'ganho' WHEN 'instalacao_definitiva' THEN 'ganho' WHEN 'cadastramento' THEN 'ganho'
    WHEN 'fechado_perdido' THEN 'perdido' ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.legacy_stage_for(_chave text, _tipo text)
RETURNS public.lead_stage LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT (CASE
    WHEN _chave = 'novo' THEN 'novo'
    WHEN _chave = 'proposta_enviada' THEN 'proposta'
    WHEN _chave = 'teste_amostra' THEN 'em_teste'
    WHEN _tipo IN ('ganho','cliente') THEN 'fechado_ganho'
    WHEN _tipo = 'perdido' THEN 'fechado_perdido'
    ELSE 'qualificacao' END)::public.lead_stage
$$;

CREATE OR REPLACE FUNCTION public.sync_lead_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE st record;
BEGIN
  IF NEW.stage_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
    SELECT chave, tipo INTO st FROM public.lead_stages WHERE id = NEW.stage_id AND organization_id = NEW.organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Etapa inválida para esta organização'; END IF;
    NEW.stage := public.legacy_stage_for(st.chave, st.tipo);
  ELSIF NEW.stage IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage) THEN
    SELECT id INTO NEW.stage_id FROM public.lead_stages
      WHERE organization_id = NEW.organization_id AND chave = public.lead_stage_chave_for_legacy(NEW.stage::text)
      ORDER BY ativo DESC, ordem LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_lead_stage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_lead_stage ON public.leads;
CREATE TRIGGER trg_sync_lead_stage BEFORE INSERT OR UPDATE OF stage, stage_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_stage();