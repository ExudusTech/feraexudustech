ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS rota_base jsonb;
COMMENT ON COLUMN public.organizations.rota_base IS 'Ponto de saída das rotas: {"nome": text, "latitude": number, "longitude": number}. Null = padrão do app (Base Cabo Frio).';

CREATE OR REPLACE FUNCTION public.definir_rota_base(_nome text, _latitude double precision, _longitude double precision)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_user_organization_id(auth.uid());
  _valor jsonb;
BEGIN
  IF auth.uid() IS NULL OR _org IS NULL OR NOT public.is_privileged_user(auth.uid()) THEN
    RAISE EXCEPTION 'Somente a gestão pode alterar o ponto de saída' USING ERRCODE = '42501';
  END IF;
  IF _latitude IS NULL OR _longitude IS NULL OR _latitude NOT BETWEEN -90 AND 90 OR _longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas' USING ERRCODE = '22023';
  END IF;
  _valor := jsonb_build_object('nome', left(coalesce(nullif(btrim(_nome), ''), 'Base'), 80), 'latitude', _latitude, 'longitude', _longitude);
  UPDATE public.organizations SET rota_base = _valor WHERE id = _org;
  RETURN _valor;
END;
$$;

REVOKE ALL ON FUNCTION public.definir_rota_base(text, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_rota_base(text, double precision, double precision) TO authenticated;