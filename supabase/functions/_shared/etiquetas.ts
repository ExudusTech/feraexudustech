// Numbered QR labels (decided 10/11): one label per device, the number belongs to the device forever (comodatos.etiqueta_numero).
// Pure helpers shared by the app (src/lib/etiquetas.ts re-exports), base-instalada and etiqueta-publica. No imports.

export const ETIQUETA_URL_BASE = "https://fera.exudustech.com.br/q/";
export const ETIQUETA_MAX = 999999;
export const ETIQUETA_DEMO_INICIO = 900001;
export const FAIXA_MAX = 2000;

export function formatEtiqueta(n: number | null | undefined): string { return n ? String(n).padStart(6, "0") : ""; }
export function etiquetaUrl(n: number): string { return `${ETIQUETA_URL_BASE}${formatEtiqueta(n)}`; }

/** Number from a scanned QR (our URL) or a typed number; null when it is not one of our labels. */
export function parseEtiqueta(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const url = s.match(/\/q\/(\d{1,6})(?:[/?#].*)?$/i);
  const digits = url ? url[1] : /^[\d\s.-]{1,9}$/.test(s) ? s.replace(/\D/g, "") : "";
  if (!digits || digits.length > 6) return null;
  const n = parseInt(digits, 10);
  return n >= 1 && n <= ETIQUETA_MAX ? n : null;
}

/** wa.me number (with Brazil's 55) from the WhatsApp configured in Settings → Proposal PDF. */
export function waNumero(whatsapp: string | null | undefined): string | null {
  let d = String(whatsapp ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

export function waLink(numero: string, texto: string): string { return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`; }

export interface FaixaGerada { inicio: number; fim: number }
/** Error for a print range, or null: valid numbers, at most FAIXA_MAX labels and no overlap with a range already generated. */
export function faixaErro(inicio: number, fim: number, existentes: FaixaGerada[]): string | null {
  if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 1 || fim > ETIQUETA_MAX || fim < inicio) return "Faixa inválida";
  if (fim - inicio + 1 > FAIXA_MAX) return `Gere no máximo ${FAIXA_MAX} etiquetas por vez`;
  const f = existentes.find((e) => inicio <= e.fim && fim >= e.inicio);
  return f ? `Faixa já gerada: ${formatEtiqueta(f.inicio)} a ${formatEtiqueta(f.fim)}` : null;
}
export function proximoInicio(existentes: FaixaGerada[]): number {
  return existentes.filter((e) => e.fim < ETIQUETA_DEMO_INICIO).reduce((m, e) => Math.max(m, e.fim), 0) + 1;
}

/** A4 sheet layout for labels of w×h mm with crop marks in the margin (min. 8 mm). */
export function layoutEtiquetas(w: number, h: number, pagina = { w: 210, h: 297 }, margemMin = 8) {
  const colunas = Math.max(1, Math.floor((pagina.w - 2 * margemMin) / w));
  const linhas = Math.max(1, Math.floor((pagina.h - 2 * margemMin) / h));
  return { colunas, linhas, porPagina: colunas * linhas, x0: (pagina.w - colunas * w) / 2, y0: (pagina.h - linhas * h) / 2 };
}

/** What a scan inside an open occurrence can do with the device found (or with a free number). */
export type AcaoEtiqueta = "instalar" | "vincular" | "avaliar" | "trocar_ponto" | "retirar" | "substituir";
export interface AparelhoEtiqueta { status: string; deste_local: boolean }
export const ACAO_ETIQUETA_LABEL: Record<AcaoEtiqueta, string> = {
  instalar: "Instalar e ativar", vincular: "Vincular a um ponto sem número", avaliar: "Avaliar", trocar_ponto: "Trocar de ponto",
  retirar: "Retirar (volta ao estoque)", substituir: "Substituir por outro aparelho",
};
export function acoesEtiqueta(operacao: string | null | undefined, ap: AparelhoEtiqueta | null): { acoes: AcaoEtiqueta[]; aviso?: string } {
  const instalacao = operacao === "instalacao_teste" || operacao === "instalacao_definitiva" || operacao === "entrega";
  if (!ap) return { acoes: instalacao ? ["instalar", "vincular"] : ["vincular", "instalar"] };
  const st = ap.status.toUpperCase();
  if (st === "ENCERRADO") return { acoes: ["instalar"] }; // back in stock with its number: can be installed again anywhere
  if (!ap.deste_local) return { acoes: [], aviso: "Esta etiqueta pertence a um aparelho de outro cliente. Confira o número." };
  if (st === "SEPARADO" || st === "PREVISTO") return { acoes: ["instalar"] };
  if (st === "RETIRADO") return { acoes: [], aviso: "Aparelho já retirado, aguardando a nota de devolução." };
  if (st === "EM_TESTE") return { acoes: ["avaliar", "trocar_ponto", "substituir"], aviso: "Aparelho em teste: para retirar, feche o teste como não aprovado (a nota de devolução devolve ao estoque)." };
  return { acoes: operacao === "substituicao" ? ["substituir", "avaliar", "trocar_ponto", "retirar"] : ["avaliar", "trocar_ponto", "substituir", "retirar"] };
}

export const STATUS_APARELHO_LABEL: Record<string, string> = {
  ATIVO: "Ativo", EM_TESTE: "Em teste", SEPARADO: "Separado", PREVISTO: "Previsto", RETIRADO: "Retirado (aguarda nota)", ENCERRADO: "No estoque", SUSPENSO: "Suspenso", PENDENTE: "Pendente",
};

/** Fallback WhatsApp when Settings → Proposal PDF has none (same as DEFAULT_PROPOSTA_CONFIG.whatsapp, test-enforced). */
export const WHATSAPP_PADRAO = "(22) 99266-8769";
/** Public lookups per IP per hour before the message stops naming the establishment (anti-enumeration). */
export const LIMITE_CONSULTAS_HORA = 30;

/** A new number is accepted only inside a lot released by Fera (or the demo range). */
export function numeroEmLote(n: number, lotes: FaixaGerada[]): boolean {
  return n >= ETIQUETA_DEMO_INICIO || lotes.some((l) => n >= l.inicio && n <= l.fim);
}
/** Used × available per lot from the numbers already linked to devices. */
export function usoDoLote(lote: FaixaGerada, usados: number[]): { total: number; usados: number; disponiveis: number } {
  const total = lote.fim - lote.inicio + 1;
  const u = usados.filter((n) => n >= lote.inicio && n <= lote.fim).length;
  return { total, usados: u, disponiveis: total - u };
}
