# Deploy MCP Server v3.0.0 (21 tools)

## Goal
Replace the current `supabase/functions/mcp/index.ts` with the uploaded v3.0.0 implementation (1939 lines, 21 tools) and deploy it to Supabase Edge Functions.

## Current state
- Existing file: `supabase/functions/mcp/index.ts` (774 lines, same v3.0.0 changelog header but shorter).
- Replacement file: uploaded `pasted-2026-08-21T21-51-51-572Z.txt` (1939 lines).
- `supabase/config.toml` already has `[functions.mcp] verify_jwt = false`.

## Steps
1. Overwrite `supabase/functions/mcp/index.ts` with the full content of the uploaded file.
2. Deploy the `mcp` Edge Function via `supabase--deploy_edge_functions`.
3. Verify the deployment succeeded and report the final state.

## Out of scope
- No frontend changes.
- No database migrations.
- No secret changes (MCP_BEARER_TOKEN, GPTMAKER_API_TOKEN etc. remain as-is).
