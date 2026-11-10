# demo-cenario rules
- The demo scenario writes only through the real tables and registers every created id in demo_registros; children are derived by lead/client/schedule inside demo_conjunto (organization-scoped), so apagar_cenario_demo removes the marked set and its descendants and nothing else.
- A failed creation is rolled back by calling the same deletion, so a half scenario never stays behind; occurrence/proposal numbers are given back only when nothing real was numbered after the demo block.
- Every WhatsApp/e-mail sender filters demo ids (demoEnvolvido for single alerts, idsDemo + semDemo for batch jobs; mcp calls the demo_envolvido RPC inline), while screens, indicators and Flora Equipe read demo rows like real ones.
