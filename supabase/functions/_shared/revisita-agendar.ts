// Books the client's concentrated revisit (one maintenance visit per client): attaches the due devices to an open technical visit
// in the period, else moves the plan's open visit, else creates one. Shared by visita-acoes (closing), base-instalada (manager) and
// confirmar-visitas (daily). Takes the service-role client; callers check the user's access first.
import { addDias } from "./agenda-slot.ts";
import { areaDoCliente, cidadeChave, parseDiaSemana } from "./base-instalada.ts";
import { agendaDoPlano, aparelhosDaVisita, aposVisita, planejarRevisita, type AgendaCliente, type Revisita } from "./revisita.ts";
import { nextMaintenance } from "./visit-exec.ts";

export const hojeSP = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const ABERTAS = ["agendado", "confirmado"];
const EM_USO = ["ATIVO", "EM_TESTE"];

export type StatusRevisita = "prevista" | "agendada" | "anexada" | "reagendada" | "aguardando_data" | "sem_aparelhos" | "sem_plano" | "erro";
export interface RevisitaResultado { status: StatusRevisita; data?: string | null; schedule_id?: string | null; aparelhos?: string[]; codigo?: string | null }

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function contextoRevisita(admin: Admin, org: string, clientId: string, desde: string) {
  const [{ data: plano }, { data: cliente }, { data: pts }, { data: areas }, { data: ultima }] = await Promise.all([
    admin.from("planos_manutencao").select("id, consultor_id, hora_inicio, duracao_min, modo_agenda, regra_data, proxima_data, dia_mes, intervalo_dias, data_inicio, frequencia")
      .eq("client_id", clientId).eq("organization_id", org).eq("ativo", true).limit(1).maybeSingle(),
    admin.from("clients").select("id, name, city, zip_code, address, latitude, longitude, assigned_user_id").eq("id", clientId).eq("organization_id", org).maybeSingle(),
    admin.from("comodatos").select("id, proxima_manutencao, periodicidade_manut, linha_produto, refil_product_id, quantidade, localizacao_interna, status")
      .eq("client_id", clientId).eq("organization_id", org).in("status", EM_USO),
    admin.from("ekkoa_coverage_areas").select("name, city, dia_semana, zip_code_start, zip_code_end").eq("organization_id", org).eq("is_active", true),
    admin.from("schedules").select("scheduled_date").eq("client_id", clientId).eq("organization_id", org).eq("schedule_type", "manutencao").eq("status", "concluido")
      .order("scheduled_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: hol } = await admin.from("holidays").select("date, city").or(`organization_id.is.null,organization_id.eq.${org}`).gte("date", desde).lte("date", addDias(desde, 430));
  const cidade = cidadeChave(cliente?.city);
  const set = new Set<string>((hol ?? []).filter((h: any) => !h.city || cidadeChave(h.city) === cidade).map((h: any) => h.date));
  const area = cliente ? areaDoCliente(areas ?? [], cliente.zip_code, cliente.city) : null;
  const agenda: AgendaCliente = agendaDoPlano(plano, parseDiaSemana(area?.dia_semana), ultima?.scheduled_date ?? null);
  return { plano, cliente, pontos: (pts ?? []) as any[], agenda, area, bloqueado: (d: string) => set.has(d) };
}

/** Start time on `data`: the plan's hour, moved forward while the consultant already has a visit at that time. */
async function horaLivre(admin: Admin, consultor: string | null, data: string, hora: string, passo: number, ignorar?: string | null): Promise<string> {
  if (!consultor) return hora;
  const { data: busy } = await admin.from("schedules").select("id, start_time").eq("assigned_to", consultor).eq("scheduled_date", data).in("status", [...ABERTAS, "em_atendimento"]);
  const taken = new Set((busy ?? []).filter((x: any) => x.id !== ignorar).map((x: any) => String(x.start_time ?? "").slice(0, 5)));
  let [h, m] = hora.split(":").map(Number); let out = hora;
  while (taken.has(out) && h < 18) { m += passo; h += Math.floor(m / 60); m %= 60; out = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
  return out;
}

export interface AgendarRevisitaOpts {
  org: string; clientId: string; userId?: string | null;
  desde?: string;               // first day searched (default tomorrow, São Paulo)
  atendidos?: string[];         // devices serviced in the visit being closed (dry run before the dates are written)
  dryRun?: boolean;             // only compute the date and the devices
  ignorarScheduleId?: string | null;
}

export async function agendarRevisitaCliente(admin: Admin, o: AgendarRevisitaOpts): Promise<RevisitaResultado> {
  const hoje = hojeSP();
  const desde = o.desde ?? addDias(hoje, 1);
  const ctx = await contextoRevisita(admin, o.org, o.clientId, desde);
  if (!ctx.plano || !ctx.cliente) return { status: "sem_plano" };
  if (!ctx.pontos.length) return { status: "sem_aparelhos" };
  let aparelhos = ctx.pontos.map((p) => ({ id: p.id as string, proxima: p.proxima_manutencao as string | null, periodicidade: p.periodicidade_manut as string | null }));
  if (o.atendidos?.length) aparelhos = aposVisita(aparelhos, o.atendidos, hoje, nextMaintenance);
  const input = { desde, agenda: ctx.agenda, aparelhos, bloqueado: ctx.bloqueado };
  const r: Revisita | null = planejarRevisita(input);
  if (!r) return { status: "aguardando_data", data: null };
  if (o.dryRun) return { status: "prevista", data: r.data, aparelhos: r.aparelhos };

  const plano = ctx.plano; const c = ctx.cliente;
  const consultor = plano.consultor_id ?? c.assigned_user_id ?? o.userId ?? null;
  let q = admin.from("schedules").select("id, scheduled_date, start_time, plano_manutencao_id, aparelhos_previstos, checkin_em, ocorrencia_codigo")
    .eq("organization_id", o.org).eq("client_id", o.clientId).eq("schedule_type", "manutencao").in("status", ABERTAS).gte("scheduled_date", desde).order("scheduled_date");
  if (o.ignorarScheduleId) q = q.neq("id", o.ignorarScheduleId);
  const { data: abertas } = await q;
  const lista = (abertas ?? []) as any[];
  const cancelarOutras = async (manter: string) => {
    const outras = lista.filter((s) => s.id !== manter && s.plano_manutencao_id === plano.id && !s.checkin_em).map((s) => s.id);
    if (outras.length) await admin.from("schedules").update({ status: "cancelado", notes: "Revisita concentrada: substituída pela visita única do cliente" }).in("id", outras).in("status", ABERTAS);
  };
  // 1) An open technical visit in the period (on or before the date) takes the due devices — no duplicate visit.
  const antes = lista.filter((s) => s.scheduled_date <= r.data);
  for (const s of antes.reverse()) {
    const ids = aparelhosDaVisita(s.scheduled_date, input);
    if (!ids.length) continue;
    const uniao = [...new Set([...(s.aparelhos_previstos ?? []), ...ids])];
    const { error } = await admin.from("schedules").update({ aparelhos_previstos: uniao }).eq("id", s.id);
    if (error) { console.error("[revisita] anexar", error.code); return { status: "erro" }; }
    await cancelarOutras(s.id);
    return { status: "anexada", data: s.scheduled_date, schedule_id: s.id, aparelhos: uniao, codigo: s.ocorrencia_codigo ?? null };
  }
  const passo = Math.max(30, Number(plano.duracao_min) || 60);
  const horaPlano = String(plano.hora_inicio ?? "09:00").slice(0, 5);
  // 2) The plan's own open visit later than needed moves to the right date.
  const doPlano = lista.find((s) => s.plano_manutencao_id === plano.id && !s.checkin_em);
  if (doPlano) {
    await cancelarOutras(doPlano.id);
    const hora = doPlano.scheduled_date === r.data ? String(doPlano.start_time ?? horaPlano).slice(0, 5) : await horaLivre(admin, consultor, r.data, horaPlano, passo, doPlano.id);
    const { error } = await admin.from("schedules").update({ scheduled_date: r.data, start_time: hora, aparelhos_previstos: r.aparelhos }).eq("id", doPlano.id);
    if (error) { console.error("[revisita] mover", error.code); return { status: "erro" }; }
    return { status: "reagendada", data: r.data, schedule_id: doPlano.id, aparelhos: r.aparelhos, codigo: doPlano.ocorrencia_codigo ?? null };
  }
  // 3) New visit. Ekkoa (aromatização): every cycle replaces the refill → the visit carries a sale invoice for those points.
  const ekkoa = ctx.pontos.filter((p) => p.linha_produto === "EKKOA" && p.status === "ATIVO" && r.aparelhos.includes(p.id));
  const itens = ekkoa.map((k) => ({ product_id: k.refil_product_id ?? null, descricao: `Refil Ekkoa${k.localizacao_interna ? ` — ${k.localizacao_interna}` : ""}`, quantidade: String(k.quantidade ?? "1") }));
  const hora = await horaLivre(admin, consultor, r.data, horaPlano, passo);
  const { data: novo, error } = await admin.from("schedules").insert({ organization_id: o.org, client_id: o.clientId, plano_manutencao_id: plano.id,
    title: `Manutenção — ${c.name ?? ""}`, scheduled_date: r.data, start_time: hora, status: "agendado", schedule_type: "manutencao", schedule_subtype: "MANUTENCAO",
    source: "plano", assigned_to: consultor, created_by: o.userId ?? null, location: c.address ?? null, zip_code: c.zip_code ?? null, latitude: c.latitude ?? null, longitude: c.longitude ?? null,
    confirmacao_status: "nao_aplicavel", aparelhos_previstos: r.aparelhos,
    ...(itens.length ? { operacao_material: "manutencao_reposicao", tipo_nota: "venda", itens, ocorrencia_tipo: "manutencao_preventiva" } : {}) })
    .select("id, ocorrencia_codigo").single();
  if (error) { console.error("[revisita] criar", error.code); return { status: "erro" }; }
  return { status: "agendada", data: r.data, schedule_id: novo.id, aparelhos: r.aparelhos, codigo: novo.ocorrencia_codigo ?? null };
}
