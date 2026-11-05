// Lote 15: audio collection of an occurrence (schedule). Actions: concluir (transcribe + AI draft), salvar (seller edits),
// confirmar (apply: planned points, timeline, next visits), pendencias. The schedule is read with the caller's access first;
// the Flora path (mcp) calls with the service key plus the server-identified team user, never a user-supplied identity.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exigeColeta, limparRascunho, pendenciasColeta, RASCUNHO_JSON_SCHEMA, resumoColeta, semVazios, type RascunhoColeta } from "../_shared/coleta.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-acting-user" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const SELECT = "id, organization_id, title, status, assigned_to, created_by, lead_id, client_id, scheduled_date, start_time, ocorrencia_codigo, ocorrencia_tipo, coleta_status, coleta_rascunho, resumo_execucao, leads(pessoa_id, contact_name, empresa_nome, company), clients(name)";

class AiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function transcrever(key: string, audio: Blob, nome: string): Promise<string> {
  const form = new FormData();
  form.append("model", "openai/gpt-transcribe");
  form.append("file", new File([audio], nome, { type: audio.type?.startsWith("audio/") ? audio.type : "audio/webm" }));
  form.append("response_format", "json");
  form.append("languages", "pt");
  const r = await fetch(`${GATEWAY}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60000) });
  if (!r.ok) { const t = await r.text(); console.error("[coleta] transcribe", r.status); throw new AiError(r.status, t.slice(0, 200)); }
  const j = await r.json();
  return String(j.text ?? "").trim();
}

async function extrair(key: string, tipo: string, textos: string[], atual: RascunhoColeta | null): Promise<RascunhoColeta> {
  const r = await fetch(`${GATEWAY}/responses`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: "openai/gpt-6-astra", reasoning: { effort: "low" },
      instructions: "Você extrai dados de uma visita comercial B2B de produtos de higiene (papel, sabonete, aromatização, química) a partir de áudios transcritos do vendedor. " +
        "Preencha apenas o que foi dito; deixe vazio o que não foi dito, nunca invente. Quantidades como texto. Datas no formato AAAA-MM-DD (hoje é " +
        new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10) + "). Se houver rascunho atual, mantenha o que já existe e complete/corrija com as novas falas.",
      input: `Tipo de ocorrência: ${tipo}\nRascunho atual: ${JSON.stringify(atual ?? {})}\nFalas do vendedor:\n${textos.map((t, i) => `[${i + 1}] ${t}`).join("\n")}`,
      text: { format: { type: "json_schema", name: "rascunho_coleta", strict: true, schema: RASCUNHO_JSON_SCHEMA } },
    }),
  });
  if (!r.ok) { const t = await r.text(); console.error("[coleta] extract", r.status); throw new AiError(r.status, t.slice(0, 200)); }
  const j = await r.json();
  const out = j.output_text ?? (j.output ?? []).flatMap((o: any) => o.content ?? []).find((c: any) => c.type === "output_text")?.text;
  if (!out) throw new AiError(422, "A IA não devolveu o rascunho");
  return semVazios(JSON.parse(out));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json({ error: "Requisição inválida" }, 400); }
  if (!UUID.test(b.id ?? "") || !["concluir", "salvar", "confirmar", "pendencias"].includes(b.action)) return json({ error: "Requisição inválida" }, 400);

  // Identity: app user (JWT, caller-RLS read) or Flora path (service key + server-resolved user id).
  const interno = auth === `Bearer ${serviceKey}`;
  let userId: string; let s: any;
  if (interno) {
    const acting = req.headers.get("x-acting-user") ?? "";
    if (!UUID.test(acting)) return json({ error: "Não autorizado" }, 401);
    userId = acting;
    const { data } = await admin.from("schedules").select(SELECT).eq("id", b.id).maybeSingle();
    s = data;
  } else {
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);
    userId = user.id;
    const { data } = await caller.from("schedules").select(SELECT).eq("id", b.id).maybeSingle();
    s = data;
  }
  if (!s) return json({ error: "Ocorrência não encontrada" }, 404);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const privileged = (roles ?? []).some((r: any) => ["admin", "super_admin", "gestor"].includes(r.role));
  if (interno) {
    const { data: prof } = await admin.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
    if (prof?.organization_id !== s.organization_id) return json({ error: "Não autorizado" }, 403);
  }
  if (!privileged && s.assigned_to !== userId && !(s.assigned_to === null && s.created_by === userId)) return json({ error: "Só o responsável pode alterar esta ocorrência" }, 403);
  if (s.coleta_status === "confirmada" && b.action !== "pendencias") return json({ error: "Coleta já confirmada" }, 409);
  const tipo = s.ocorrencia_tipo as string;
  const salvar = async (r: RascunhoColeta, status: string) => {
    const pend = pendenciasColeta(tipo, r);
    const { error } = await admin.from("schedules").update({ coleta_rascunho: r, coleta_resumo: resumoColeta(s.ocorrencia_codigo, r), coleta_pendencias: pend,
      coleta_status: s.status === "concluido" && status === "rascunho" ? "pendente" : status, coleta_processada_em: new Date().toISOString() }).eq("id", s.id);
    if (error) { console.error("[coleta] save", error.code); throw new Error("save"); }
    return pend;
  };

  try {
    switch (b.action) {
      case "pendencias":
        return json({ codigo: s.ocorrencia_codigo, status: s.coleta_status, pendencias: pendenciasColeta(tipo, s.coleta_rascunho), resumo: resumoColeta(s.ocorrencia_codigo, s.coleta_rascunho), rascunho: s.coleta_rascunho ?? {} });
      case "salvar": {
        const r = limparRascunho(b.rascunho);
        const pend = await salvar(r, "rascunho");
        return json({ ok: true, rascunho: r, pendencias: pend, resumo: resumoColeta(s.ocorrencia_codigo, r) });
      }
      case "concluir": {
        const key = Deno.env.get("LOVABLE_API_KEY");
        if (!key) return json({ error: "Transcrição indisponível (configuração)" }, 500);
        const { data: evs } = await admin.from("schedule_evidencias").select("id, tipo, audio_path, transcricao, observacoes, created_at")
          .eq("schedule_id", s.id).in("tipo", ["audio", "texto"]).order("created_at");
        const textos: string[] = [];
        for (const e of evs ?? []) {
          let t = e.transcricao as string | null;
          if (e.tipo === "audio" && !t && e.audio_path) {
            const { data: blob, error } = await admin.storage.from("visit-audio").download(e.audio_path);
            if (error || !blob) { console.error("[coleta] download", e.id); continue; }
            t = await transcrever(key, blob, e.audio_path.split("/").pop() ?? "audio.webm");
            await admin.from("schedule_evidencias").update({ transcricao: t || "(sem fala)" }).eq("id", e.id);
          }
          if (e.tipo === "texto") t = t ?? e.observacoes;
          if (t && t !== "(sem fala)") textos.push(t);
        }
        if (!textos.length) return json({ error: "Grave ao menos um áudio ou escreva um texto antes de concluir" }, 400);
        const r = await extrair(key, tipo, textos, s.coleta_rascunho ?? null);
        const pend = await salvar(r, "rascunho");
        return json({ ok: true, rascunho: r, pendencias: pend, resumo: resumoColeta(s.ocorrencia_codigo, r), transcricoes: textos.length });
      }
      case "confirmar": {
        const r = limparRascunho(b.rascunho ?? s.coleta_rascunho);
        const pend = pendenciasColeta(tipo, r);
        if (pend.length) { await salvar(r, "rascunho"); return json({ error: "Ainda faltam informações", pendencias: pend }, 422); }
        const now = new Date().toISOString();
        // 1) Planned points (not active: activation still needs the installation photo).
        const { count: ja } = await admin.from("comodatos").select("id", { count: "exact", head: true }).eq("origem_schedule_id", s.id);
        let pontos = 0;
        if (!ja) {
          const rows = (r.pontos ?? []).filter((p) => p.local || p.produto).map((p) => ({ organization_id: s.organization_id, client_id: s.client_id ?? null, lead_id: s.lead_id ?? null,
            status: "PREVISTO", origem: "coleta", origem_schedule_id: s.id, localizacao_interna: p.local ?? null, aparelho_descricao: p.aparelho ?? null,
            quantidade: p.quantidade ?? "1", notes: p.produto ? `Produto previsto: ${p.produto}` : null, created_by: userId }));
          if (rows.length) { const { error } = await admin.from("comodatos").insert(rows); if (error) { console.error("[coleta] pontos", error.code); return json({ error: "Não foi possível salvar os pontos" }, 400); } pontos = rows.length; }
        }
        // 2) Commercial history on the lead (follows to the client on conversion).
        const resumo = resumoColeta(s.ocorrencia_codigo, r);
        const proximo = (r.proximos_passos ?? []).map((p) => `${p.tipo}${p.data ? ` ${p.data}` : ""}`).join("; ").slice(0, 200) || null;
        if (s.lead_id) {
          await admin.from("lead_timeline").insert({ organization_id: s.organization_id, lead_id: s.lead_id, pessoa_id: s.leads?.pessoa_id ?? null, tipo: "visita", origem: "fera", resumo, proximo_passo: proximo, referencia_id: s.id });
          if (!s.leads?.contact_name && r.contato?.nome) {
            await admin.from("leads").update({ contact_name: r.contato.nome, ...(r.contato.telefone ? { contact_phone: r.contato.telefone } : {}), ...(r.contato.email ? { contact_email: r.contato.email } : {}) })
              .eq("id", s.lead_id).eq("organization_id", s.organization_id).is("contact_name", null);
          }
        }
        // 3) Next visits (proposal/return = commercial; test/direct sale = technical with the points as items, only for a client).
        const itens = (r.pontos ?? []).filter((p) => p.produto || p.aparelho).map((p) => ({ descricao: `${p.produto || p.aparelho}${p.local ? ` — ${p.local}` : ""}`, quantidade: p.quantidade || "1" }));
        const nome = s.clients?.name || s.leads?.empresa_nome || s.leads?.company || s.title || "";
        const criados: string[] = [];
        for (const p of r.proximos_passos ?? []) {
          if (!p.tipo || !p.data) continue;
          const tecnico = (p.tipo === "teste" || p.tipo === "venda_direta") && !!s.client_id;
          const row: Record<string, unknown> = { organization_id: s.organization_id, client_id: s.client_id ?? null, lead_id: s.lead_id ?? null, scheduled_date: p.data, start_time: "09:00",
            status: "agendado", assigned_to: s.assigned_to ?? userId, created_by: userId, source: "coleta", confirmacao_status: "nao_aplicavel",
            title: `${p.tipo === "proposta" ? "Proposta" : p.tipo === "retorno" ? "Retorno" : p.tipo === "teste" ? "Instalação de teste" : "Venda direta"} — ${nome}`,
            description: `Gerado pela coleta #${s.ocorrencia_codigo}${p.observacao ? `: ${p.observacao}` : ""}${(p.tipo === "teste" || p.tipo === "venda_direta") && !s.client_id ? " (converter o lead em cliente para agendar a instalação)" : ""}` };
          if (tecnico) Object.assign(row, { schedule_type: "visita_tecnica", schedule_subtype: "INSTALACAO", operacao_material: p.tipo === "teste" ? "instalacao_teste" : "instalacao_definitiva", itens, ocorrencia_tipo: p.tipo === "teste" ? "instalacao_teste" : "venda_direta" });
          else Object.assign(row, { schedule_type: "visita_comercial", schedule_subtype: "PROSPECCAO", ocorrencia_tipo: "primeira_visita" });
          const { data: novo, error } = await admin.from("schedules").insert(row).select("ocorrencia_codigo").single();
          if (error) console.error("[coleta] next", error.code); else criados.push(novo.ocorrencia_codigo);
        }
        await admin.from("schedules").update({ coleta_rascunho: r, coleta_resumo: resumo, coleta_pendencias: [], coleta_status: "confirmada", coleta_confirmada_em: now, coleta_confirmada_por: userId }).eq("id", s.id);
        return json({ ok: true, resumo, pontos_previstos: pontos, agendamentos: criados });
      }
    }
  } catch (e) {
    if (e instanceof AiError) {
      const msg = e.status === 402 ? "Créditos de IA esgotados: avise o administrador" : e.status === 429 ? "Muitas transcrições agora: tente em 1 minuto" : "Não foi possível transcrever agora: tente de novo";
      return json({ error: msg }, e.status === 402 || e.status === 429 ? e.status : 502);
    }
    console.error("[coleta] fail");
    return json({ error: "Não foi possível processar a coleta" }, 500);
  }
  return json({ error: "Requisição inválida" }, 400);
});

export { exigeColeta };
