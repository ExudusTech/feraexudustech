# Architecture rules
- MCP request auditing is service-role-only and runs as background work so audit failures cannot change client responses.
- Normalize MCP tool parameters centrally inside the router, leaving the received request untouched so auditing retains original input.
- Resolve visit products with tenant-scoped lead reads and validate technical visit windows before operational writes so rejected bookings have no side effects.
- Apply trusted chat-channel enrichment centrally after parameter normalization without mutating received requests, so all tools agree while auditing retains original input.
- Scope chat-based lead reuse by organization and a rolling 24-hour creation window, so chats do not duplicate recent leads or cross tenant boundaries.
- Load shared and tenant holidays through one calendar helper before visit writes, and filter route candidates within the bounded lookahead so municipal exclusions stay city-specific; shared calendar edits require super-admin authority to prevent cross-tenant changes.
- Capture booking email with a tenant-scoped conditional update after successful schedule creation so existing contact email is never overwritten.