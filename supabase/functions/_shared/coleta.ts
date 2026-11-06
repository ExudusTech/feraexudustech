// Lote 15: occurrence types and audio-collection draft rules. Pure (no Deno/npm imports) so vitest, screens and functions share it.

export const OCORRENCIA_TIPOS = ["primeira_visita", "instalacao_teste", "venda_direta", "manutencao_preventiva", "chamado_corretivo", "entrega", "substituicao", "coleta_devolucao"] as const;
export type OcorrenciaTipo = typeof OCORRENCIA_TIPOS[number];
export const OCORRENCIA_LABEL: Record<OcorrenciaTipo, string> = {
  primeira_visita: "Primeira visita comercial", instalacao_teste: "Instalação de teste", venda_direta: "Venda direta / ativação",
  manutencao_preventiva: "Manutenção preventiva", chamado_corretivo: "Chamado corretivo", entrega: "Entrega",
  substituicao: "Substituição", coleta_devolucao: "Coleta de devolução",
};
/** Types where the commercial collection (contact, points, pains, next steps) is mandatory before closing. */
export const TIPOS_COM_COLETA: OcorrenciaTipo[] = ["primeira_visita", "venda_direta", "instalacao_teste"];
export function exigeColeta(tipo?: string | null): boolean { return TIPOS_COM_COLETA.includes(tipo as OcorrenciaTipo); }

export interface PontoColeta { local?: string; aparelho?: string; produto?: string; quantidade?: string }
export interface OfertaColeta { produto?: string; reacao?: string }
export interface PassoColeta { tipo?: "proposta" | "teste" | "venda_direta" | "retorno" | "perdido"; data?: string; observacao?: string }
/** What a test installation / direct sale needs (asked at confirmation, never to close the visit). */
export interface InstalacaoColeta { tipo_nota?: string; itens?: { descricao?: string; quantidade?: string }[] }
/** Optional survey details ("Mais detalhes"); never block. Segment comes from the lead, decision maker and flow live in the draft. */
export interface LevantamentoColeta { porte?: string; banheiros_f?: string; banheiros_m?: string; banheiros_pne?: string; problema?: string; fornecedor?: string }
export interface RascunhoColeta {
  contato?: { nome?: string; cargo?: string; telefone?: string; email?: string };
  decisor?: { nome?: string; cargo?: string };
  pontos?: PontoColeta[];
  fluxo_pessoas?: string;
  dores?: string[];
  produto_atual?: string;
  concorrente?: string;
  produtos_oferecidos?: OfertaColeta[];
  proximos_passos?: PassoColeta[];
  observacoes?: string;
  instalacao?: InstalacaoColeta;
  levantamento?: LevantamentoColeta;
}
export const PASSO_LABEL: Record<string, string> = { proposta: "Enviar proposta", teste: "Instalação de teste", venda_direta: "Venda direta / ativação", retorno: "Retornar em…", perdido: "Perdido" };
export const PASSOS_INSTALACAO = ["teste", "venda_direta"];
export function precisaInstalacao(r: RascunhoColeta | null | undefined): "teste" | "venda_direta" | null {
  const p = (r?.proximos_passos ?? []).find((x) => PASSOS_INSTALACAO.includes(x.tipo ?? ""));
  return (p?.tipo as "teste" | "venda_direta" | undefined) ?? null;
}
export function tipoNotaPadrao(passo: string | null | undefined): string { return passo === "venda_direta" ? "venda" : "remessa_teste"; }
/** Installation items from the points (device + product + quantity), the editable default. */
export function itensDosPontos(r: RascunhoColeta | null | undefined): { descricao: string; quantidade: string }[] {
  return (r?.pontos ?? []).filter((p) => has(p.produto) || has(p.aparelho)).map((p) => ({
    descricao: `${[p.aparelho, p.produto].filter(has).join(" + ")}${has(p.local) ? ` — ${p.local}` : ""}`, quantidade: (p.quantidade ?? "").trim() || "1" }));
}

