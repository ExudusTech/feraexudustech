/**
 * Single place for "occurrence type → color" (Agenda, Hoje, lists and the route map).
 * Lead phase uses warm tones (not a client yet); client operation uses green/blue.
 * The actual colors are CSS tokens in index.css (--oc-<key> / --oc-<key>-fg), exposed to Tailwind as `oc-<key>`.
 * To change a color, edit the token; to change which visits get it, edit corDaOcorrencia.
 */
export type CorOcorrencia = "lead" | "teste" | "ativacao" | "manutencao" | "recarga" | "cliente" | "outros";

export interface CorInfo {
  /** Legend text. */
  label: string;
  /** Tailwind classes (full literals so the build keeps them). */
  dot: string; chip: string; borda: string;
  /** CSS colors for places that need a raw value (map markers). */
  fundo: string; texto: string;
}

export const CORES_OCORRENCIA: Record<CorOcorrencia, CorInfo> = {
  lead: { label: "Primeiro atendimento / lead", dot: "bg-oc-lead", chip: "bg-oc-lead/15 border-oc-lead/60", borda: "border-l-oc-lead", fundo: "hsl(var(--oc-lead))", texto: "hsl(var(--oc-lead-fg))" },
  teste: { label: "Instalação de teste", dot: "bg-oc-teste", chip: "bg-oc-teste/15 border-oc-teste/60", borda: "border-l-oc-teste", fundo: "hsl(var(--oc-teste))", texto: "hsl(var(--oc-teste-fg))" },
  ativacao: { label: "Ativação da base", dot: "bg-oc-ativacao", chip: "bg-oc-ativacao/20 border-oc-ativacao/70", borda: "border-l-oc-ativacao", fundo: "hsl(var(--oc-ativacao))", texto: "hsl(var(--oc-ativacao-fg))" },
  manutencao: { label: "Manutenção preventiva", dot: "bg-oc-manutencao", chip: "bg-oc-manutencao/15 border-oc-manutencao/60", borda: "border-l-oc-manutencao", fundo: "hsl(var(--oc-manutencao))", texto: "hsl(var(--oc-manutencao-fg))" },
  recarga: { label: "Recarga / entrega de refil", dot: "bg-oc-recarga", chip: "bg-oc-recarga/15 border-oc-recarga/60", borda: "border-l-oc-recarga", fundo: "hsl(var(--oc-recarga))", texto: "hsl(var(--oc-recarga-fg))" },
  cliente: { label: "Comercial a cliente", dot: "bg-oc-cliente", chip: "bg-oc-cliente/15 border-oc-cliente/60", borda: "border-l-oc-cliente", fundo: "hsl(var(--oc-cliente))", texto: "hsl(var(--oc-cliente-fg))" },
  outros: { label: "Outros", dot: "bg-oc-outros", chip: "bg-oc-outros/15 border-oc-outros/60", borda: "border-l-oc-outros", fundo: "hsl(var(--oc-outros))", texto: "hsl(var(--oc-outros-fg))" },
};

/** Legend / count order: lead phase first, then client operation. */
export const ORDEM_CORES: CorOcorrencia[] = ["lead", "teste", "ativacao", "manutencao", "recarga", "cliente", "outros"];

export interface OcorrenciaLike {
  schedule_type?: string | null; schedule_subtype?: string | null; ocorrencia_tipo?: string | null;
  operacao_material?: string | null; client_id?: string | null; lead_id?: string | null;
}

/** Color group of a visit, from its occurrence type (or, for older visits, its type/subtype and link). */
export function corDaOcorrencia(s: OcorrenciaLike): CorOcorrencia {
  const tipo = (s.ocorrencia_tipo ?? "").toLowerCase();
  const sub = (s.schedule_subtype ?? "").toUpperCase();
  const type = (s.schedule_type ?? "").toLowerCase();
  const material = (s.operacao_material ?? "").toLowerCase();
  if (tipo === "ativacao_base") return "ativacao";
  if (tipo === "instalacao_teste" || material === "instalacao_teste") return "teste";
  if (tipo === "manutencao_preventiva") return "manutencao";
  if (tipo === "entrega" || /refil|recarga/.test(material)) return "recarga";
  // A first visit tied only to a client (no lead) is a commercial visit to a client.
  if (tipo === "primeira_visita") return s.client_id && !s.lead_id ? "cliente" : "lead";
  if (tipo) return "outros";
  if (sub === "INSTALACAO" && !s.client_id) return "teste";
  if (sub === "REPOSICAO" || type.includes("entrega") || /refil|recarga/.test(type)) return "recarga";
  if (sub === "MANUTENCAO" || type.includes("manutencao")) return "manutencao";
  if (sub === "PROSPECCAO" || sub === "COBRANCA" || type.includes("comercial")) return s.client_id && !s.lead_id ? "cliente" : "lead";
  return "outros";
}

export const corInfo = (s: OcorrenciaLike): CorInfo => CORES_OCORRENCIA[corDaOcorrencia(s)];

/** Per-color counts (only colors present), in legend order. */
export function contarPorCor(list: OcorrenciaLike[]): { cor: CorOcorrencia; n: number }[] {
  const n = new Map<CorOcorrencia, number>();
  list.forEach((s) => { const c = corDaOcorrencia(s); n.set(c, (n.get(c) ?? 0) + 1); });
  return ORDEM_CORES.filter((c) => n.has(c)).map((cor) => ({ cor, n: n.get(cor)! }));
}
