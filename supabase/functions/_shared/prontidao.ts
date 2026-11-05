// Lote 13: visit readiness (invoice + material), invoice tasks, CNPJ and commercial survey rules.
// Shared by the screens (src/lib/prontidao.ts re-exports) and the server functions. The database trigger
// schedule_prontidao is the source of truth for the stored status; these helpers mirror it for display.

export const FERA_URL = "https://fera.exudustech.com.br";

export type OperacaoMaterial = "instalacao_teste" | "instalacao_definitiva" | "entrega" | "substituicao" | "manutencao_reposicao";
export const OPERACAO_LABEL: Record<OperacaoMaterial, string> = {
  instalacao_teste: "Instalação de teste", instalacao_definitiva: "Instalação definitiva", entrega: "Entrega",
  substituicao: "Substituição de aparelho", manutencao_reposicao: "Manutenção com reposição",
};
export const OPERACOES = Object.keys(OPERACAO_LABEL) as OperacaoMaterial[];

export type TipoNota = "remessa_comodato" | "remessa_teste" | "venda" | "retorno";
export const TIPO_NOTA_LABEL: Record<TipoNota, string> = {
  remessa_comodato: "Remessa em comodato", remessa_teste: "Remessa para teste/demonstração", venda: "Venda", retorno: "Retorno de comodato/teste",
};
export const TIPOS_NOTA = Object.keys(TIPO_NOTA_LABEL) as TipoNota[];

/** Default invoice type per operation (same mapping as the database trigger). */
export function notaPadrao(op: OperacaoMaterial): TipoNota {
  if (op === "instalacao_teste") return "remessa_teste";
  if (op === "instalacao_definitiva" || op === "substituicao") return "remessa_comodato";
  return "venda";
}

/** Operations that make sense for each schedule type. */
export function operacoesPara(scheduleType: string): OperacaoMaterial[] {
  if (scheduleType === "manutencao") return ["manutencao_reposicao", "substituicao"];
  if (scheduleType === "entrega") return ["entrega", "instalacao_definitiva"];
  if (scheduleType === "visita_tecnica") return ["instalacao_teste", "instalacao_definitiva", "substituicao"];
  return [];
}

export type Prontidao = "pronto" | "falta_nota" | "falta_material" | "falta_ambos";
export function calcProntidao(s: { operacao_material?: string | null; nota_status?: string | null; material_status?: string | null }): Prontidao {
  if (!s.operacao_material) return "pronto";
  const nota = s.nota_status !== "anexada"; const mat = s.material_status !== "separado";
  return nota && mat ? "falta_ambos" : nota ? "falta_nota" : mat ? "falta_material" : "pronto";
}
export function prontidaoLabel(p?: string | null): string | null {
  if (p === "falta_ambos") return "Pendente: falta nota e separar material";
  if (p === "falta_nota") return "Pendente: falta nota";
  if (p === "falta_material") return "Pendente: falta separar material";
  return null;
}

/** Billing deadline: day before the visit at 17:00 São Paulo (UTC-3). */
export function prazoNota(scheduledDate: string): Date {
  const d = new Date(`${scheduledDate}T20:00:00Z`);
  return new Date(d.getTime() - 86_400_000);
}

export interface ItemOperacao { product_id?: string | null; descricao: string; quantidade: string }
export function itensTexto(itens: unknown): string {
  const list = Array.isArray(itens) ? itens as ItemOperacao[] : [];
  return list.length ? list.map((i) => `${i.quantidade}x ${i.descricao}`).join(", ") : "itens a definir";
}
export function tarefaMessage(kind: "nova" | "d1", t: { schedule_id: string; empresa_nome?: string | null; tipo_nota: string; data_visita: string; itens: unknown }): string {
  const data = t.data_visita.split("-").reverse().join("/");
  return [kind === "nova" ? "🧾 Nova nota para emitir" : "⏰ Nota pendente — visita amanhã",
    `Cliente: ${t.empresa_nome ?? "Não informado"}`, `Tipo: ${TIPO_NOTA_LABEL[t.tipo_nota as TipoNota] ?? t.tipo_nota}`,
    `Itens: ${itensTexto(t.itens)}`, `Visita: ${data} · prazo ${kind === "nova" ? "véspera até 17h" : "hoje até 17h"}`,
    `Ver no Fera: ${FERA_URL}/tarefas`].join("\n");
}

