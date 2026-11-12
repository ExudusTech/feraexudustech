// Pure helpers for the installed base (Lote 11): maintenance plans, point checklist, occurrences and import.
// No Deno/npm imports so vitest can load it.
export const ESTADOS = ["verde", "amarelo", "vermelho"] as const;
export type Estado = typeof ESTADOS[number];
export const ESTADO_LABEL: Record<string, string> = { verde: "OK", amarelo: "Atenção", vermelho: "Ruim" };
export const MANUTENCOES = ["refil_reposto", "limpeza", "aparelho_trocado", "problema"] as const;
/** Also accepted from older clients. */
export const MANUTENCOES_ACEITAS = [...MANUTENCOES, "ajuste", "consertado"] as const;
export const MANUTENCAO_LABEL: Record<string, string> = { refil_reposto: "Refil reposto", limpeza: "Limpeza", aparelho_trocado: "Aparelho trocado", problema: "Problema", ajuste: "Ajuste", consertado: "Consertado no local" };
export const FREQUENCIAS = ["semanal", "quinzenal", "mensal", "personalizada"] as const;
export type Frequencia = typeof FREQUENCIAS[number];
export const FREQ_LABEL: Record<string, string> = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal", personalizada: "Personalizada" };
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export interface Plano { frequencia: string; intervalo_dias?: number | null; dia_semana?: number | null; data_inicio: string }

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Interval in days: weekly 7, fortnightly 15, monthly 30 (decided 05/11), custom 1–180. */
export function intervaloDias(p: Plano): number {
  if (p.frequencia === "semanal") return 7;
  if (p.frequencia === "quinzenal") return 15;
  if (p.frequencia === "mensal") return 30;
  return Math.max(1, Math.min(180, Number(p.intervalo_dias) || 15));
}

/** Route weekdays (JS 0–6) from a coverage area's text, e.g. "3ª feira e 5ª feira" → [2, 4]. */
export function parseDiaSemana(text?: string | null): number[] {
  return ((text ?? "").match(/(\d)ª/g) ?? []).map((m) => parseInt(m[0], 10) - 1).filter((d) => d >= 1 && d <= 5);
}

export interface AreaRota { name: string; city?: string | null; dia_semana?: string | null; zip_code_start?: string | null; zip_code_end?: string | null }
/** Client's route region: narrowest CEP interval, else exact city name. */
export function areaDoCliente<T extends AreaRota>(areas: T[], cep?: string | null, city?: string | null): T | null {
  const d = (v?: string | null) => (v ?? "").replace(/\D/g, "");
  const pc = d(cep);
  if (pc.length === 8) {
    const hit = areas.map((a) => ({ a, s: d(a.zip_code_start), e: d(a.zip_code_end ?? a.zip_code_start) }))
      .filter((x) => x.s.length === 8 && x.e.length === 8 && pc >= x.s && pc <= x.e)
      .sort((x, y) => (Number(x.e) - Number(x.s)) - (Number(y.e) - Number(y.s)))[0];
    if (hit) return hit.a;
  }
  const c = cidadeChave(city);
  return c ? areas.find((a) => cidadeChave(a.city) === c) ?? null : null;
}

