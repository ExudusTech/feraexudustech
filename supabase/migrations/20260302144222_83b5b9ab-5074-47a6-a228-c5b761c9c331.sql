-- Adicionar novos valores ao enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultor_tecnico';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operacional';