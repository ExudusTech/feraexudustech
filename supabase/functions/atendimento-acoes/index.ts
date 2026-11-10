// Actions on an atendimento from the Fera: assumir, resolver, encerrar, devolver (to Flora), enviar (message), historico.
// The atendimento is always read with the caller's own access rules first, so nobody acts on records they cannot see.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { demoEnvolvido } from "../_shared/demo-guard.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["assumir", "resolver", "encerrar", "devolver", "enviar", "historico"] as const;
const RESULTADOS = ["virou_agendamento", "virou_proposta", "duvida_resolvida", "perdido", "outro"];
const RESULT_LABEL: Record<string, string> = { virou_agendamento: "virou agendamento", virou_proposta: "virou proposta",
  duvida_resolvida: "dúvida resolvida", perdido: "perdido", outro: "outro" };
const GPTMAKER = "https://api.gptmaker.ai/v2/chat";

async function gptmaker(path: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const token = Deno.env.get("GPTMAKER_API_TOKEN");
  if (!token) return { ok: false, status: 0, data: null };
  try {
    const res = await fetch(`${GPTMAKER}/${path}`, { method, signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const data = res.ok ? await res.json().catch(() => null) : (await res.body?.cancel(), null);
    return { ok: res.ok, status: res.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}

/** Keeps only display fields of the provider's message list; nothing is stored. */
function mapMessages(raw: unknown): Array<{ autor: string; texto: string; quando: string | null }> {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.data) ? (raw as any).data
    : Array.isArray((raw as any)?.messages) ? (raw as any).messages : [];
  return list.slice(-60).map((m: any) => {
    const role = String(m.role ?? m.from ?? m.sender ?? m.type ?? "").toLowerCase();
    const autor = m.fromMe === true || role.includes("assistant") || role.includes("agent") || role.includes("bot") ? "Flora"
      : role.includes("human") || role.includes("attendant") || role.includes("user_agent") ? "Equipe" : "Cliente";
    const texto = String(m.text ?? m.message ?? m.content ?? m.body ?? "").slice(0, 2000);
    const t = m.time ?? m.createdAt ?? m.created_at ?? m.timestamp ?? null;
    const quando = typeof t === "number" ? new Date(t > 1e12 ? t : t * 1000).toISOString() : typeof t === "string" ? t : null;
    return { autor, texto, quando };
  }).filter((m: { texto: string }) => m.texto);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Não autorizado" }, 401);

  let body: { id?: string; action?: string; resolucao?: string; resultado?: string; mensagem?: string; mover_perdido?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Requisição inválida" }, 400); }
  if (!UUID.test(body.id ?? "") || !ACTIONS.includes(body.action as typeof ACTIONS[number])) return json({ error: "Requisição inválida" }, 400);

  const { data: at } = await caller.from("atendimentos").select("id, organization_id, lead_id, pessoa_id, chat_id, canal, status, humano_ativo")
    .eq("id", body.id!).maybeSingle();
  if (!at) return json({ error: "Atendimento não encontrado" }, 404);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await admin.from("profiles").select("name").eq("user_id", user.id).maybeSingle();
  const who = (me?.name as string | undefined)?.split(" ")[0] ?? "Equipe";
  const timeline = async (resumo: string) => {
    if (!at.lead_id) return;
    const { error } = await admin.from("lead_timeline").insert({ organization_id: at.organization_id, lead_id: at.lead_id, pessoa_id: at.pessoa_id,
      canal: at.canal, chat_id: at.chat_id, tipo: "atendimento", origem: "fera", resumo: resumo.slice(0, 500), referencia_id: at.id });
    if (error) console.error("[atendimento-acoes] timeline", error.code);
  };
  const open = at.status === "aberto" || at.status === "em_atendimento";
  // Demo scenario: the atendimento works in the Fera, but nothing ever reaches GPT Maker/WhatsApp.
  const demo = await demoEnvolvido(admin, [at.id, at.lead_id]);
  if (demo && body.action === "enviar") return json({ error: "Atendimento de demonstração: nenhuma mensagem é enviada ao WhatsApp" }, 400);
  const chat = !demo && typeof at.chat_id === "string" && at.chat_id ? encodeURIComponent(at.chat_id) : null;

  switch (body.action) {
    case "historico": {
      if (!chat) return json({ mensagens: [], disponivel: false });
      const r = await gptmaker(`${chat}/messages`, "GET");
      return json({ mensagens: r.ok ? mapMessages(r.data) : [], disponivel: r.ok });
    }
    case "assumir": {
      if (!open) return json({ error: "Este atendimento já foi finalizado" }, 409);
      const { error } = await caller.from("atendimentos").update({ status: "em_atendimento", assumido_por: user.id, assumido_em: new Date().toISOString(),
        responsavel_id: user.id }).eq("id", at.id);
      if (error) { console.error("[atendimento-acoes] assumir", error.code); return json({ error: "Não foi possível assumir" }, 400); }
      const r = chat ? await gptmaker(`${chat}/start-human`, "PUT") : { ok: false };
      if (r.ok) await admin.from("atendimentos").update({ humano_ativo: true }).eq("id", at.id);
      await timeline(`Atendimento assumido por ${who}${r.ok ? "; Flora pausada neste chat" : ""}`);
      return json({ ok: true, flora_pausada: r.ok });
    }
    case "devolver": {
      const r = chat ? await gptmaker(`${chat}/stop-human`, "PUT") : { ok: false };
      if (!r.ok) return json({ error: "Não foi possível devolver para a Flora agora" }, 502);
      await admin.from("atendimentos").update({ humano_ativo: false }).eq("id", at.id);
      await timeline(`${who} devolveu a conversa para a Flora`);
      return json({ ok: true });
    }
    case "enviar": {
      const mensagem = (body.mensagem ?? "").trim();
      if (!mensagem || mensagem.length > 2000) return json({ error: "Escreva uma mensagem de até 2000 caracteres" }, 400);
      if (!chat) return json({ error: "Este atendimento não tem conversa ligada" }, 400);
      if (!open) return json({ error: "Este atendimento já foi finalizado" }, 409);
      if (!at.humano_ativo) {
        const h = await gptmaker(`${chat}/start-human`, "PUT");
        if (h.ok) await admin.from("atendimentos").update({ humano_ativo: true }).eq("id", at.id);
      }
      if (at.status === "aberto") await caller.from("atendimentos").update({ status: "em_atendimento", assumido_por: user.id }).eq("id", at.id);
      const r = await gptmaker(`${chat}/send-message`, "POST", { message: mensagem });
      if (!r.ok) return json({ error: "A mensagem não foi enviada. Tente de novo ou responda pelo WhatsApp." }, 502);
      await timeline(`${who} respondeu pelo Fera`);
      return json({ ok: true });
    }
    case "resolver":
    case "encerrar": {
      if (!open) return json({ error: "Este atendimento já foi finalizado" }, 409);
      const resolucao = (body.resolucao ?? "").trim();
      const resultado = body.resultado ?? "";
      if (body.action === "resolver" && (resolucao.length < 3 || resolucao.length > 500 || !RESULTADOS.includes(resultado))) {
        return json({ error: "Informe o resultado e uma resolução curta" }, 400);
      }
      const { error } = await caller.from("atendimentos").update(body.action === "resolver"
        ? { status: "resolvido", resolucao, resultado, resolvido_por: user.id }
        : { status: "encerrado_sem_resposta", resolucao: resolucao || null, resolvido_por: user.id }).eq("id", at.id);
      if (error) { console.error("[atendimento-acoes] resolver", error.code); return json({ error: "Não foi possível finalizar" }, 400); }
      if (at.humano_ativo && chat) {
        const r = await gptmaker(`${chat}/stop-human`, "PUT");
        if (r.ok) await admin.from("atendimentos").update({ humano_ativo: false }).eq("id", at.id);
      }
      if (at.lead_id) {
        const { count } = await admin.from("atendimentos").select("id", { count: "exact", head: true })
          .eq("lead_id", at.lead_id).in("status", ["aberto", "em_atendimento"]);
        if (!count) await admin.from("leads").update({ precisa_humano: false }).eq("id", at.lead_id).eq("organization_id", at.organization_id);
        if (body.action === "resolver" && resultado === "perdido" && body.mover_perdido === true) {
          const { data: stage } = await admin.from("lead_stages").select("id").eq("organization_id", at.organization_id).eq("chave", "perdido").maybeSingle();
          // Moved with the caller's own permissions so lead ownership rules still apply.
          await caller.from("leads").update({ stage: "fechado_perdido", ...(stage ? { stage_id: stage.id } : {}) }).eq("id", at.lead_id);
        }
      }
      await timeline(body.action === "resolver"
        ? `Atendimento resolvido por ${who} (${RESULT_LABEL[resultado]}): ${resolucao}`
        : `Atendimento encerrado sem resposta por ${who}${resolucao ? `: ${resolucao}` : ""}`);
      return json({ ok: true });
    }
  }
  return json({ error: "Requisição inválida" }, 400);
});
