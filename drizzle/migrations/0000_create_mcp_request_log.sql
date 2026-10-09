CREATE TABLE public.mcp_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  method text,
  params jsonb,
  success boolean,
  error_code integer,
  error_message text,
  response jsonb,
  duration_ms integer
);
GRANT ALL ON TABLE public.mcp_request_log TO service_role;
REVOKE ALL ON TABLE public.mcp_request_log FROM anon, authenticated;
ALTER TABLE public.mcp_request_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX mcp_request_log_created_at_desc_idx ON public.mcp_request_log (created_at DESC);