// ─── CNPJ ───────────────────────────────────────────────────────────────────
export function cnpjDigits(v?: string | null): string { return (v ?? "").replace(/\D/g, ""); }
export function cnpjValido(v?: string | null): boolean {
  const d = cnpjDigits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
export function formatCnpj(v?: string | null): string {
  const d = cnpjDigits(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}
/** Only an active registration may receive an invoice. */
export function situacaoBloqueia(situacao?: string | null): boolean {
  const s = (situacao ?? "").toUpperCase();
  return !!s && s !== "ATIVA";
}

// ─── Commercial survey and product mix ─────────────────────────────────────
export const SEGMENTOS = ["Restaurante/Bar", "Hotel/Pousada", "Clínica/Hospital", "Escritório", "Escola", "Academia", "Comércio/Loja", "Condomínio", "Indústria", "Outro"] as const;
export function porteLabel(segmento?: string | null): string {
  if (segmento === "Restaurante/Bar") return "Lugares";
  if (segmento === "Hotel/Pousada") return "Quartos";
  if (segmento === "Clínica/Hospital") return "Leitos/consultórios";
  if (segmento === "Escola") return "Alunos";
  return "Funcionários";
}
export const PROBLEMAS = ["Odor", "Falta de papel/sabonete", "Desperdício", "Custo alto", "Fornecedor ruim", "Limpeza pesada", "Outro"] as const;
export interface Levantamento {
  segmento?: string; porte?: number | null; banheiros_f?: number | null; banheiros_m?: number | null; banheiros_pne?: number | null;
  fluxo?: "baixo" | "medio" | "alto"; problema?: string; produtos_atuais?: string; fornecedor?: string; decisor?: string; cozinha?: boolean;
}
export interface SugestaoMix { linha: string; motivo: string; termos: string[] }

/** Simple rules by segment/flow/problem. Suggestions are product lines + search terms, never prices. */
export function sugerirMix(l: Levantamento): SugestaoMix[] {
  const out: SugestaoMix[] = [];
  const add = (linha: string, motivo: string, termos: string[]) => { if (!out.some((o) => o.linha === linha)) out.push({ linha, motivo, termos }); };
  const banheiros = (l.banheiros_f ?? 0) + (l.banheiros_m ?? 0) + (l.banheiros_pne ?? 0);
  if (l.problema === "Odor" || l.fluxo === "alto" && banheiros > 0) add("Aromatização (Ekkoa)", "Controle de odor nos ambientes", ["ekkoa", "aromatizador", "neutralizador"]);
  if (banheiros > 0 && (l.fluxo === "medio" || l.fluxo === "alto" || ["Restaurante/Bar", "Hotel/Pousada", "Clínica/Hospital", "Comércio/Loja", "Academia", "Escola"].includes(l.segmento ?? "")))
    add("Papel toalha + sabonete", "Banheiro com público", ["papel toalha", "interfolhado", "sabonete"]);
  if (l.problema === "Falta de papel/sabonete" || l.problema === "Desperdício") add("Dispensers controlados", "Reduz desperdício e falta de insumo", ["dispenser", "papel higiênico rolão"]);
  if (l.cozinha || l.segmento === "Restaurante/Bar" || l.problema === "Limpeza pesada") add("Química de limpeza (Diversey)", "Cozinha/limpeza pesada", ["diversey", "desengordurante", "detergente"]);
  if (l.segmento === "Clínica/Hospital") add("Higienização de mãos", "Ambiente de saúde", ["álcool gel", "antisséptico"]);
  if (!out.length) add("Papel toalha + sabonete", "Mix básico de higiene", ["papel toalha", "sabonete"]);
  return out;
}

/** 17h summary: tomorrow's operations without an attached invoice (one message per organization). */
export function resumoNotasAmanha(data: string, ops: { id: string; codigo?: string | null; hora: string; cliente: string; tipo_nota?: string | null }[]): string {
  return [`🧾 Operações de amanhã (${data.split("-").reverse().join("/")}) sem nota anexada: ${ops.length}`,
    ...ops.map((o) => `• ${o.hora} ${o.cliente}${o.codigo ? ` #${o.codigo}` : ""} — ${TIPO_NOTA_LABEL[o.tipo_nota as TipoNota] ?? "nota"}: ${FERA_URL}/agenda?agendamento=${o.id}`),
    `Anexar em: ${FERA_URL}/tarefas`].join("\n");
}

/** Check-in is blocked when the operation needs an invoice that is not attached, unless the organization disabled it or a manager released it. */
export function checkinBloqueadoPorNota(s: { exige_nota?: boolean | null; nota_status?: string | null; checkin_liberado_em?: string | null }, bloquearOrg: boolean | null | undefined): boolean {
  return bloquearOrg !== false && !!s.exige_nota && s.nota_status !== "anexada" && !s.checkin_liberado_em;
}
