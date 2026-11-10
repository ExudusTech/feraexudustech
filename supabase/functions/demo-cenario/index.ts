// Configurações → Dados de demonstração (super_admin only, NitsClean only): contar / criar / apagar the demo scenario.
// Records are written through the real tables (triggers number occurrences, create billing tasks, contacts and conversions);
// every created id is registered in demo_registros, and apagar_cenario_demo removes exactly that set and its children.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addDias, areaDaCidade, CIDADES, CIDADES_DEMO, cnpjDemo, demoNome, escolherPares, NITSCLEAN_ORG_ID, planejarDatas, precoDe, telefonesDemo,
  type AreaDemo, type ParDemo, type ProdutoDemo, type VisitaPlano } from "../_shared/demo-cenario.ts";
import { pendenciasColeta, resumoColeta, type RascunhoColeta } from "../_shared/coleta.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const spHoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const fold = (v?: string | null) => (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const isoSP = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`).toISOString();
const maisHora = (hora: string, min: number) => { const [h, m] = hora.split(":").map(Number); const t = Math.min(h * 60 + m + min, 23 * 60 + 59); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

// deno-lint-ignore no-explicit-any
type Admin = any;

class Falha extends Error { constructor(public etapa: string, public code?: string) { super(etapa); } }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Não autorizado" }, 401);
  let body: { action?: string; organization_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Requisição inválida" }, 400); }
  if (!["contar", "criar", "apagar"].includes(body.action ?? "")) return json({ error: "Requisição inválida" }, 400);
  if (body.organization_id !== NITSCLEAN_ORG_ID) return json({ error: "Dados de demonstração existem só para a organização NitsClean" }, 403);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "super_admin")) return json({ error: "Só o super administrador pode usar os dados de demonstração" }, 403);
  const org = NITSCLEAN_ORG_ID;

  const contar = async () => {
    const { data, error } = await admin.rpc("demo_contagem", { _org: org });
    if (error) { console.error("[demo] contar", error.code); throw new Falha("contar", error.code); }
    const c = (data ?? {}) as Record<string, number>;
    return { contagem: c, existe: Object.values(c).some((n) => Number(n) > 0) };
  };
  const apagar = async () => {
    const { data, error } = await admin.rpc("apagar_cenario_demo", { _org: org });
    if (error) { console.error("[demo] apagar", error.code); throw new Falha("apagar", error.code); }
    const porBucket = new Map<string, string[]>();
    for (const f of ((data as any)?.arquivos ?? []) as Array<{ bucket: string; path: string }>) if (f?.bucket && f?.path) porBucket.set(f.bucket, [...(porBucket.get(f.bucket) ?? []), f.path]);
    let arquivos = 0;
    for (const [bucket, paths] of porBucket) {
      const { error: se } = await admin.storage.from(bucket).remove(paths);
      if (se) console.error("[demo] storage", bucket); else arquivos += paths.length;
    }
    return { apagado: (data as any)?.apagado ?? {}, arquivos_removidos: arquivos };
  };

  try {
    if (body.action === "contar") return json(await contar());
    if (body.action === "apagar") return json({ ok: true, ...(await apagar()) });
    if ((await contar()).existe) return json({ error: "Já existe um cenário de demonstração. Apague antes de criar outro." }, 409);
    try {
      const resumo = await criarCenario(admin, caller, org, user.id);
      return json({ ok: true, resumo, ...(await contar()) });
    } catch (e) {
      // Never leave half a scenario behind: everything created so far is marked, so it is removed.
      console.error("[demo] criar", e instanceof Falha ? `${e.etapa} ${e.code ?? ""}` : "erro");
      await apagar().catch(() => console.error("[demo] rollback failed"));
      return json({ error: `Não foi possível criar o cenário (${e instanceof Falha ? e.etapa : "erro interno"}). Nada ficou gravado.` }, 500);
    }
  } catch (e) {
    return json({ error: `Não foi possível concluir (${e instanceof Falha ? e.etapa : "erro interno"})` }, 500);
  }
});