const has = (v?: string | null) => !!(v ?? "").trim();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** What is still missing in the draft, in the seller's words. Includes commercial feedback (offer without reaction, step without date). */
export function pendenciasColeta(tipo: string | null | undefined, r: RascunhoColeta | null | undefined, ctx: { cnpj?: boolean } = {}): string[] {
  const d = r ?? {};
  const out: string[] = [];
  for (const o of d.produtos_oferecidos ?? []) if (has(o.produto) && !has(o.reacao)) out.push(`Você ofereceu ${o.produto!.trim()} — o que o cliente achou?`);
  for (const p of d.proximos_passos ?? []) {
    if (p.tipo === "perdido") { if (!has(p.observacao)) out.push("Motivo da perda"); }
    else if (p.tipo && !(p.data && ISO.test(p.data))) out.push(`Qual a data para "${PASSO_LABEL[p.tipo] ?? p.tipo}"?`);
  }
  const inst = precisaInstalacao(d);
  if (inst) {
    const itens = d.instalacao?.itens?.length ? d.instalacao.itens.filter((i) => has(i.descricao)) : itensDosPontos(d);
    if (!itens.length) out.push(`Itens da ${PASSO_LABEL[inst].toLowerCase()}`);
    if (ctx.cnpj === false) out.push("CNPJ da empresa");
  }
  if (!exigeColeta(tipo)) return out;
  if (!has(d.contato?.nome)) out.push("Nome do contato");
  if (!has(d.decisor?.nome)) out.push("Quem decide a compra");
  const pontos = (d.pontos ?? []).filter((p) => has(p.local) || has(p.produto) || has(p.aparelho));
  if (!pontos.length) out.push("Pontos (local, aparelho, produto, quantidade)");
  pontos.forEach((p, i) => {
    const nome = has(p.local) ? p.local!.trim() : `Ponto ${i + 1}`;
    if (!has(p.local)) out.push(`Ponto ${i + 1}: local`);
    if (!has(p.aparelho)) out.push(`${nome}: qual aparelho?`);
    if (!has(p.produto)) out.push(`${nome}: qual produto/refil?`);
    if (!has(p.quantidade)) out.push(`${nome}: quantidade`);
  });
  if (tipo === "primeira_visita") {
    if (!has(d.fluxo_pessoas)) out.push("Fluxo de pessoas");
    if (!(d.dores ?? []).some(has)) out.push("Queixas / dores do cliente");
    if (!has(d.produto_atual) && !has(d.concorrente)) out.push("Produto atual / concorrente");
  }
  if (!(d.proximos_passos ?? []).some((p) => p.tipo)) out.push("Próximo passo (proposta, teste, venda direta, retorno ou perdido)");
  return out;
}

/** Readable summary for the timeline and the seller's confirmation (≤ 500 chars, the timeline limit). */
export function resumoColeta(codigo: string | null | undefined, r: RascunhoColeta | null | undefined): string {
  const d = r ?? {};
  const parts: string[] = [];
  if (codigo) parts.push(`#${codigo}`);
  if (has(d.contato?.nome)) parts.push(`Contato: ${d.contato!.nome}${has(d.contato?.cargo) ? ` (${d.contato!.cargo})` : ""}`);
  if (has(d.decisor?.nome)) parts.push(`Decisor: ${d.decisor!.nome}`);
  const pts = (d.pontos ?? []).filter((p) => has(p.local) || has(p.produto));
  if (pts.length) parts.push(`Pontos: ${pts.map((p) => `${p.quantidade || "?"}x ${p.produto || p.aparelho || "item"} em ${p.local || "?"}`).join("; ")}`);
  if (has(d.fluxo_pessoas)) parts.push(`Fluxo: ${d.fluxo_pessoas}`);
  if ((d.dores ?? []).length) parts.push(`Dores: ${d.dores!.filter(has).join(", ")}`);
  if (has(d.produto_atual) || has(d.concorrente)) parts.push(`Atual: ${[d.produto_atual, d.concorrente].filter(has).join(" / ")}`);
  if ((d.produtos_oferecidos ?? []).length) parts.push(`Ofertas: ${d.produtos_oferecidos!.map((o) => `${o.produto}${has(o.reacao) ? ` (${o.reacao})` : ""}`).join("; ")}`);
  if ((d.proximos_passos ?? []).length) parts.push(`Próximo: ${d.proximos_passos!.map((p) => `${PASSO_LABEL[p.tipo ?? ""] ?? p.tipo}${p.data ? ` ${p.data.split("-").reverse().join("/")}` : ""}`).join("; ")}`);
  const txt = parts.join(" · ");
  return txt.length > 500 ? `${txt.slice(0, 497)}...` : txt || "Coleta sem conteúdo";
}

