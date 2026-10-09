# Architecture rules
- MCP request auditing is service-role-only and runs as background work so audit failures cannot change client responses.