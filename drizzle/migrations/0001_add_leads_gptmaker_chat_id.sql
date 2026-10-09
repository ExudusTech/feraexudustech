ALTER TABLE public.leads ADD COLUMN gptmaker_chat_id text;
CREATE INDEX leads_org_gptmaker_chat_created_idx ON public.leads (organization_id, gptmaker_chat_id, created_at DESC) WHERE gptmaker_chat_id IS NOT NULL;
COMMENT ON COLUMN public.leads.gptmaker_chat_id IS 'GPT Maker chat identifier for same-chat replies and tenant-scoped 24-hour lead reuse';