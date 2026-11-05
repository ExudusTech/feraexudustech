// Looks up a CNPJ at BrasilAPI for signed-in users (only the CNPJ is sent). In-memory cache for 24h per instance.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cnpjDigits, cnpjValido, situacaoBloqueia } from "../_shared/prontidao.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const cache = new Map<string, { at: number; data: Record<string, unknown> }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Não autorizado" }, 401);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Não autorizado" }, 401);
  let body: { cnpj?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Requisição inválida" }, 400); }
  const cnpj = cnpjDigits(typeof body.cnpj === "string" ? body.cnpj : "");
  if (!cnpjValido(cnpj)) return json({ error: "CNPJ inválido (confira os dígitos)", valido: false }, 400);
  const hit = cache.get(cnpj);
  if (hit && Date.now() - hit.at < 86_400_000) return json(hit.data);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(8000) });
    if (res.status === 404) { await res.body?.cancel(); return json({ valido: true, encontrado: false, error: "CNPJ não encontrado na Receita" }, 404); }
    if (!res.ok) { await res.body?.cancel(); return json({ valido: true, indisponivel: true }); }
    const r = await res.json();
    const situacao = String(r.descricao_situacao_cadastral ?? "").toUpperCase() || null;
    const data = {
      valido: true, encontrado: true, cnpj, razao_social: r.razao_social ?? null, nome_fantasia: r.nome_fantasia || null, situacao,
      bloqueado: situacaoBloqueia(situacao),
      endereco: [r.descricao_tipo_de_logradouro, r.logradouro].filter(Boolean).join(" ") + (r.numero ? `, ${r.numero}` : "") + (r.complemento ? ` ${r.complemento}` : "") + (r.bairro ? ` - ${r.bairro}` : ""),
      cidade: r.municipio ?? null, uf: r.uf ?? null, cep: r.cep ? String(r.cep).replace(/\D/g, "") : null,
    };
    cache.set(cnpj, { at: Date.now(), data });
    return json(data);
  } catch {
    console.error("[cnpj-consulta] provider unavailable");
    return json({ valido: true, indisponivel: true });
  }
});
