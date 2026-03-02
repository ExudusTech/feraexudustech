
-- Add em_teste to the lead_stage enum
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'em_teste' AFTER 'qualificacao';

-- Add category column to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS category text;

-- Create index for filtering by category
CREATE INDEX IF NOT EXISTS idx_leads_category ON public.leads (category);
