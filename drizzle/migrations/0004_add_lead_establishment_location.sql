ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS maps_url text,
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS regiao text;
COMMENT ON COLUMN public.leads.zip_code IS 'CEP do lead; preenchido também pelo parâmetro cep da ferramenta MCP criar_lead.';