/** Sanitizes a draft received from the screen, the AI or the Flora: known fields only, bounded strings. */
export function limparRascunho(input: unknown): RascunhoColeta {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const s = (v: unknown, max = 200) => typeof v === "string" ? v.trim().slice(0, max) : undefined;
  const arr = <T>(v: unknown, fn: (x: any) => T, max = 30): T[] => Array.isArray(v) ? v.slice(0, max).map(fn) : [];
  const passos = ["proposta", "teste", "venda_direta", "retorno", "perdido"];
  const num = (v: unknown) => v == null || v === "" ? undefined : String(v).replace(/\D/g, "").slice(0, 6) || undefined;
  const lv = o.levantamento && typeof o.levantamento === "object" ? o.levantamento : null;
  const inst = o.instalacao && typeof o.instalacao === "object" ? o.instalacao : null;
  return {
    contato: { nome: s(o.contato?.nome), cargo: s(o.contato?.cargo), telefone: s(o.contato?.telefone, 30), email: s(o.contato?.email, 120) },
    decisor: { nome: s(o.decisor?.nome), cargo: s(o.decisor?.cargo) },
    pontos: arr(o.pontos, (p) => ({ local: s(p?.local), aparelho: s(p?.aparelho), produto: s(p?.produto), quantidade: s(p?.quantidade == null ? undefined : String(p.quantidade), 20) })),
    fluxo_pessoas: s(o.fluxo_pessoas, 300),
    dores: arr(o.dores, (x) => s(x, 200) ?? "").filter(Boolean),
    produto_atual: s(o.produto_atual), concorrente: s(o.concorrente),
    produtos_oferecidos: arr(o.produtos_oferecidos, (p) => ({ produto: s(p?.produto), reacao: s(p?.reacao, 300) })),
    proximos_passos: arr(o.proximos_passos, (p) => ({ tipo: passos.includes(p?.tipo) ? p.tipo : undefined, data: typeof p?.data === "string" && ISO.test(p.data) ? p.data : undefined, observacao: s(p?.observacao, 200) }), 5),
    observacoes: s(o.observacoes, 1000),
    ...(inst ? { instalacao: { tipo_nota: ["remessa_comodato", "remessa_teste", "venda", "retorno"].includes(inst.tipo_nota) ? inst.tipo_nota : undefined,
      itens: arr(inst.itens, (i) => ({ descricao: s(i?.descricao, 300), quantidade: s(i?.quantidade == null ? undefined : String(i.quantidade), 20) })).filter((i) => i.descricao) } } : {}),
    ...(lv ? { levantamento: { porte: num(lv.porte), banheiros_f: num(lv.banheiros_f), banheiros_m: num(lv.banheiros_m), banheiros_pne: num(lv.banheiros_pne),
      problema: s(lv.problema, 100), fornecedor: s(lv.fornecedor, 100) } } : {}),
  };
}