interface LeadDemo { key: string; empresa: string; categoria: string; contato: string; cargo: string; etapa: string; dono: "ph" | "campo"; cnpj?: number; plano?: keyof ReturnType<typeof planoVazio> }
const planoVazio = () => ({ ontem_concluida: 0, ontem_nao_realizada: 0, hoje_andamento: 0, hoje_agendada: 0, amanha_teste: 0, amanha_comercial: 0 });

const LEADS: LeadDemo[] = [
  { key: "cliente", empresa: "Pousada Mar Azul", categoria: "Pousada", contato: "Renata Lima", cargo: "Gerente", etapa: "cliente_ativo", dono: "campo", cnpj: 1 },
  { key: "andamento", empresa: "Restaurante Sal & Brasa", categoria: "Restaurante", contato: "Jorge Martins", cargo: "Sócio", etapa: "visita_agendada", dono: "campo", plano: "hoje_andamento" },
  { key: "concluida", empresa: "Hotel Vista Lagoa", categoria: "Hotel", contato: "Carla Souza", cargo: "Governanta", etapa: "visita_realizada", dono: "campo", plano: "ontem_concluida" },
  { key: "nao_realizada", empresa: "Academia Corpo Livre", categoria: "Academia", contato: "Diego Alves", cargo: "Proprietário", etapa: "visita_agendada", dono: "ph", plano: "ontem_nao_realizada" },
  { key: "hoje_agendada", empresa: "Clínica Bem Estar", categoria: "Clínica", contato: "Dra. Paula Reis", cargo: "Diretora", etapa: "visita_agendada", dono: "ph", plano: "hoje_agendada" },
  { key: "teste", empresa: "Bar do Porto", categoria: "Bar", contato: "Marcelo Dias", cargo: "Gerente", etapa: "teste_amostra", dono: "campo", cnpj: 2, plano: "amanha_teste" },
  { key: "amanha", empresa: "Padaria Pão Dourado", categoria: "Padaria", contato: "Sônia Ramos", cargo: "Proprietária", etapa: "visita_agendada", dono: "ph", plano: "amanha_comercial" },
  { key: "em_teste", empresa: "Mercado Bom Preço", categoria: "Supermercado", contato: "Luís Carvalho", cargo: "Comprador", etapa: "teste_amostra", dono: "campo", cnpj: 3 },
  { key: "atendimento", empresa: "Escritório Atlântico", categoria: "Escritório", contato: "Fernanda Costa", cargo: "Administrativo", etapa: "novo", dono: "ph" },
  { key: "qualificado", empresa: "Colégio Raízes", categoria: "Escola", contato: "Roberto Nunes", cargo: "Diretor", etapa: "qualificado", dono: "ph" },
  { key: "proposta", empresa: "Hostel Onda Boa", categoria: "Hostel", contato: "Bianca Rocha", cargo: "Gerente", etapa: "proposta_enviada", dono: "campo" },
  { key: "perdido", empresa: "Restaurante Maré Alta", categoria: "Restaurante", contato: "Paulo Mendes", cargo: "Chef", etapa: "perdido", dono: "ph" },
];

