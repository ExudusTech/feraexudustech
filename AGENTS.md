# Architecture rules
- MCP request auditing is service-role-only and runs as background work so audit failures cannot change client responses.
- Normalize MCP tool parameters centrally inside the router, leaving the received request untouched so auditing retains original input.
- Resolve visit products with tenant-scoped lead reads and validate technical visit windows before operational writes so rejected bookings have no side effects.