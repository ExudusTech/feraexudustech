// Lote 15: audio collection of an occurrence (schedule). Actions: concluir (transcribe + AI draft), salvar (seller edits),
// confirmar (apply: planned points, timeline, next visits), pendencias. The schedule is read with the caller's access first;
// the Flora path (mcp) calls with the service key plus the server-identified team user, never a user-supplied identity.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { primeiroSlotLivre, pendenciaAgendar, addDias, hhmm } from "../_shared/agenda-slot.ts";
import { areaDoCliente, parseDiaSemana } from "../_shared/base-instalada.ts";
import { listEvents } from "../_shared/google-calendar.ts";
import { stageForCheckout } from "../_shared/visit-exec.ts";
import { itensDosPontos, limparRascunho, matchProduto, precisaInstalacao, tipoNotaPadrao, pendenciasColeta, RASCUNHO_JSON_SCHEMA, resumoColeta, semVazios, type RascunhoColeta } from "../_shared/coleta.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-acting-user" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const SELECT = "id, organization_id, title, status, assigned_to, created_by, lead_id, client_id, scheduled_date, start_time, ocorrencia_codigo, ocorrencia_tipo, coleta_status, coleta_rascunho, coleta_pendencias, resumo_execucao, leads(pessoa_id, contact_name, empresa_nome, company, zip_code, city, cnpj, category, levantamento), clients(name, zip_code, city, document, levantamento)";

const spHoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const TIPO_LABEL: Record<string, string> = { proposta: "proposta", retorno: "retorno", teste: "instalação de teste", venda_direta: "venda direta" };

/** Google timed busy (READ-ONLY GET), falling back to the synced cache table. */
async function googleOcupado(admin: any, orgId: string, from: string, to: string): Promise<{ start: number; end: number }[]> {
  const timeMin = new Date(`${from}T00:00:00-03:00`).toISOString(), timeMax = new Date(Date.parse(`${to}T00:00:00-03:00`) + 86_400_000).toISOString();
  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY"), connKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!lovableKey || !connKey) throw new Error("cfg");
    const evs = await listEvents("primary", timeMin, timeMax, { lovableKey, connKey });
    return evs.filter((e: any) => e.status !== "cancelled" && e.transparency !== "transparent" && e.start?.dateTime && e.end?.dateTime)
      .map((e: any) => ({ start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime) }));
  } catch {
    const { data } = await admin.from("google_calendar_busy").select("start_at, end_at").eq("organization_id", orgId).lt("start_at", timeMax).gt("end_at", timeMin);
    return (data ?? []).map((r: any) => ({ start: Date.parse(r.start_at), end: Date.parse(r.end_at) }));
  }
}

class AiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function transcrever(key: string, audio: Blob, nome: string): Promise<string> {
  const form = new FormData();
  form.append("model", "openai/gpt-transcribe");
  form.append("file", new File([audio], nome, { type: audio.type?.startsWith("audio/") ? audio.type : "audio/webm" }));
  form.append("response_format", "json");
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
  const novo = semVazios(JSON.parse(out));
  // Fields the seller edits on screen (installation items/invoice) are kept; survey details merge (new speech wins only when said).
  return limparRascunho({ ...novo, instalacao: atual?.instalacao, levantamento: { ...(atual?.levantamento ?? {}), ...(novo.levantamento ?? {}) } });
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
  if (!UUID.test(b.id ?? "") || !["concluir", "salvar", "confirmar", "pendencias", "resolver_agendar", "audios", "excluir_audio"].includes(b.action)) return json({ error: "Requisição inválida" }, 400);