/** Strict JSON schema for the AI extraction (all fields required, empty when not said). */
const str = { type: "string" };
export const RASCUNHO_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["contato", "decisor", "pontos", "fluxo_pessoas", "dores", "produto_atual", "concorrente", "produtos_oferecidos", "proximos_passos", "observacoes", "levantamento"],
  properties: {
    contato: { type: "object", additionalProperties: false, required: ["nome", "cargo", "telefone", "email"], properties: { nome: str, cargo: str, telefone: str, email: str } },
    decisor: { type: "object", additionalProperties: false, required: ["nome", "cargo"], properties: { nome: str, cargo: str } },
    pontos: { type: "array", items: { type: "object", additionalProperties: false, required: ["local", "aparelho", "produto", "quantidade"], properties: { local: str, aparelho: str, produto: str, quantidade: str } } },
    fluxo_pessoas: str, dores: { type: "array", items: str }, produto_atual: str, concorrente: str,
    produtos_oferecidos: { type: "array", items: { type: "object", additionalProperties: false, required: ["produto", "reacao"], properties: { produto: str, reacao: str } } },
    proximos_passos: { type: "array", items: { type: "object", additionalProperties: false, required: ["tipo", "data", "observacao"], properties: { tipo: { type: "string", enum: ["proposta", "teste", "venda_direta", "retorno", "perdido", ""] }, data: { type: "string", description: "AAAA-MM-DD ou vazio" }, observacao: str } } },
    observacoes: str,
    levantamento: { type: "object", additionalProperties: false, required: ["porte", "banheiros_f", "banheiros_m", "banheiros_pne", "problema", "fornecedor"],
      properties: { porte: { type: "string", description: "nº de funcionários/quartos/mesas" }, banheiros_f: str, banheiros_m: str, banheiros_pne: str, problema: str, fornecedor: { type: "string", description: "de quem compra hoje" } } },
  },
};

/** Removes empty strings the strict schema forces the model to return. */
export function semVazios(r: RascunhoColeta): RascunhoColeta {
  const clean = (v: any): any => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x != null).map(([k, x]) => [k, clean(x)]));
    return v;
  };
  return limparRascunho(clean(r));
}

/** Occurrence still needs the seller: collection pending, or confirmed with "Agendar …" tasks left (no valid slot). */
export function temPendenciaColeta(s: { coleta_status?: string | null; coleta_pendencias?: unknown }): boolean {
  return s.coleta_status === "pendente" || (s.coleta_status === "confirmada" && Array.isArray(s.coleta_pendencias) && s.coleta_pendencias.length > 0);
}

const foldNome = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Matches a spoken product to a catalog product: exact name, then name containing the phrase (or vice-versa) when unique. Never guesses among several. */
export function matchProduto<T extends { name?: string | null }>(produtos: T[], falado: string): T | null {
  const f = foldNome(falado);
  if (!f) return null;
  const exato = produtos.filter((p) => foldNome(p.name) === f);
  if (exato.length === 1) return exato[0];
  const parcial = produtos.filter((p) => { const n = foldNome(p.name); return n.length > 2 && (n.includes(f) || f.includes(n)); });
  return parcial.length === 1 ? parcial[0] : null;
}

const lev = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[b.length];
};
const STOP = new Set(["da", "de", "do", "das", "dos", "e", "o", "a", "com", "para", "em", "um", "uma"]);
const tokens = (v: unknown) => foldNome(v).split(" ").filter((t) => t && !STOP.has(t));
const tokenOk = (t: string, n: string) => t === n || (t.length >= 4 && n.length >= 4 && (n.startsWith(t) || t.startsWith(n) || lev(t, n) <= (Math.min(t.length, n.length) >= 6 ? 2 : 1)));
/** Ranked catalog suggestions for a transcribed product (tolerates brand typos like "Diversity" → "Diversey"). Only suggests; the seller picks. */
export function sugerirProdutos<T extends { name?: string | null; brand?: string | null }>(produtos: T[], falado: string, max = 5): T[] {
  const ts = tokens(falado);
  if (!ts.length) return [];
  const scored = produtos.map((p) => {
    const ns = tokens(`${p.name ?? ""} ${p.brand ?? ""}`);
    const hit = ts.filter((t) => ns.some((n) => tokenOk(t, n))).length;
    return { p, score: hit / ts.length + (foldNome(p.name) === foldNome(falado) ? 1 : 0) };
  }).filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.p);
}