// City aliases (same table as mcp's CITY_ALIASES): folded alias → folded official name, plus the official spelling.
const CIDADE_ALIAS: Record<string, string> = {
  "buzios": "armacao dos buzios", "armacao de buzios": "armacao dos buzios", "armacao buzios": "armacao dos buzios",
  "cabo": "cabo frio", "sao pedro": "sao pedro da aldeia", "s pedro da aldeia": "sao pedro da aldeia",
  "arraial": "arraial do cabo", "iguaba": "iguaba grande", "ostras": "rio das ostras",
};
const CIDADE_OFICIAL: Record<string, string> = {
  "armacao dos buzios": "Armação dos Búzios", "cabo frio": "Cabo Frio", "sao pedro da aldeia": "São Pedro da Aldeia",
  "arraial do cabo": "Arraial do Cabo", "iguaba grande": "Iguaba Grande", "rio das ostras": "Rio das Ostras",
};
const foldCidade = (v?: string | null) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\s*(?:[-/,–]\s*|\s)rj\s*$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/** Comparable city key: "Búzios/RJ" and "Armação dos Búzios" → "armacao dos buzios". */
export function cidadeChave(v?: string | null): string { const f = foldCidade(v); return CIDADE_ALIAS[f] ?? f; }
/** Official spelling for a known alias ("Buzios" → "Armação dos Búzios"); other cities keep what was typed (without "/RJ"). */
export function cidadeOficial(v?: string | null): string {
  const k = cidadeChave(v);
  return CIDADE_OFICIAL[k] ?? String(v ?? "").replace(/\s*(?:[-/,–]\s*|\s)RJ\s*$/i, "").trim();
}

/** First open route day on/after `from`: on a route weekday (any Mon–Sat without a route) and not blocked (holiday / Google all-day). */
export function primeiroDiaRota(from: string, rota: number[], blocked: (iso: string) => boolean): string {
  let d = from;
  for (let i = 0; i < 120; i++, d = addDays(d, 1)) {
    const w = dow(d);
    if (w === 0 || (rota.length && !rota.includes(w)) || blocked(d)) continue;
    return d;
  }
  return from;
}

/**
 * Planned visit dates in [from, from+horizon). Each date is the first open route day on/after (previous visit + interval);
 * the series starts after the plan's last visit (`ultima`) or at data_inicio. Never a holiday or Google block.
 */
export function proximasDatas(p: Plano, from: string, horizonDias: number, blocked: (iso: string) => boolean, rota: number[] = [], ultima?: string | null): string[] {
  const step = intervaloDias(p);
  const end = addDays(from, horizonDias);
  const pick = (x: string) => primeiroDiaRota(x, rota, blocked);
  let d = ultima ? pick(addDays(ultima, step)) : pick(p.data_inicio > from ? p.data_inicio : from);
  const out: string[] = [];
  for (let i = 0; i < 200 && d < end; i++) {
    if (d >= from && !out.includes(d)) out.push(d);
    d = pick(addDays(d, step));
  }
  return out;
}


export const FREQ_RAPIDAS = ["semanal", "quinzenal", "mensal"] as const;

/** Next plan visit after a visit done on `today`. */
export function proximaVisitaPlano(p: Plano, today: string, rota: number[] = [], blocked: (iso: string) => boolean = () => false): string {
  return primeiroDiaRota(addDays(today, intervaloDias(p)), rota, blocked);
}

export interface AvaliacaoInput { estado?: string; foto_path?: string | null; precisa_substituir?: boolean; item?: string | null }

/** Error text for an invalid point evaluation, or null. Ordem A (11/11): one photo for EVERY evaluated point, 🟢 included. */
export function avaliacaoErro(a: AvaliacaoInput): string | null {
  if (!ESTADOS.includes(a.estado as Estado)) return "Escolha o estado do ponto";
  if (!a.foto_path) return "Tire a foto do ponto (obrigatória em toda avaliação)";
  if (a.precisa_substituir && !(a.item ?? "").trim()) return "Informe o item a levar para substituir";
  return null;
}

/** Revisit of an existing point in attention/defect: must say what was done (fixed on site or needs replacement). */
export function acaoRevisitaErro(estado: string, consertado: boolean, substituir: boolean): string | null {
  return estado !== "verde" && !consertado && !substituir ? "Diga o que foi feito: consertado no local ou precisa substituir" : null;
}

/** New point: internal location and photo are mandatory. */
export function pontoErro(p: { localizacao_interna?: string | null; foto_path?: string | null; quantidade?: string | null }): string | null {
  if ((p.localizacao_interna ?? "").trim().length < 2) return "Informe o local interno do ponto";
  if (!p.foto_path) return "Tire a foto do ponto";
  if (p.quantidade !== undefined && p.quantidade !== null && !/^\d{1,4}$/.test(String(p.quantidade).trim())) return "Quantidade inválida";
  return null;
}

