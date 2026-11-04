// Pure helpers for internal (Fera-created) schedule notifications. No Deno/npm imports so vitest can load it.
export type ScheduleEvent = "agendamento_comercial" | "agendamento_tecnico";
export const FERA_URL = "https://fera.exudustech.com.br";

/** Decides which team event an internally created schedule triggers, or null when it should not notify. */
export function scheduleEvent(type?: string | null, subtype?: string | null, source?: string | null, selfAssigned = false): ScheduleEvent | null {
  if ((source ?? "").toLowerCase() === "flora") return null; // the mcp already notifies Flora bookings
  // Maintenance the consultant opens for themself in the field: nobody needs a creation alert (check-in/closing still alert).
  const isManut = (subtype ?? "").toUpperCase() === "MANUTENCAO" || /manutenc/.test((type ?? "").toLowerCase());
  if (isManut && ((source ?? "").toLowerCase() === "campo" || selfAssigned)) return null;
  const t = (type ?? "").toLowerCase();
  const st = (subtype ?? "").toUpperCase();
  if (st === "REPOSICAO" || t.includes("entrega") || t.includes("nf")) return null;
  if (st === "MANUTENCAO" || st === "DIAGNOSTICO" || st === "INSTALACAO" ||
    /manutencao|tecnica|instalacao|teste|retirada/.test(t)) return "agendamento_tecnico";
  return "agendamento_comercial";
}

const SERVICE_LABEL: Record<string, string> = {
  instalacao: "Instalação", instalacao_teste: "Instalação de teste", teste: "Instalação de teste",
  manutencao: "Manutenção", retirada: "Retirada", visita_tecnica: "Visita técnica", visita_comercial: "Visita comercial",
  PROSPECCAO: "Prospecção", DIAGNOSTICO: "Diagnóstico", INSTALACAO: "Instalação", MANUTENCAO: "Manutenção", COBRANCA: "Cobrança",
};

/** Human service name (Manutenção, Instalação…) for a schedule type/subtype. */
export function serviceLabel(type?: string | null, subtype?: string | null, fallback = "Visita técnica"): string {
  return SERVICE_LABEL[(subtype ?? "").trim()] || SERVICE_LABEL[(type ?? "").trim()] || fallback;
}

export interface InternalSchedule {
  id: string; title?: string | null; scheduled_date?: string | null; start_time?: string | null;
  location?: string | null; schedule_type?: string | null; schedule_subtype?: string | null;
  client_name?: string | null; maps_url?: string | null; link_path: string;
}

export function scheduleMessage(event: ScheduleEvent, s: InternalSchedule): string {
  const clean = (v: unknown) => typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, 240) : "";
  const tecnico = event === "agendamento_tecnico";
  const nome = tecnico ? serviceLabel(s.schedule_type, s.schedule_subtype) : "Visita comercial";
  const lines = [tecnico ? `🔧 Nova ${nome.toLowerCase()} agendada` : "📅 Nova visita comercial agendada",
    `Cliente: ${clean(s.client_name) || clean(s.title) || "Não informado"}`];
  const where = clean(s.location);
  if (where) lines.push(`Onde: ${where}`);
  const map = clean(s.maps_url) || (where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}` : "");
  if (map) lines.push(`Mapa: ${map}`);
  const d = new Date(`${clean(s.scheduled_date)}T12:00:00Z`);
  const date = Number.isFinite(d.getTime())
    ? d.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" }) : clean(s.scheduled_date);
  lines.push(`Quando: ${date}${s.start_time ? ` às ${clean(s.start_time).slice(0, 5)}` : ""}`);
  const service = SERVICE_LABEL[clean(s.schedule_subtype)] || SERVICE_LABEL[clean(s.schedule_type)] || clean(s.schedule_type);
  if (service) lines.push(`Tipo de serviço: ${service}`);
  return [...lines, `Ver no Fera: ${FERA_URL}${s.link_path}`, "", "(Mensagem automática — não responda aqui; abra o link.)"].join("\n");
}
