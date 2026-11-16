ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS matriz_cidades text[] NOT NULL DEFAULT ARRAY['Rio de Janeiro','Niterói','São Gonçalo','Duque de Caxias','Nova Iguaçu','São João de Meriti','Belford Roxo','Nilópolis','Mesquita','Queimados','Japeri','Seropédica','Paracambi','Itaguaí','Magé','Guapimirim','Itaboraí','Tanguá']::text[];

CREATE OR REPLACE FUNCTION public.definir_matriz_cidades(_cidades text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.get_user_organization_id(auth.uid());
  _lista text[];
BEGIN
  IF auth.uid() IS NULL OR _org IS NULL OR NOT public.is_privileged_user(auth.uid()) THEN
    RAISE EXCEPTION 'Somente a gestão pode alterar as cidades da Matriz' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT c ORDER BY c), ARRAY[]::text[]) INTO _lista
    FROM (SELECT left(btrim(x), 80) AS c FROM unnest(coalesce(_cidades, ARRAY[]::text[])) AS x) s
   WHERE c <> '';
  IF cardinality(_lista) > 200 THEN
    RAISE EXCEPTION 'Lista grande demais' USING ERRCODE = '22023';
  END IF;
  UPDATE public.organizations SET matriz_cidades = _lista WHERE id = _org;
  RETURN _lista;
END;
$$;

REVOKE ALL ON FUNCTION public.definir_matriz_cidades(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_matriz_cidades(text[]) TO authenticated;