/** Frequencies the consultant can pick when closing a maintenance visit without a plan. */

/** Next planned visit date strictly after `today` (holidays are handled by the daily generator). */

export interface Compativel { id: string; brand?: string | null; is_dispenser?: boolean | null; dispenser_family_id?: string | null;
  compatible_dispenser_families?: string[] | null; specifications?: unknown; linha_produto?: string | null; name?: string }
const normTxt = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Refills compatible with a dispenser: refill specifications naming the dispenser, else the family mapping
 * (compatible_dispenser_families ∋ dispenser family), else the same brand. `mapeado` tells whether a real mapping was used.
 */
export function refisCompativeis<T extends Compativel>(disp: Compativel | null | undefined, refis: T[]): { lista: T[]; mapeado: boolean } {
  if (!disp) return { lista: refis, mapeado: false };
  const fam = disp.dispenser_family_id;
  const byFam = fam ? refis.filter((r) => (r.compatible_dispenser_families ?? []).includes(fam)) : [];
  const dn = normTxt(disp.name);
  const bySpec = dn.length >= 4 ? refis.filter((r) => normTxt(JSON.stringify(r.specifications ?? "")).includes(dn)) : [];
  // The catalog naming this exact dispenser is the most specific mapping; the family mapping comes next.
  const mapped = bySpec.length ? bySpec : byFam;
  if (mapped.length) return { lista: mapped, mapeado: true };
  const brand = normTxt(disp.brand);
  return { lista: brand ? refis.filter((r) => normTxt(r.brand) === brand) : refis, mapeado: false };
}

/** Ids of active points still without an evaluation in this visit. */
/** Installed points that count as in service: active, or on test at a lead (EM_TESTE). */
export const STATUS_EM_USO = ["ATIVO", "EM_TESTE"];
export function pontoEmUso(status?: string | null): boolean { return STATUS_EM_USO.includes((status ?? "ATIVO").toUpperCase()); }
/** A point installed on a test installation (or while the company is still a lead) stays EM_TESTE until the sale. */
export function statusPontoNovo(v: { client_id?: string | null; operacao_material?: string | null }): "ATIVO" | "EM_TESTE" {
  return !v.client_id || v.operacao_material === "instalacao_teste" ? "EM_TESTE" : "ATIVO";
}
/** With `previstos` (concentrated revisit: devices due in this visit) only those are required; otherwise every point in use. */
export function pontosPendentes(pontos: { id: string; status?: string | null }[], avaliados: string[], previstos?: string[] | null): string[] {
  const done = new Set(avaliados);
  const alvo = previstos?.length ? new Set(previstos) : null;
  return pontos.filter((p) => pontoEmUso(p.status) && !done.has(p.id) && (!alvo || alvo.has(p.id))).map((p) => p.id);
}

export function piorEstado(estados: (string | null | undefined)[]): Estado | null {
  if (estados.includes("vermelho")) return "vermelho";
  if (estados.includes("amarelo")) return "amarelo";
  if (estados.includes("verde")) return "verde";
  return null;
}

/** Client location from a check-in only overwrites an existing one when explicitly confirmed. */
export function podeGravarLocalizacao(existente: { latitude?: number | null } | null, confirmado: boolean): boolean {
  void existente;
  return confirmado === true;
}