async function criarCenario(admin: Admin, caller: Admin, org: string, phId: string) {
  const reg = async (tabela: string, id: string) => {
    const { error } = await admin.from("demo_registros").insert({ organization_id: org, tabela, registro_id: id });
    if (error) throw new Falha("marcar registro", error.code);
  };
  const ins = async (tabela: string, row: Record<string, unknown>, etapa: string, marcar = true) => {
    const { data, error } = await admin.from(tabela).insert(row).select("id").single();
    if (error) throw new Falha(etapa, error.code);
    if (marcar) await reg(tabela, data.id);
    return data.id as string;
  };

  // People and context.
  const { data: perfis } = await admin.from("profiles").select("user_id, name, phone, is_active").eq("organization_id", org);
  const ativos = (perfis ?? []).filter((p: any) => p.is_active !== false);
  const { data: rolesOrg } = await admin.from("user_roles").select("user_id, role").in("user_id", ativos.map((p: any) => p.user_id));
  const campoId = (rolesOrg ?? []).find((r: any) => r.user_id !== phId && ["consultor_tecnico", "vendedor"].includes(r.role))?.user_id ?? phId;
  const dono = (d: "ph" | "campo") => d === "ph" ? phId : campoId;
  const fones = telefonesDemo(LEADS.length + 2, ativos.map((p: any) => p.phone).filter(Boolean));

  const { data: areasRaw } = await admin.from("ekkoa_coverage_areas").select("name, city, dia_semana, horario_inicio, horario_fim, zip_code_start").eq("organization_id", org).eq("is_active", true);
  const areas = (areasRaw ?? []) as AreaDemo[];
  const hoje = spHoje();
  const { data: hol } = await admin.from("holidays").select("date, city").or(`organization_id.is.null,organization_id.eq.${org}`).gte("date", addDias(hoje, -30)).lte("date", addDias(hoje, 30));
  const bloqueado = (d: string, cidade: string) => (hol ?? []).some((h: any) => h.date === d && (!h.city || fold(h.city) === fold(cidade) || fold(cidade).includes(fold(h.city))));
  const plano = planejarDatas(hoje, areas, bloqueado);
  if (!plano) throw new Falha("calcular dias de rota");

  const { data: catalogo } = await admin.from("products").select("id, name, price, brand, is_dispenser, dispenser_family_id, compatible_dispenser_families, is_active")
    .eq("organization_id", org).eq("is_active", true).limit(3000);
  const pares: ParDemo[] = escolherPares((catalogo ?? []) as ProdutoDemo[], 4);
  if (pares.length < 2) throw new Falha("escolher produtos do catálogo");

  const { data: etapas } = await admin.from("lead_stages").select("id, chave").eq("organization_id", org);
  const etapaId = (chave: string) => (etapas ?? []).find((e: any) => e.chave === chave)?.id ?? null;

  // Leads: cities follow the visit plan (route day of that city); the rest rotate over the covered cities.
  const outras = [...CIDADES].reverse();
  const leads: Record<string, { empresa: string; id: string; cidade: string; pessoa: string; nome: string; lat: number; lng: number; cep: string; endereco: string; dono: string }> = {};
  let k = 0;
  for (const [i, l] of LEADS.entries()) {
    const visita: VisitaPlano | null = l.plano ? (plano as any)[l.plano] : l.key === "cliente" ? plano.cliente_atrasada : null;
    const cidade = visita?.cidade ?? outras[k++ % outras.length];
    const base = CIDADES_DEMO[cidade] ?? CIDADES_DEMO["Cabo Frio"];
    const area = areaDaCidade(areas, cidade);
    const lat = base.lat + 0.0021 * (i % 4), lng = base.lng - 0.0017 * (i % 3);
    const nome = demoNome(l.empresa);
    const endereco = `Rua Demonstração, ${100 + i * 10} — ${base.bairro}`;
    const pessoa = await ins("pessoas", { organization_id: org, nome: demoNome(l.contato), whatsapp: fones[i], telefone: fones[i] }, "criar contato");
    const id = await ins("leads", { organization_id: org, title: nome, empresa_nome: nome, company: nome, category: l.categoria, city: cidade, bairro: base.bairro,
      endereco, zip_code: base.cep, latitude: lat, longitude: lng, regiao: area?.name ?? null, vinculo: "DISTRIBUIDORA", pessoa_id: pessoa, cargo_contato: l.cargo,
      contact_name: demoNome(l.contato), contact_phone: fones[i], stage_id: etapaId(l.etapa === "cliente_ativo" ? "teste_amostra" : l.etapa), source: "demo",
      created_by: dono(l.dono), assigned_to: dono(l.dono), description: "Registro de demonstração — pode ser apagado em Configurações → Dados de demonstração.",
      ...(l.cnpj ? { cnpj: cnpjDemo(l.cnpj), razao_social: demoNome(`${l.empresa} Ltda`) } : {}), ...(l.etapa === "perdido" ? { stage: "fechado_perdido" } : {}) }, "criar lead");
    leads[l.key] = { empresa: l.empresa, id, cidade, pessoa, nome, lat, lng, cep: base.cep, endereco: `${endereco}, ${cidade}`, dono: dono(l.dono) };
    await admin.from("lead_timeline").insert({ organization_id: org, lead_id: id, pessoa_id: pessoa, tipo: "criar_lead", origem: "fera", resumo: "Lead de demonstração criado" });
  }

  const visita = async (key: string, p: VisitaPlano, extra: Record<string, unknown>) => {
    const L = leads[key];
    const tipo = (extra.schedule_type as string) ?? "visita_comercial";
    return await ins("schedules", { organization_id: org, lead_id: L.id, title: demoNome(`${tipo === "visita_comercial" ? "Visita comercial" : "Visita técnica"} — ${L.empresa}`),
      scheduled_date: p.data, start_time: p.hora, end_time: maisHora(p.hora, 60), duracao_min: 60, assigned_to: L.dono, created_by: phId,
      schedule_type: "visita_comercial", schedule_subtype: "PROSPECCAO", source: "manual", location: L.endereco, zip_code: L.cep, latitude: L.lat, longitude: L.lng,
      confirmacao_status: "confirmado", ...extra }, "criar visita");
  };
  const checkin = async (scheduleId: string, key: string, quando: string) => {
    const L = leads[key];
    await ins("schedule_checkins", { organization_id: org, schedule_id: scheduleId, user_id: L.dono, checkin_em: quando, latitude: L.lat + 0.0002, longitude: L.lng + 0.0002,
      precisao_m: 12, distancia_m: 30, fora_do_raio: false, sem_permissao: false, destino_sem_coordenadas: false }, "registrar check-in", false);
  };
  const pontosDe = (n: number) => pares.slice(0, n).map((par, i) => ({ local: ["Banheiro social", "Cozinha", "Recepção", "Vestiário"][i] ?? `Ponto ${i + 1}`,
    aparelho: par.aparelho?.name, produto: par.refil.name, quantidade: String(2 + i), ...(par.aparelho ? {} : { sem_aparelho: true }) }));

  // Ontem — concluded, good, with confirmed collection → open proposal with points and catalog prices.
  const pc = plano.ontem_concluida;
  const sConcluida = await visita("concluida", pc, { status: "em_atendimento", checkin_em: isoSP(pc.data, maisHora(pc.hora, 5)), ocorrencia_tipo: "primeira_visita" });
  await checkin(sConcluida, "concluida", isoSP(pc.data, maisHora(pc.hora, 5)));
  const rascunhoOk: RascunhoColeta = {
    contato: { nome: demoNome("Carla Souza"), cargo: "Governanta" }, decisor: { nome: demoNome("Sr. Augusto"), cargo: "Proprietário" },
    pontos: pontosDe(Math.min(3, pares.length)), fluxo_pessoas: "Cerca de 120 hóspedes por dia na alta temporada",
    dores: ["Falta de papel nos banheiros nos fins de semana"], produto_atual: "Papel e sabonete comprados no varejo",
    produtos_oferecidos: [{ produto: pares[0].refil.name, reacao: "Gostou e pediu proposta" }],
    proximos_passos: [{ tipo: "proposta", data: hoje, observacao: "Enviar proposta com os pontos levantados" }],
    observacoes: "Visita de demonstração.",
  };
  const { data: sc } = await admin.from("schedules").select("ocorrencia_codigo").eq("id", sConcluida).single();
  await ins("schedule_evidencias", { organization_id: org, schedule_id: sConcluida, tipo: "texto", origem: "app", autor_id: leads.concluida.dono, itens: [],
    observacoes: "Conversei com a Carla e o Sr. Augusto; querem dispensers nos banheiros, cozinha e recepção.", transcricao: "Conversei com a Carla e o Sr. Augusto; querem dispensers nos banheiros, cozinha e recepção." }, "anexar texto da coleta", false);
  await ins("schedule_proximo_passo", { organization_id: org, schedule_id: sConcluida, tipo: "proposta", descricao: "Enviar proposta com os pontos levantados", autor_id: leads.concluida.dono }, "registrar próximo passo", false);
  const pontosIds: string[] = [];
  for (const [i, p] of (rascunhoOk.pontos ?? []).entries()) {
    pontosIds.push(await ins("comodatos", { organization_id: org, lead_id: leads.concluida.id, status: "PREVISTO", origem: "coleta", origem_schedule_id: sConcluida,
      localizacao_interna: p.local, aparelho_descricao: p.sem_aparelho ? null : p.aparelho ?? null, product_id: pares[i].aparelho?.id ?? null, refil_product_id: pares[i].refil.id,
      quantidade: p.quantidade, notes: `Produto previsto: ${p.produto}`, created_by: leads.concluida.dono, cidade: leads.concluida.cidade }, "criar ponto previsto"));
  }
  const propostaId = await ins("proposals", { organization_id: org, lead_id: leads.concluida.id, origem_schedule_id: sConcluida, created_by: leads.concluida.dono,
    assigned_to: leads.concluida.dono, title: demoNome(`Proposta — ${leads.concluida.empresa}`), status: "rascunho", description: `Gerada da coleta #${sc?.ocorrencia_codigo ?? ""}`,
    valid_until: addDias(hoje, 15), forma_pagamento: "Boleto 28 dias", prazo_entrega: "Até 7 dias úteis após o aceite", periodicidade_manutencao: "mensal", total_value: 0, final_value: 0 }, "criar proposta");
  let total = 0;
  const itensProp = pontosIds.map((cid, i) => {
    const preco = precoDe(pares[i].refil) ?? 0; const qtd = Number(rascunhoOk.pontos![i].quantidade) || 1;
    total += preco * qtd;
    return { proposal_id: propostaId, organization_id: org, product_id: pares[i].refil.id, comodato_id: cid, sort_order: i, quantity: qtd, unit_price: preco,
      total_price: Math.round(preco * qtd * 100) / 100, description: `${pares[i].refil.name} — ${rascunhoOk.pontos![i].local}`.slice(0, 300) };
  });
  const { error: ie } = await admin.from("proposal_items").insert(itensProp);
  if (ie) throw new Falha("criar itens da proposta", ie.code);
  total = Math.round(total * 100) / 100;
  await admin.from("proposals").update({ total_value: total, final_value: total }).eq("id", propostaId);
  const { error: ce } = await admin.from("schedules").update({ status: "concluido", checkout_em: isoSP(pc.data, maisHora(pc.hora, 50)), resultado: "boa", duracao_min: 45,
    resumo_execucao: "Visita boa: levantamento completo e proposta pedida.", coleta_status: "confirmada", coleta_rascunho: rascunhoOk, coleta_pendencias: [],
    coleta_resumo: resumoColeta(sc?.ocorrencia_codigo, rascunhoOk), coleta_confirmada_em: isoSP(pc.data, maisHora(pc.hora, 55)), coleta_confirmada_por: leads.concluida.dono,
    coleta_processada_em: isoSP(pc.data, maisHora(pc.hora, 55)), proposta_id: propostaId }).eq("id", sConcluida);
  if (ce) throw new Falha("concluir visita", ce.code);
  await admin.from("lead_timeline").insert({ organization_id: org, lead_id: leads.concluida.id, tipo: "visita", origem: "fera", resumo: resumoColeta(sc?.ocorrencia_codigo, rascunhoOk).slice(0, 500), proximo_passo: "proposta", referencia_id: sConcluida });

  // Ontem — not done, with reason.
  const pn = plano.ontem_nao_realizada;
  await visita("nao_realizada", pn, { status: "nao_realizado", nao_realizado_motivo: "Estabelecimento fechado: responsável viajando. Remarcar.", ocorrencia_tipo: "primeira_visita" });

  // Hoje — in progress with collection missing information; and one scheduled.
  const pa = plano.hoje_andamento;
  const quando = new Date(Math.min(Date.now() - 20 * 60_000, Date.parse(isoSP(pa.data, maisHora(pa.hora, 5))) || Date.now())).toISOString();
  const sAndamento = await visita("andamento", pa, { status: "em_atendimento", checkin_em: quando, ocorrencia_tipo: "primeira_visita", coleta_status: "coletando" });
  await checkin(sAndamento, "andamento", quando);
  const rascunhoPend: RascunhoColeta = { contato: { nome: demoNome("Jorge Martins") }, fluxo_pessoas: "Cerca de 200 refeições por dia",
    pontos: [{ local: "Banheiros", produto: pares[0].refil.name, quantidade: "3" }, { local: "Cozinha" }] };
  const { data: sa } = await admin.from("schedules").select("ocorrencia_codigo").eq("id", sAndamento).single();
  await ins("schedule_evidencias", { organization_id: org, schedule_id: sAndamento, tipo: "texto", origem: "app", autor_id: leads.andamento.dono, itens: [],
    observacoes: "Falei com o Jorge: 3 banheiros e a cozinha. Ainda não sei quem decide a compra.", transcricao: "Falei com o Jorge: 3 banheiros e a cozinha. Ainda não sei quem decide a compra." }, "anexar texto da coleta", false);
  const { error: pe } = await admin.from("schedules").update({ coleta_status: "rascunho", coleta_rascunho: rascunhoPend,
    coleta_pendencias: pendenciasColeta("primeira_visita", rascunhoPend, { cnpj: false, catalogo: catalogo ?? [] }), coleta_resumo: resumoColeta(sa?.ocorrencia_codigo, rascunhoPend),
    coleta_processada_em: new Date().toISOString() }).eq("id", sAndamento);
  if (pe) throw new Falha("salvar coleta pendente", pe.code);
  await visita("hoje_agendada", plano.hoje_agendada, { status: "agendado", ocorrencia_tipo: "primeira_visita" });

  // Amanhã — test installation with material + invoice pending (trigger opens the Simples Remessa task) and a commercial visit.
  const itensTeste = pares.slice(0, 2).flatMap((par) => [
    ...(par.aparelho ? [{ product_id: par.aparelho.id, descricao: par.aparelho.name, quantidade: "2" }] : []),
    { product_id: par.refil.id, descricao: par.refil.name, quantidade: "2" }]);
  await visita("teste", plano.amanha_teste, { status: "agendado", schedule_type: "visita_tecnica", schedule_subtype: "INSTALACAO", operacao_material: "instalacao_teste",
    tipo_nota: "remessa_teste", itens: itensTeste, title: demoNome(`Instalação de teste — ${leads.teste.empresa}`) });
  await visita("amanha", plano.amanha_comercial, { status: "agendado", ocorrencia_tipo: "primeira_visita" });

  // Lead with a device in test.
  await ins("comodatos", { organization_id: org, lead_id: leads.em_teste.id, status: "EM_TESTE", origem: "campo", localizacao_interna: "Banheiro dos clientes",
    product_id: pares[0].aparelho?.id ?? null, aparelho_descricao: pares[0].aparelho?.name ?? "Dispenser", refil_product_id: pares[0].refil.id, quantidade: "1",
    data_inicio: addDias(hoje, -5), cidade: leads.em_teste.cidade, created_by: leads.em_teste.dono, notes: "Aparelho em teste (demonstração)" }, "criar aparelho em teste");

  // Client: old test return (approved) → conversion by the real function → loan invoice task for the device kept installed; 2 active devices; overdue maintenance.
  const pr = plano.cliente_retorno_teste;
  const sRetorno = await visita("cliente", pr, { status: "em_atendimento", checkin_em: isoSP(pr.data, maisHora(pr.hora, 5)), schedule_subtype: "DIAGNOSTICO",
    title: demoNome(`Retorno do teste — ${leads.cliente.empresa}`), ocorrencia_tipo: "primeira_visita" });
  await ins("schedule_proximo_passo", { organization_id: org, schedule_id: sRetorno, tipo: "proposta", descricao: "Teste aprovado: seguir para proposta", autor_id: leads.cliente.dono }, "registrar próximo passo", false);
  const { error: re } = await admin.from("schedules").update({ status: "concluido", checkout_em: isoSP(pr.data, maisHora(pr.hora, 40)), resultado: "boa", duracao_min: 35,
    resumo_execucao: "Retorno do teste: aprovado, aparelho fica instalado." }).eq("id", sRetorno);
  if (re) throw new Falha("concluir retorno do teste", re.code);
  await ins("comodatos", { organization_id: org, lead_id: leads.cliente.id, status: "EM_TESTE", origem: "campo", localizacao_interna: "Recepção",
    product_id: pares[1].aparelho?.id ?? pares[0].aparelho?.id ?? null, aparelho_descricao: pares[1].aparelho?.name ?? pares[0].aparelho?.name ?? "Dispenser",
    refil_product_id: pares[1].refil.id, quantidade: "1", data_inicio: addDias(pr.data, -15), cidade: leads.cliente.cidade, created_by: leads.cliente.dono, notes: "Teste aprovado (demonstração)" }, "criar aparelho do teste aprovado");
  const { data: conv, error: cvErr } = await caller.rpc("converter_lead_em_cliente", { _lead: leads.cliente.id, _cliente_existente: null, _ignorar_duplicados: true });
  if (cvErr || (conv as any)?.status !== "convertido") throw new Falha("converter lead em cliente", cvErr?.code);
  const clientId = (conv as any).client_id as string;
  await reg("clients", clientId);
  await admin.from("leads").update({ stage_id: etapaId("cliente_ativo") }).eq("id", leads.cliente.id);
  const atrasada = plano.cliente_atrasada;
  for (const [i, par] of pares.slice(0, 2).entries()) {
    await ins("comodatos", { organization_id: org, client_id: clientId, lead_id: leads.cliente.id, status: "ATIVO", origem: "campo", localizacao_interna: ["Banheiro social", "Cozinha"][i],
      product_id: par.aparelho?.id ?? null, aparelho_descricao: par.aparelho?.name ?? "Dispenser", refil_product_id: par.refil.id, quantidade: "2", data_inicio: addDias(hoje, -75),
      ultima_manutencao: addDias(atrasada.data, -30), proxima_manutencao: atrasada.data, periodicidade_manut: "mensal", cidade: leads.cliente.cidade, created_by: leads.cliente.dono,
      notes: "Aparelho em comodato (demonstração)" }, "criar aparelho ativo");
  }
  await ins("schedules", { organization_id: org, client_id: clientId, title: demoNome(`Manutenção — ${leads.cliente.empresa}`), scheduled_date: atrasada.data, start_time: atrasada.hora,
    end_time: maisHora(atrasada.hora, 60), duracao_min: 60, status: "agendado", schedule_type: "manutencao", schedule_subtype: "MANUTENCAO", source: "manual",
    assigned_to: leads.cliente.dono, created_by: phId, location: leads.cliente.endereco, latitude: leads.cliente.lat, longitude: leads.cliente.lng, zip_code: leads.cliente.cep,
    confirmacao_status: "nao_aplicavel" }, "criar manutenção atrasada");

  // Open atendimento waiting for a human (no chat linked: nothing can reach WhatsApp).
  const abertoEm = new Date(Date.now() - 25 * 60_000).toISOString();
  await ins("atendimentos", { organization_id: org, lead_id: leads.atendimento.id, pessoa_id: leads.atendimento.pessoa, empresa: leads.atendimento.nome,
    contato_nome: demoNome("Fernanda Costa"), canal: "WHATSAPP", whatsapp: fones[8], tipo: "transferencia", motivo: "Quer orçamento de papel toalha e sabonete para 3 andares",
    resumo: "Cliente pediu para falar com um consultor (demonstração).", urgencia: "media", status: "aberto", aberto_em: abertoEm, relogio_inicia_em: abertoEm, alerta_nivel: "verde" }, "criar atendimento");
  await admin.from("leads").update({ precisa_humano: true }).eq("id", leads.atendimento.id);

  return {
    leads: LEADS.length, cliente: leads.cliente.nome,
    datas: { ontem: plano.ontem_concluida.data, hoje: plano.hoje_andamento.data, amanha: plano.amanha_teste.data, manutencao_atrasada: atrasada.data },
  };
}
