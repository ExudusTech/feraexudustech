ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS porte_indicio text NOT NULL DEFAULT 'a_confirmar'
    CHECK (porte_indicio IN ('bom_porte', 'a_confirmar', 'pequeno')),
  ADD COLUMN IF NOT EXISTS uso_produto text
    CHECK (uso_produto IS NULL OR uso_produto IN ('uso_proprio', 'revenda')),
  ADD COLUMN IF NOT EXISTS porte_obs text;