export interface ImportRow {
  cliente: string; cidade: string; razao_social?: string; cnpj?: string; endereco?: string; bairro?: string; cep?: string;
  contato?: string; telefone?: string; email?: string; segmento?: string;
  frequencia: string; dia_semana: number | null; consultor?: string;
  /** Address good enough for geocoding (street or CEP); otherwise the location comes from the first check-in. */
  geocodificavel?: boolean; erro?: string; avisos?: string[]; duplicado_de?: string;
}
const norm = (s: unknown) => String(s ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normHead = (s: unknown) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
/** CNPJ check digits (same rule as cnpj_valido in the database). */
export function cnpjOk(v: unknown): boolean {
  const d = digitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = w.reduce((a, wi, i) => a + Number(d[i]) * wi, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
/** Spreadsheet header → field. Specific names first, so "Nome do contato" is the contact and not the client. */
const COLUNAS: [keyof ImportRow | "dia", string[]][] = [
  ["contato", ["nome do contato", "contato", "responsavel"]], ["razao_social", ["razao social", "razao"]], ["email", ["e mail", "email"]],
  ["telefone", ["telefone", "celular", "whatsapp", "fone", "tel"]], ["cnpj", ["cnpj", "cpf cnpj", "documento"]], ["cep", ["cep"]], ["bairro", ["bairro"]],
  ["cidade", ["cidade", "municipio"]], ["endereco", ["endereco", "logradouro", "rua"]], ["segmento", ["segmento", "ramo", "categoria"]],
  ["frequencia", ["freq"]], ["dia", ["dia"]], ["consultor", ["consultor", "vendedor"]], ["cliente", ["cliente", "nome", "estabelecimento", "empresa", "fantasia"]],
];
function mapaColunas(headers: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const h of headers) {
    const n = normHead(h);
    const hit = COLUNAS.find(([campo, al]) => !out.has(campo) && al.some((a) => n === a || n.startsWith(`${a} `) || n.startsWith(a)));
    if (hit) out.set(hit[0], h);
  }
  return out;
}

/**
 * Manager's client sheet (Ordem A): name/razão social, CNPJ (optional), address, bairro, city, CEP, contact, phone, e-mail, segment (optional);
 * legacy Frequência/Dia/Consultor still create a maintenance plan. Duplicates by valid CNPJ or name + city (city aliases), in the file and vs. existing clients.
 */
export function parseImportRows(rows: Record<string, unknown>[], existentes: { id?: string; name: string; city: string | null; document?: string | null }[]): ImportRow[] {
  const porCnpj = new Map<string, string>(); const porNome = new Map<string, string>();
  for (const c of existentes) {
    const d = digitos(c.document); if (d.length === 14) porCnpj.set(d, c.id ?? "existente");
    porNome.set(`${norm(c.name)}|${cidadeChave(c.city)}`, c.id ?? "existente");
  }
  const vistosCnpj = new Set<string>(); const vistosNome = new Set<string>();
  return rows.map((r) => {
    const cols = mapaColunas(Object.keys(r));
    const get = (k: string) => { const key = cols.get(k); return key ? String(r[key] ?? "").trim() : ""; };
    const avisos: string[] = [];
    const razao = get("razao_social");
    const cliente = (get("cliente") || razao).replace(/\s+/g, " ").slice(0, 160);
    const cidadeTxt = get("cidade");
    const cidade = cidadeTxt ? cidadeOficial(cidadeTxt).slice(0, 80) : "";
    let cnpj: string | undefined = digitos(get("cnpj")) || undefined;
    if (cnpj && !cnpjOk(cnpj)) { avisos.push("CNPJ inválido: importado sem CNPJ"); cnpj = undefined; }
    const telDig = digitos(get("telefone")).replace(/^55(?=\d{10,11}$)/, "");
    const telefone = telDig.length === 10 || telDig.length === 11 ? telDig : undefined;
    if (get("telefone") && !telefone) avisos.push("Telefone inválido: não importado");
    const emailTxt = get("email").toLowerCase();
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTxt) ? emailTxt.slice(0, 160) : undefined;
    if (emailTxt && !email) avisos.push("E-mail inválido: não importado");
    const cepDig = digitos(get("cep"));
    const cep = cepDig.length === 8 ? `${cepDig.slice(0, 5)}-${cepDig.slice(5)}` : undefined;
    if (get("cep") && !cep) avisos.push("CEP inválido");
    const endereco = get("endereco").slice(0, 240) || undefined; const bairro = get("bairro").slice(0, 80) || undefined;
    const geocodificavel = !!(endereco || cep);
    if (!geocodificavel) avisos.push("Sem endereço/CEP: a localização vem do primeiro check-in");
    const fTxt = norm(get("frequencia")); const diaTxt = norm(get("dia"));
    const frequencia = fTxt ? FREQUENCIAS.find((x) => fTxt.startsWith(x.slice(0, 4))) ?? "" : "";
    const idx = DIAS_SEMANA.findIndex((d) => diaTxt && norm(d).startsWith(diaTxt.slice(0, 3)));
    const row: ImportRow = { cliente, cidade, frequencia, dia_semana: idx >= 0 ? idx : null, consultor: get("consultor") || undefined,
      razao_social: razao.slice(0, 200) || undefined, cnpj, endereco, bairro, cep, contato: get("contato").slice(0, 120) || undefined, telefone, email,
      segmento: get("segmento").slice(0, 80) || undefined, geocodificavel };
    const chave = `${norm(cliente)}|${cidadeChave(cidade)}`;
    if (cliente.length < 2) row.erro = "Cliente sem nome";
    else if (!cidade) row.erro = "Cidade vazia";
    else if (fTxt && !frequencia) row.erro = "Frequência inválida";
    else if ((cnpj && porCnpj.has(cnpj)) || porNome.has(chave)) { row.erro = "Cliente já cadastrado"; row.duplicado_de = (cnpj && porCnpj.get(cnpj)) || porNome.get(chave); }
    else if ((cnpj && vistosCnpj.has(cnpj)) || vistosNome.has(chave)) row.erro = "Repetido na planilha";
    if (!row.erro) { vistosNome.add(chave); if (cnpj) vistosCnpj.add(cnpj); }
    if (avisos.length) row.avisos = avisos;
    return row;
  });
}

/** Address line stored on the client: street + bairro (clients have no bairro column). */
export function enderecoImportado(r: Pick<ImportRow, "endereco" | "bairro">): string | null {
  return [r.endereco, r.bairro].filter(Boolean).join(" — ") || null;
}

// ─── Ordem A: activation of the existing base ───────────────────────────────────────────────────────────────────────────
export const OCORRENCIA_ATIVACAO = "ativacao_base";
/** Periodicity asked when closing an activation (days). */
export const PERIODICIDADES_ATIVACAO = [7, 15, 30, 60] as const;
/** Plan + point periodicity for the chosen interval (60 days = custom plan, bimonthly points). */
export function periodicidadeAtivacao(dias: number): { frequencia: Frequencia; intervalo_dias: number | null; periodicidade_manut: string } | null {
  if (dias === 7) return { frequencia: "semanal", intervalo_dias: null, periodicidade_manut: "semanal" };
  if (dias === 15) return { frequencia: "quinzenal", intervalo_dias: null, periodicidade_manut: "quinzenal" };
  if (dias === 30) return { frequencia: "mensal", intervalo_dias: null, periodicidade_manut: "mensal" };
  if (dias === 60) return { frequencia: "personalizada", intervalo_dias: 60, periodicidade_manut: "bimestral" };
  return null;
}

export function ocorrenciaUrgenteMessage(v: { cliente: string; consultor: string; local: string; item: string; pedidoId: string }): string {
  return `🚨 Ocorrência urgente\nCliente: ${v.cliente}\nPonto: ${v.local}\nItem: ${v.item}\nAberta por: ${v.consultor}\nO gestor precisa aprovar uma visita emergencial: https://fera.exudustech.com.br/dashboard?tab=campo&pedido=${v.pedidoId}`;
}

export function manutencaoDoDiaMessage(nome: string, visitas: { hora: string; cliente: string }[], levar: string[]): string {
  const l = visitas.map((v) => `• ${v.hora.slice(0, 5)} ${v.cliente}`).join("\n");
  return `Bom dia, ${nome}! Manutenções de hoje:\n${l}${levar.length ? `\n\nLevar:\n${levar.map((x) => `• ${x}`).join("\n")}` : ""}\nhttps://fera.exudustech.com.br/hoje`;
}
