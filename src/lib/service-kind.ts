/** Field-friendly service type for a schedule, derived from its existing type/subtype. */
export type ServiceKind = "Visita comercial" | "Visita técnica" | "Entrega" | "Manutenção";

export const SERVICE_KINDS: ServiceKind[] = ["Visita comercial", "Visita técnica", "Entrega", "Manutenção"];
export const SCHEDULE_TYPE_OPTIONS = [
  { value: "visita_comercial", label: "Visita comercial" },
  { value: "visita_tecnica", label: "Visita técnica" },
  { value: "entrega", label: "Entrega" },
  { value: "manutencao", label: "Manutenção" },
];

export function serviceKind(type?: string | null, subtype?: string | null): ServiceKind {
  const t = (type ?? "").toLowerCase();
  const st = (subtype ?? "").toUpperCase();
  if (st === "MANUTENCAO" || t.includes("manutencao")) return "Manutenção";
  if (st === "REPOSICAO" || t.includes("entrega") || t.includes("nf")) return "Entrega";
  if (st === "PROSPECCAO" || st === "COBRANCA" || t.includes("comercial")) return "Visita comercial";
  if (st === "DIAGNOSTICO" || st === "INSTALACAO" || t.includes("tecnica") || t.includes("instalacao")) return "Visita técnica";
  return "Visita comercial";
}

/** Digits-only phone with Brazil country code, for tel: and wa.me links. */
export function normalizePhoneBR(raw?: string | null): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

export function mapsLink(address?: string | null): string | null {
  const a = (address ?? "").trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
}

/** Extracts "Telefone: ..." or "Mapa: <url>" values that Flora writes into notes. */
export function fromNotes(notes: string | null | undefined, label: "Telefone" | "Mapa"): string | null {
  const m = new RegExp(`${label}:\\s*(\\S[^\\n]*)`, "i").exec(notes ?? "");
  return m ? m[1].trim() : null;
}