  // Identity: app user (JWT, caller-RLS read) or Flora path (service key + server-resolved user id).
  const interno = auth === `Bearer ${serviceKey}`;
  let userId: string; let s: any; let caller: any = null;
  if (interno) {
    const acting = req.headers.get("x-acting-user") ?? "";
    if (!UUID.test(acting)) return json({ error: "Não autorizado" }, 401);
    userId = acting;
    const { data } = await admin.from("schedules").select(SELECT).eq("id", b.id).maybeSingle();
    s = data;
  } else {
    caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
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
  if (b.action === "resolver_agendar") {
    const resto = (Array.isArray(s.coleta_pendencias) ? s.coleta_pendencias : []).filter((x: string) => x !== b.item);
    await admin.from("schedules").update({ coleta_pendencias: resto }).eq("id", s.id);
    return json({ ok: true, pendencias: resto });
  }
  if (b.action === "audios") {
    const { data: evs } = await admin.from("schedule_evidencias").select("id, tipo, audio_path, transcricao, observacoes, duracao_s, created_at")
      .eq("schedule_id", s.id).in("tipo", ["audio", "texto"]).order("created_at");
    const out = [];
    for (const e of evs ?? []) {
      let url: string | null = null;
      if (e.audio_path) { const { data: sg } = await admin.storage.from("visit-audio").createSignedUrl(e.audio_path, 3600); url = sg?.signedUrl ?? null; }
      out.push({ id: e.id, tipo: e.tipo, criado_em: e.created_at, duracao_s: e.duracao_s, url, transcrito: !!e.transcricao, texto: e.tipo === "texto" ? (e.observacoes ?? e.transcricao) : null });
    }
    return json({ audios: out, pode_excluir: s.coleta_status !== "confirmada" });
  }
  if (s.coleta_status === "confirmada" && b.action !== "pendencias") return json({ error: "Coleta já confirmada" }, 409);
  const tipo = s.ocorrencia_tipo as string;
  const temCnpj = () => String(s.clients?.document ?? s.leads?.cnpj ?? "").replace(/\D/g, "").length === 14;
  const pendDe = (r: RascunhoColeta) => pendenciasColeta(tipo, r, { cnpj: temCnpj() });
  const salvar = async (r: RascunhoColeta, status: string) => {
    const pend = pendDe(r);
    const { error } = await admin.from("schedules").update({ coleta_rascunho: r, coleta_resumo: resumoColeta(s.ocorrencia_codigo, r), coleta_pendencias: pend,
      coleta_status: s.status === "concluido" && status === "rascunho" ? "pendente" : status, coleta_processada_em: new Date().toISOString() }).eq("id", s.id);
    if (error) { console.error("[coleta] save", error.code); throw new Error("save"); }
    return pend;
  };

  try {
    switch (b.action) {
      case "excluir_audio": {
        if (!UUID.test(b.evidencia_id ?? "")) return json({ error: "Requisição inválida" }, 400);
        const { data: ev } = await admin.from("schedule_evidencias").select("id, audio_path").eq("id", b.evidencia_id).eq("schedule_id", s.id).in("tipo", ["audio", "texto"]).maybeSingle();
        if (!ev) return json({ error: "Áudio não encontrado" }, 404);
        if (ev.audio_path) await admin.storage.from("visit-audio").remove([ev.audio_path]);
        await admin.from("schedule_evidencias").delete().eq("id", ev.id);
        return json({ ok: true });
      }
      case "pendencias":
        return json({ tem_cnpj: temCnpj(), segmento: s.leads?.category ?? null, codigo: s.ocorrencia_codigo, status: s.coleta_status, pendencias: s.coleta_status === "confirmada" ? (s.coleta_pendencias ?? []) : pendDe(s.coleta_rascunho ?? {}), resumo: resumoColeta(s.ocorrencia_codigo, s.coleta_rascunho), rascunho: s.coleta_rascunho ?? {} });
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
        const pend = pendDe(r);
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
        // 1b) First commercial visit → draft proposal with the planned points (price only from the product; never invented).
        let propostaId: string | null = null;
        if (tipo === "primeira_visita") {
          const { data: jaProp } = await admin.from("proposals").select("id").eq("origem_schedule_id", s.id).maybeSingle();
          propostaId = jaProp?.id ?? null;
          const { data: pts } = await admin.from("comodatos").select("id, localizacao_interna, aparelho_descricao, quantidade, notes").eq("origem_schedule_id", s.id);
          if (!propostaId && (pts ?? []).length) {
            const { data: prods } = await admin.from("products").select("id, name, price").eq("organization_id", s.organization_id).eq("is_active", true).limit(1000);
            const nomeEmp = s.clients?.name || s.leads?.empresa_nome || s.leads?.company || s.title || "";
            const { data: prop, error: pe } = await admin.from("proposals").insert({ organization_id: s.organization_id, client_id: s.client_id ?? null, lead_id: s.lead_id ?? null,
              origem_schedule_id: s.id, created_by: userId, assigned_to: s.assigned_to ?? userId, title: `Proposta — ${nomeEmp}`.slice(0, 200), status: "rascunho",
              description: `Gerada da coleta #${s.ocorrencia_codigo}`, total_value: 0, final_value: 0 }).select("id").single();
            if (pe) console.error("[coleta] proposta", pe.code);
            else {
              propostaId = prop.id;
              const itensProp = (pts ?? []).map((c: any, i: number) => {
                const produto = String(c.notes ?? "").replace(/^Produto previsto:\s*/, "") || c.aparelho_descricao || "Item";
                const prod = matchProduto(prods ?? [], produto);
                const qtd = Number(String(c.quantidade ?? "1").replace(",", ".")) || 1;
                const preco = prod?.price != null && Number(prod.price) > 0 ? Number(prod.price) : null;
                return { proposal_id: prop.id, organization_id: s.organization_id, product_id: prod?.id ?? null, comodato_id: c.id, sort_order: i,
                  description: `${prod?.name ?? produto}${c.localizacao_interna ? ` — ${c.localizacao_interna}` : ""}`.slice(0, 300), quantity: qtd,
                  unit_price: preco, total_price: preco == null ? null : Math.round(preco * qtd * 100) / 100 };
              });
              const { error: ie } = await admin.from("proposal_items").insert(itensProp);
              if (ie) console.error("[coleta] itens proposta", ie.code);
              const total = itensProp.reduce((a, x) => a + (x.total_price ?? 0), 0);
              if (total) await admin.from("proposals").update({ total_value: total, final_value: total }).eq("id", prop.id);
            }
          }
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
        // 2b) Survey details go to the visit and the company (segment from the lead; decision maker/flow from the draft).
        const lvAtual = (s.clients?.levantamento ?? s.leads?.levantamento ?? {}) as Record<string, unknown>;
        const n = (v?: string) => v ? Number(v) : undefined;
        const lv = Object.fromEntries(Object.entries({ ...lvAtual, segmento: (lvAtual as any).segmento ?? s.leads?.category ?? undefined,
          porte: n(r.levantamento?.porte) ?? lvAtual.porte, banheiros_f: n(r.levantamento?.banheiros_f) ?? lvAtual.banheiros_f, banheiros_m: n(r.levantamento?.banheiros_m) ?? lvAtual.banheiros_m,
          banheiros_pne: n(r.levantamento?.banheiros_pne) ?? lvAtual.banheiros_pne, problema: r.levantamento?.problema ?? lvAtual.problema, fornecedor: r.levantamento?.fornecedor ?? lvAtual.fornecedor,
          decisor: r.decisor?.nome ? `${r.decisor.nome}${r.decisor.cargo ? ` (${r.decisor.cargo})` : ""}` : lvAtual.decisor,
          produtos_atuais: r.produto_atual ?? lvAtual.produtos_atuais }).filter(([, v]) => v !== undefined && v !== null && v !== ""));
        await admin.from("schedules").update({ levantamento: lv }).eq("id", s.id);
        if (s.client_id) await admin.from("clients").update({ levantamento: lv }).eq("id", s.client_id).eq("organization_id", s.organization_id);
        else if (s.lead_id) await admin.from("leads").update({ levantamento: lv }).eq("id", s.lead_id).eq("organization_id", s.organization_id);
        // 2c) Lost: the lead goes to the lost stage (the step lives only in the draft).
        const perdido = (r.proximos_passos ?? []).find((p) => p.tipo === "perdido");
        if (perdido && s.lead_id) {
          const { data: st } = await admin.from("lead_stages").select("id").eq("organization_id", s.organization_id).eq("chave", stageForCheckout(true, "perdido")).maybeSingle();
          if (st) await admin.from("leads").update({ stage_id: st.id, stage: "fechado_perdido" }).eq("id", s.lead_id).eq("organization_id", s.organization_id);
        }
        // 2d) Only a direct sale converts the lead; a test installation stays on the lead (CNPJ saved on the lead for the shipping note).
        const inst = precisaInstalacao(r);
        const semHorario: string[] = [];
        if (inst && !s.client_id && s.lead_id && r.instalacao?.cnpj && !temCnpj()) {
          await admin.from("leads").update({ cnpj: r.instalacao.cnpj }).eq("id", s.lead_id).eq("organization_id", s.organization_id);
        }
        const vendaDireta = converteLeadNaColeta(r);
        if (vendaDireta && !s.client_id && s.lead_id) {
          const { data: conv, error: ce } = caller ? await caller.rpc("converter_lead_em_cliente", { _lead: s.lead_id }) : { data: null, error: null };
          if (!ce && conv?.client_id) { s.client_id = conv.client_id; await admin.from("schedules").update({ client_id: conv.client_id }).eq("id", s.id); }
          else semHorario.push(conv?.status === "duplicados" ? "Converter o lead em cliente (há cadastro parecido)" : "Converter o lead em cliente");
        }
        const itens = (r.instalacao?.itens?.length ? r.instalacao.itens.filter((i) => i.descricao).map((i) => ({ descricao: i.descricao!, quantidade: i.quantidade || "1" })) : itensDosPontos(r));
        const nome = s.clients?.name || s.leads?.empresa_nome || s.leads?.company || s.title || "";
        const criados: string[] = [];
        const passos = (r.proximos_passos ?? []).filter((p) => p.tipo && p.tipo !== "perdido" && p.data);
        let ctx: { area: any; feriados: any[]; ocupados: any[]; google: { start: number; end: number }[]; cidade: string | null } | null = null;
        if (passos.length) {
          const cep = s.clients?.zip_code ?? s.leads?.zip_code ?? null, cidade = s.clients?.city ?? s.leads?.city ?? null;
          const { data: areas } = await admin.from("ekkoa_coverage_areas").select("name, city, dia_semana, zip_code_start, zip_code_end, horario_inicio, horario_fim").eq("organization_id", s.organization_id);
          const from = passos.map((p) => p.data!).sort()[0], to = addDias(passos.map((p) => p.data!).sort().slice(-1)[0], 60);
          const { data: feriados } = await admin.from("holidays").select("date, city").or(`organization_id.is.null,organization_id.eq.${s.organization_id}`).gte("date", from).lte("date", to);
          const { data: ag } = await admin.from("schedules").select("scheduled_date, start_time, end_time").eq("organization_id", s.organization_id)
            .eq("assigned_to", s.assigned_to ?? userId).gte("scheduled_date", from).lte("scheduled_date", to).in("status", ["agendado", "confirmado", "em_atendimento"]);
          ctx = { area: areaDoCliente(areas ?? [], cep, cidade), feriados: feriados ?? [], cidade, google: await googleOcupado(admin, s.organization_id, from, to),
            ocupados: (ag ?? []).filter((x: any) => x.start_time).map((x: any) => ({ data: x.scheduled_date, inicio: String(x.start_time).slice(0, 5), fim: x.end_time ? String(x.end_time).slice(0, 5) : null })) };
        }
        const norm = (v?: string | null) => (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        for (const p of passos) {
          const c = ctx!;
          const hoje = spHoje(), desde = p.data! > hoje ? p.data! : addDias(hoje, 1);
          const slot = c.area ? primeiroSlotLivre({ from: desde, rota: parseDiaSemana(c.area.dia_semana), inicio: c.area.horario_inicio, fim: c.area.horario_fim, duracao: 60,
            ocupados: c.ocupados, google: c.google, bloqueado: (d) => c.feriados.some((h: any) => h.date === d && (!h.city || norm(h.city) === norm(c.cidade))) }) : null;
          if (!slot) { semHorario.push(pendenciaAgendar(TIPO_LABEL[p.tipo!] ?? p.tipo!, s.ocorrencia_codigo)); continue; }
          const tecnico = p.tipo === "teste" ? !!(s.client_id || s.lead_id) : p.tipo === "venda_direta" && !!s.client_id;
          const row: Record<string, unknown> = { organization_id: s.organization_id, client_id: s.client_id ?? null, lead_id: s.lead_id ?? null, scheduled_date: slot.data, start_time: slot.hora, end_time: hhmm(Number(slot.hora.slice(0, 2)) * 60 + Number(slot.hora.slice(3)) + 60),
            status: "agendado", assigned_to: s.assigned_to ?? userId, created_by: userId, source: "coleta", confirmacao_status: "nao_aplicavel",
            title: `${p.tipo === "proposta" ? "Proposta" : p.tipo === "retorno" ? "Retorno" : p.tipo === "teste" ? "Instalação de teste" : "Venda direta"} — ${nome}`,
            description: `Gerado pela coleta #${s.ocorrencia_codigo}${p.observacao ? `: ${p.observacao}` : ""}${p.tipo === "venda_direta" && !s.client_id ? " (converter o lead em cliente para agendar a instalação)" : ""}` };
          if (tecnico) Object.assign(row, { schedule_type: "visita_tecnica", schedule_subtype: "INSTALACAO", operacao_material: p.tipo === "teste" ? "instalacao_teste" : "instalacao_definitiva", itens, tipo_nota: r.instalacao?.tipo_nota || tipoNotaPadrao(p.tipo), proposta_id: propostaId, ocorrencia_tipo: p.tipo === "teste" ? "instalacao_teste" : "venda_direta" });
          else Object.assign(row, { schedule_type: "visita_comercial", schedule_subtype: "PROSPECCAO", ocorrencia_tipo: "primeira_visita" });
          const { data: novo, error } = await admin.from("schedules").insert(row).select("ocorrencia_codigo").single();
          if (error) { console.error("[coleta] next", error.code); semHorario.push(pendenciaAgendar(TIPO_LABEL[p.tipo!] ?? p.tipo!, s.ocorrencia_codigo)); }
          else { criados.push(novo.ocorrencia_codigo); c.ocupados.push({ data: slot.data, inicio: slot.hora, fim: null }); }
        }
        await admin.from("schedules").update({ coleta_rascunho: r, coleta_resumo: resumo, coleta_pendencias: semHorario, coleta_status: "confirmada", coleta_confirmada_em: now, coleta_confirmada_por: userId }).eq("id", s.id);
        return json({ ok: true, resumo, pontos_previstos: pontos, proposta_id: propostaId, agendamentos: criados, pendencias_agendar: semHorario });
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

