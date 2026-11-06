// Generates the commercial proposal PDF (A4) for a proposal the caller can read (RLS), stores it in the private
// proposal-pdfs bucket and returns a 30-day signed link. Items without price block generation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mergeConfig, parceirosAtivos, renderPropostaPdf, type PropostaPdfData } from "../_shared/proposta-pdf.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dBR = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const SIGN_SECONDS = 30 * 86400;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Não autorizado" }, 401);
  let body: { proposal_id?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Requisição inválida" }, 400); }
  const id = typeof body.proposal_id === "string" && UUID.test(body.proposal_id) ? body.proposal_id : null;
  if (!id) return json({ error: "proposal_id inválido" }, 400);

  // Access check with the caller's own permissions.
  const { data: visivel } = await caller.from("proposals").select("id").eq("id", id).maybeSingle();
  if (!visivel) return json({ error: "Proposta não encontrada" }, 404);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: p, error: pe } = await db.from("proposals").select("*").eq("id", id).single();
  if (pe || !p) return json({ error: "Proposta não encontrada" }, 404);
  const { data: itensRaw = [] } = await db.from("proposal_items").select("*, products(name, is_dispenser)").eq("proposal_id", id).order("sort_order");
  const itens = itensRaw ?? [];
  const semPreco = itens.filter((i) => i.unit_price == null && !i.products?.is_dispenser);
  if (semPreco.length) return json({ error: `Preencha o preço de ${semPreco.length} item(ns) antes de gerar o PDF.`, itens_sem_preco: semPreco.map((i) => i.description) }, 422);
  const { data: org } = await db.from("organizations").select("name, trading_name, logo_url, proposta_config").eq("id", p.organization_id).single();
  const config = mergeConfig(org?.proposta_config);

  // Client / lead data
  let razao = "Cliente", cnpj: string | null = null; let contato: { nome?: string | null; email?: string | null; telefone?: string | null } = {};
  const ecFilter = p.client_id ? { col: "client_id", val: p.client_id } : p.lead_id ? { col: "lead_id", val: p.lead_id } : null;
  if (p.client_id) {
    const { data: c } = await db.from("clients").select("name, razao_social, document, email, phone, company").eq("id", p.client_id).single();
    if (c) { razao = c.razao_social || c.company || c.name; cnpj = c.document; contato = { email: c.email, telefone: c.phone }; }
  } else if (p.lead_id) {
    const { data: l } = await db.from("leads").select("razao_social, empresa_nome, company, title, cnpj, contact_name, contact_email, contact_phone").eq("id", p.lead_id).single();
    if (l) { razao = l.razao_social || l.empresa_nome || l.company || l.title; cnpj = l.cnpj; contato = { nome: l.contact_name, email: l.contact_email, telefone: l.contact_phone }; }
  }
  if (ecFilter) {
    const { data: ec } = await db.from("empresa_contatos").select("is_primary, pessoas(nome, email, telefone, whatsapp)").eq(ecFilter.col, ecFilter.val).order("is_primary", { ascending: false }).limit(1);
    const pes = (ec?.[0] as { pessoas?: { nome?: string; email?: string; telefone?: string; whatsapp?: string } } | undefined)?.pessoas;
    if (pes) contato = { nome: pes.nome || contato.nome, email: pes.email || contato.email, telefone: pes.whatsapp || pes.telefone || contato.telefone };
  }
  const { data: cons } = await db.from("profiles").select("name, phone").eq("user_id", p.assigned_to || p.created_by).maybeSingle();

  // Planned points linked to the proposal
  const comIds = itens.map((i) => i.comodato_id).filter(Boolean) as string[];
  let comodatos: { id: string; localizacao_interna: string | null; aparelho_descricao: string | null; quantidade: string | null; refil: { name: string } | null; inv: { name: string } | null }[] = [];
  if (comIds.length || p.origem_schedule_id) {
    let q = db.from("comodatos").select("id, localizacao_interna, aparelho_descricao, quantidade, refil:products!comodatos_refil_product_id_fkey(name), inv:products!comodatos_product_id_fkey(name)").eq("organization_id", p.organization_id);
    q = comIds.length ? q.in("id", comIds) : q.eq("origem_schedule_id", p.origem_schedule_id);
    const { data, error } = await q;
    if (error) { // FK names may differ; fall back to plain columns
      let q2 = db.from("comodatos").select("id, localizacao_interna, aparelho_descricao, quantidade").eq("organization_id", p.organization_id);
      q2 = comIds.length ? q2.in("id", comIds) : q2.eq("origem_schedule_id", p.origem_schedule_id);
      comodatos = ((await q2).data ?? []).map((c) => ({ ...c, refil: null, inv: null }));
    } else comodatos = (data ?? []) as unknown as typeof comodatos;
  }
  const itemDoPonto = (cid: string) => itens.find((i) => i.comodato_id === cid);
  const ambientes = comodatos.map((c) => ({ local: c.localizacao_interna || "Ponto", aparelho: c.aparelho_descricao || c.inv?.name || null,
    produto: c.refil?.name || itemDoPonto(c.id)?.description || null, quantidade: c.quantidade || (itemDoPonto(c.id) ? String(itemDoPonto(c.id)!.quantity) : null) }));
  // Devices without a linked point become "Geral" rows in the same per-environment table (no separate comodato section).
  const pontosIds = new Set(comodatos.map((c) => c.id));
  const aparelhos = new Map<string, number>();
  for (const i of itens) if (i.products?.is_dispenser && !(i.comodato_id && pontosIds.has(i.comodato_id))) aparelhos.set(i.description, Math.max(aparelhos.get(i.description) ?? 0, Number(i.quantity) || 1));

  const vendidos = itens.filter((i) => !i.products?.is_dispenser).map((i) => {
    const q = Number(i.quantity) || 0, pr = Number(i.unit_price) || 0, ds = Number(i.discount_percent) || 0;
    return { descricao: i.description, quantidade: q, preco: pr, desconto: ds, total: Math.round(q * pr * (1 - ds / 100) * 100) / 100 };
  });
  const subtotal = vendidos.reduce((s, i) => s + i.total, 0);
  const dg = Number(p.discount_percent) || 0;
  const total = Math.round(subtotal * (1 - dg / 100) * 100) / 100;

  const { data: brands } = await db.from("products").select("brand").eq("organization_id", p.organization_id).eq("is_active", true).not("brand", "is", null).limit(5000);
  const emit = new Date(p.created_at);
  const valid = p.valid_until ? new Date(p.valid_until + "T12:00:00Z") : new Date(emit.getTime() + config.validade_dias * 86400000);
  const validadeDias = Math.max(1, Math.round((valid.getTime() - emit.getTime()) / 86400000));

  const data: PropostaPdfData = {
    numero: p.numero ?? 0, data: dBR(emit), validade: dBR(valid),
    cliente: { razao, cnpj, responsavel: contato }, consultor: { nome: cons?.name, telefone: cons?.phone },
    ambientes, itens: vendidos, comodatos: [...aparelhos].map(([descricao, quantidade]) => ({ descricao, quantidade })),
    descontoGeralPct: dg, subtotal, total,
    condicoes: { forma_pagamento: p.forma_pagamento || config.forma_pagamento, prazo_entrega: p.prazo_entrega || config.prazo_entrega,
      periodicidade: p.periodicidade_manutencao || config.periodicidade_manutencao, validade_dias: validadeDias },
    parceiros: parceirosAtivos((brands ?? []).map((b) => b.brand)), config,
  };

  let logo: Uint8Array | null = null;
  const m = org?.logo_url?.match(/\/org-logos\/([^?]+)/);
  if (m) { const { data: f } = await db.storage.from("org-logos").download(decodeURIComponent(m[1])); if (f) logo = new Uint8Array(await f.arrayBuffer()); }

  const bytes = await renderPropostaPdf(data, logo);
  const path = `${p.organization_id}/${p.id}/proposta-${String(p.numero ?? 0).padStart(4, "0")}.pdf`;
  const { error: upErr } = await db.storage.from("proposal-pdfs").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) { console.error("upload", upErr.message); return json({ error: "Não foi possível salvar o PDF" }, 500); }
  const { data: signed } = await db.storage.from("proposal-pdfs").createSignedUrl(path, SIGN_SECONDS, { download: `Proposta-${p.numero}-NitsClean.pdf` });
  await db.from("proposals").update({ pdf_path: path, pdf_gerado_em: new Date().toISOString() }).eq("id", id);
  return json({ ok: true, url: signed?.signedUrl, numero: p.numero, total, cliente: razao, contato });
});
