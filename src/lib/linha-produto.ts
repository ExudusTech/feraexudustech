export type LinhaProduto = "EKKOA" | "HIGIENE_MAOS" | "PAPEL" | "GEL" | "QUIMICO" | "OUTRO";

export const LINHA_PRODUTO_VALUES: LinhaProduto[] = [
  "EKKOA",
  "HIGIENE_MAOS",
  "PAPEL",
  "GEL",
  "QUIMICO",
  "OUTRO",
];

export const LINHA_LABEL: Record<LinhaProduto, string> = {
  EKKOA: "Ekkoa",
  HIGIENE_MAOS: "Higiene de Mãos",
  PAPEL: "Papel",
  GEL: "Gel",
  QUIMICO: "Químico",
  OUTRO: "Outro",
};

// Tailwind class strings using semantic-ish palettes; kept as chip badges over dark bg
export const LINHA_BADGE_CLASS: Record<LinhaProduto, string> = {
  EKKOA: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  HIGIENE_MAOS: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
  PAPEL: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  GEL: "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30",
  QUIMICO: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
  OUTRO: "bg-muted text-muted-foreground border border-border",
};

export function linhaLabel(v?: string | null) {
  if (!v) return "—";
  return LINHA_LABEL[v as LinhaProduto] ?? v;
}

export function linhaBadgeClass(v?: string | null) {
  if (!v) return "bg-muted text-muted-foreground border border-border";
  return LINHA_BADGE_CLASS[v as LinhaProduto] ?? "bg-muted text-muted-foreground border border-border";
}

// Schedule subtypes
export type ScheduleSubtype =
  | "PROSPECCAO"
  | "DIAGNOSTICO"
  | "INSTALACAO"
  | "MANUTENCAO"
  | "REPOSICAO"
  | "COBRANCA"
  | "OUTRO";

export const SCHEDULE_SUBTYPE_VALUES: ScheduleSubtype[] = [
  "PROSPECCAO",
  "DIAGNOSTICO",
  "INSTALACAO",
  "MANUTENCAO",
  "REPOSICAO",
  "COBRANCA",
  "OUTRO",
];

export const SCHEDULE_SUBTYPE_LABEL: Record<ScheduleSubtype, string> = {
  PROSPECCAO: "Prospecção",
  DIAGNOSTICO: "Diagnóstico",
  INSTALACAO: "Instalação",
  MANUTENCAO: "Manutenção",
  REPOSICAO: "Reposição",
  COBRANCA: "Cobrança",
  OUTRO: "Outro",
};

export const SCHEDULE_SUBTYPE_BADGE_CLASS: Record<ScheduleSubtype, string> = {
  PROSPECCAO: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  DIAGNOSTICO: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
  INSTALACAO: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
  MANUTENCAO: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  REPOSICAO: "bg-green-500/15 text-green-400 border border-green-500/30",
  COBRANCA: "bg-red-500/15 text-red-400 border border-red-500/30",
  OUTRO: "bg-muted text-muted-foreground border border-border",
};

export function scheduleSubtypeLabel(v?: string | null) {
  if (!v) return "—";
  return SCHEDULE_SUBTYPE_LABEL[v as ScheduleSubtype] ?? v;
}

export function scheduleSubtypeBadgeClass(v?: string | null) {
  if (!v) return "bg-muted text-muted-foreground border border-border";
  return SCHEDULE_SUBTYPE_BADGE_CLASS[v as ScheduleSubtype] ?? "bg-muted text-muted-foreground border border-border";
}
