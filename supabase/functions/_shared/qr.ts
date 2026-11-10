// QR campaigns, reference codes and ratings (addendum 10/11). Shared by etiqueta-publica, the screens (src/lib/qr.ts) and,
// as an identical copy between the markers below, by mcp (test-enforced: the mcp test harness cannot load imports).

// BEGIN qr
/** Crockford-style alphabet (no I, L, O, U): 32 symbols, 4 symbols = 2^20 codes, enough for numbers up to 999999. */
const QR_ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const QR_M = 1 << 20;
const QR_A = 738197;
const QR_B = 419431;
function qrInverso(a: number, m: number): number {
  let [r0, r1, s0, s1] = [a, m, 1, 0];
  while (r1 !== 0) { const q = Math.floor(r0 / r1); [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  return ((s0 % m) + m) % m;
}
const QR_A_INV = qrInverso(QR_A, QR_M);
function qrMulMod(a: number, b: number): number {
  // a, b < 2^20: split b to keep products below 2^53.
  return ((a * (b >>> 10)) % QR_M * 1024 + a * (b & 1023)) % QR_M;
}

/** Short reference shown at the end of the public message ("ref Q7K2M"): a reversible scramble of the label number, never the number itself. */
export function qrRef(numero: number): string {
  let x = (qrMulMod(numero % QR_M, QR_A) + QR_B) % QR_M;
  let s = "";
  for (let i = 0; i < 4; i++) { s = QR_ALFABETO[x % 32] + s; x = Math.floor(x / 32); }
  return `Q${s}`;
}
/** Label number behind a reference (accepts "ref Q7K2M", "q7k2m", the whole message), or null. */
export function qrNumeroDaRef(raw: unknown): number | null {
  const t = String(raw ?? "").toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
  const m = t.match(/(?:^|[^0-9A-Z])Q([0-9A-HJKMNP-TV-Z]{4})(?![0-9A-Z])/) ?? t.match(/^Q?([0-9A-HJKMNP-TV-Z]{4})$/);
  if (!m) return null;
  let x = 0;
  for (const ch of m[1]) x = x * 32 + QR_ALFABETO.indexOf(ch);
  const n = qrMulMod(((x - QR_B) % QR_M + QR_M) % QR_M, QR_A_INV);
  return n >= 1 && n <= 999999 ? n : null;
}

export interface QrCampanha { id?: string; nome: string; texto: string; inicio?: string | null; fim?: string | null; dias_semana?: number[] | null;
  hora_inicio?: string | null; hora_fim?: string | null; segmentos?: string[] | null; prioridade?: number | null; padrao?: boolean | null; ativo?: boolean | null }
export interface QrVars { estabelecimento?: string | null; segmento?: string | null; produto_do_aparelho?: string | null }
export const QR_VARIAVEIS = ["estabelecimento", "segmento", "saudacao", "dia_semana", "produto_do_aparelho"] as const;
/** Used only when no campaign fits (none configured, or every one needs data this scan does not have). */
export const QR_TEXTO_RESERVA = "{saudacao}! Quero saber mais sobre a NitsClean.";
const QR_DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const qrFold = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** São Paulo calendar parts of an instant. */
export function qrAgoraSP(agora: Date): { data: string; dia: number; minutos: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(agora).map((x) => [x.type, x.value]));
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { data: `${p.year}-${p.month}-${p.day}`, dia, minutos: Number(p.hour) * 60 + Number(p.minute) };
}
export function qrSaudacao(minutos: number): string { return minutos >= 300 && minutos < 720 ? "Bom dia" : minutos >= 720 && minutos < 1080 ? "Boa tarde" : "Boa noite"; }
const qrMin = (h?: string | null) => { const m = String(h ?? "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function qrUsa(texto: string): string[] { return [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]); }

/** Campaign in force now: specific campaigns (date range, weekdays, hours, segments) by priority; else the default; else the reserve text. */
export function qrEscolherCampanha(campanhas: QrCampanha[], agora: Date, vars: QrVars): QrCampanha {
  const sp = qrAgoraSP(agora);
  const temVar = (c: QrCampanha) => qrUsa(c.texto).every((v) => !["estabelecimento", "segmento", "produto_do_aparelho"].includes(v) || !!(vars as Record<string, unknown>)[v]);
  const vigente = (c: QrCampanha) => c.ativo !== false && (!c.inicio || c.inicio <= sp.data) && (!c.fim || c.fim >= sp.data);
  const naHora = (c: QrCampanha) => {
    if (c.dias_semana?.length && !c.dias_semana.includes(sp.dia)) return false;
    const i = qrMin(c.hora_inicio), f = qrMin(c.hora_fim);
    if (i !== null && sp.minutos < i) return false;
    if (f !== null && sp.minutos >= f) return false;
    return true;
  };
  const noSegmento = (c: QrCampanha) => !c.segmentos?.length || (!!vars.segmento && c.segmentos.some((s) => qrFold(s) === qrFold(vars.segmento)));
  const ok = campanhas.filter((c) => vigente(c) && temVar(c));
  const especifica = ok.filter((c) => !c.padrao && naHora(c) && noSegmento(c)).sort((a, b) => (b.prioridade ?? 0) - (a.prioridade ?? 0))[0];
  return especifica ?? ok.find((c) => c.padrao) ?? { nome: "Reserva", texto: QR_TEXTO_RESERVA };
}

export function qrRenderizar(texto: string, vars: QrVars, agora: Date): string {
  const sp = qrAgoraSP(agora);
  const valores: Record<string, string> = { saudacao: qrSaudacao(sp.minutos), dia_semana: QR_DIAS[sp.dia] ?? "",
    estabelecimento: (vars.estabelecimento ?? "").trim(), segmento: (vars.segmento ?? "").trim(), produto_do_aparelho: (vars.produto_do_aparelho ?? "").trim() };
  return texto.replace(/\{(\w+)\}/g, (all, k) => (k in valores ? valores[k] : all)).replace(/[ \t]{2,}/g, " ").trim();
}
/** Public pre-filled WhatsApp text: campaign text + a discreet reference at the end (never the label number or internal data). */
export function qrMensagem(campanhas: QrCampanha[], agora: Date, vars: QrVars, ref: string): { texto: string; campanha: string } {
  const c = qrEscolherCampanha(campanhas, agora, vars);
  return { texto: `${qrRenderizar(c.texto, vars, agora)}\n\nref ${ref}`, campanha: c.nome };
}

const QR_NEGATIVAS = ["ruim", "pessim", "horrivel", "sujo", "suja", "fedor", "fedid", "mau cheiro", "cheiro ruim", "quebrad", "estragad", "faltando", "falta ", "sem papel",
  "sem sabonete", "vazio", "vazia", "nojo", "nojent", "demor", "reclam", "nao funciona", "não funciona", "decepcion", "insatisf", "terrivel", "lixo", "pior"];
const QR_POSITIVAS = ["otim", "excelente", "limp", "bom", "boa", "parabens", "adorei", "amei", "cheiros", "maravilh", "perfeit", "show", "top", "gostei", "lindo"];
/** Simple sentiment: a negative word or a score ≤ 6 is negative; ≥ 9 (or 7–8 with praise) is positive; otherwise neutral. */
export function qrSentimento(nota: number, comentario?: string | null): "positivo" | "neutro" | "negativo" {
  const t = ` ${qrFold(comentario)} `.replace(/\s+/g, " ");
  const neg = QR_NEGATIVAS.some((w) => t.includes(qrFold(w)));
  if (neg || nota <= 6) return "negativo";
  if (nota >= 9 || QR_POSITIVAS.some((w) => t.includes(w))) return "positivo";
  return "neutro";
}
/** Score ≤ 6 or a negative comment alerts the client's manager/consultant. */
export function qrPrecisaAlerta(nota: number, comentario?: string | null): boolean { return nota <= 6 || qrSentimento(nota, comentario) === "negativo"; }
export function qrNotaValida(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d{1,2}\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
}
/** NPS (promoters 9–10 minus detractors 0–6, in %) and average score. */
export function qrNps(notas: number[]): { n: number; media: number | null; nps: number | null; promotores: number; detratores: number } {
  const n = notas.length;
  if (!n) return { n: 0, media: null, nps: null, promotores: 0, detratores: 0 };
  const promotores = notas.filter((x) => x >= 9).length, detratores = notas.filter((x) => x <= 6).length;
  return { n, media: Math.round((notas.reduce((a, b) => a + b, 0) / n) * 10) / 10, nps: Math.round(((promotores - detratores) / n) * 100), promotores, detratores };
}

export interface QrProduto { id: string; name: string; is_dispenser?: boolean | null; is_active?: boolean | null; dispenser_family_id?: string | null;
  compatible_dispenser_families?: string[] | null; brand?: string | null }
/** Search terms of the room/segment kit (higher priority first). */
const QR_KIT: Record<string, string[]> = {
  "restaurante/bar": ["papel toalha", "sabonete", "alcool gel", "desengordurante", "detergente"], "hotel/pousada": ["papel toalha", "sabonete", "aromatizador", "papel higienico"],
  "clinica/hospital": ["alcool gel", "antisseptico", "papel toalha", "sabonete"], academia: ["papel toalha", "sabonete", "aromatizador"],
  escola: ["papel toalha", "sabonete", "alcool gel"], "comercio/loja": ["papel toalha", "sabonete", "aromatizador"], escritorio: ["papel toalha", "sabonete", "aromatizador", "cafe"],
};
const QR_KIT_BASE = ["papel toalha", "sabonete", "papel higienico", "aromatizador", "alcool gel"];
/**
 * Kit complements this client does NOT have installed yet: refills compatible with the point's device family first,
 * then products matching the segment kit; never a product already installed or one of its refills.
 */
export function qrComplementos(v: { aparelho?: QrProduto | null; instalados: string[]; catalogo: QrProduto[]; segmento?: string | null; max?: number }): QrProduto[] {
  const tem = new Set(v.instalados);
  const ativos = v.catalogo.filter((p) => p.is_active !== false && !tem.has(p.id));
  const fam = v.aparelho?.dispenser_family_id;
  const compat = fam ? ativos.filter((p) => !p.is_dispenser && (p.compatible_dispenser_families ?? []).includes(fam)) : [];
  const termos = QR_KIT[qrFold(v.segmento)] ?? QR_KIT_BASE;
  const kit: QrProduto[] = [];
  for (const t of termos) {
    const hit = ativos.find((p) => qrFold(p.name).includes(t) && !kit.includes(p) && !compat.includes(p));
    if (hit) kit.push(hit);
  }
  return [...compat.slice(0, 2), ...kit].slice(0, v.max ?? 4);
}
// END qr
