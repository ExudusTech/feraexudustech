// Public QR landing (/q/<numero>, not signed in): returns only a wa.me link to the organization's Flora WhatsApp with the message of the
// QR campaign in force (Configurações → Campanhas do QR) plus a discreet "ref Q…" code. Never the label number or other internal data.
// Establishment/segment/product variables are filled only for an active device and within a per-IP hourly limit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LIMITE_CONSULTAS_HORA, parseEtiqueta, waLink, waNumero, WHATSAPP_PADRAO } from "../_shared/etiquetas.ts";
import { qrMensagem, qrRef, qrRenderizar, QR_TEXTO_RESERVA } from "../_shared/qr.ts";
import { NITSCLEAN_ORG_ID } from "../_shared/demo-cenario.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${Deno.env.get("SUPABASE_URL") ?? ""}|${ip}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data))).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let raw: unknown = new URL(req.url).searchParams.get("n");
  if (!raw && req.method === "POST") { try { raw = (await req.json())?.numero; } catch { raw = null; } }
  const n = parseEtiqueta(raw);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "desconhecido";
    const ipHash = await hashIp(ip);
    const desde = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin.from("etiqueta_acessos").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", desde);
    await admin.from("etiqueta_acessos").insert({ ip_hash: ipHash, numero: n });
    if (Math.random() < 0.02) await admin.from("etiqueta_acessos").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
    const limitado = (count ?? 0) >= LIMITE_CONSULTAS_HORA;

    // Organization: the one whose generated range contains the number (and has the device), else the device's, else the default tenant.
    const { data: faixas } = n ? await admin.from("etiqueta_faixas").select("organization_id").lte("inicio", n).gte("fim", n) : { data: [] };
    const { data: aparelhos } = n ? await admin.from("comodatos").select("organization_id, status, client_id, lead_id, product_id").eq("etiqueta_numero", n).limit(5) : { data: [] };
    const orgsFaixa = new Set((faixas ?? []).map((f: any) => f.organization_id));
    const ap = (aparelhos ?? []).find((a: any) => orgsFaixa.has(a.organization_id)) ?? ((aparelhos ?? []).length === 1 ? aparelhos![0] : null);
    const org = ap?.organization_id ?? (orgsFaixa.size === 1 ? [...orgsFaixa][0] : NITSCLEAN_ORG_ID);
    const { data: o } = await admin.from("organizations").select("proposta_config").eq("id", org).maybeSingle();
    const fone = waNumero((o?.proposta_config as any)?.whatsapp) ?? waNumero(WHATSAPP_PADRAO)!;
    const ativo = !!ap && ["ATIVO", "EM_TESTE"].includes(String(ap.status).toUpperCase()) && !limitado;
    const vars: { estabelecimento?: string | null; segmento?: string | null; produto_do_aparelho?: string | null } = {};
    if (ativo && ap.client_id) {
      const { data: c } = await admin.from("clients").select("name, ramo_atuacao, levantamento").eq("id", ap.client_id).maybeSingle();
      vars.estabelecimento = c?.name ?? null; vars.segmento = (c?.levantamento as any)?.segmento ?? c?.ramo_atuacao ?? null;
    } else if (ativo && ap.lead_id) {
      const { data: l } = await admin.from("leads").select("empresa_nome, company, category").eq("id", ap.lead_id).maybeSingle();
      vars.estabelecimento = l?.empresa_nome ?? l?.company ?? null; vars.segmento = l?.category ?? null;
    }
    if (ativo && ap.product_id) vars.produto_do_aparelho = (await admin.from("products").select("name").eq("id", ap.product_id).maybeSingle()).data?.name ?? null;
    const { data: campanhas } = await admin.from("qr_campanhas").select("nome, texto, inicio, fim, dias_semana, hora_inicio, hora_fim, segmentos, prioridade, padrao, ativo")
      .eq("organization_id", org).eq("ativo", true).limit(100);
    const agora = new Date();
    const texto = n ? qrMensagem(campanhas ?? [], agora, vars, qrRef(n)).texto : qrRenderizar(QR_TEXTO_RESERVA, {}, agora);
    return json({ url: waLink(fone, texto) });
  } catch {
    console.error("[etiqueta-publica] erro");
    return json({ url: waLink(waNumero(WHATSAPP_PADRAO)!, qrRenderizar(QR_TEXTO_RESERVA, {}, new Date())) });
  }
});
