-- Migration: allow_null_created_by_for_mcp
-- A coluna created_by é NOT NULL mas o MCP (Flora) não tem user Supabase
-- Tornamos nullable e adicionamos flag para registros criados via agente IA

ALTER TABLE leads ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by_flora BOOLEAN DEFAULT FALSE;

-- Mesma correção para outras tabelas que o MCP pode precisar inserir
ALTER TABLE schedules ALTER COLUMN created_by DROP NOT NULL;