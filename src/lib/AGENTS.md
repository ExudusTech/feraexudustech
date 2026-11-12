# src/lib rules
- Visit-type colors come only from src/lib/ocorrencia-cores.ts (CSS tokens --oc-*), and route stop order from src/lib/rota.ts; the departure point is organizations.rota_base, written only by the privileged definir_rota_base RPC, so every screen and tenant stays consistent.
