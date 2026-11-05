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
export interface PassoColeta { tipo?: "proposta" | "teste" | "venda_direta" | "retorno"; data?: string; observacao?: string }
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
}
export const PASSO_LABEL: Record<string, string> = { proposta: "Enviar proposta", teste: "Instalação de teste", venda_direta: "Venda direta / ativação", retorno: "Retorno" };

const has = (v?: string | null) => !!(v ?? "").trim();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** What is still missing in the draft, in the seller's words. Includes commercial feedback (offer without reaction, step without date). */
export function pendenciasColeta(tipo: string | null | undefined, r: RascunhoColeta | null | undefined): string[] {
  const d = r ?? {};
  const out: string[] = [];
  for (const o of d.produtos_oferecidos ?? []) if (has(o.produto) && !has(o.reacao)) out.push(`Você ofereceu ${o.produto!.trim()} — o que o cliente achou?`);
  for (const p of d.proximos_passos ?? []) if (p.tipo && !(p.data && ISO.test(p.data))) out.push(`Qual a data para "${PASSO_LABEL[p.tipo] ?? p.tipo}"?`);
  if (!exigeColeta(tipo)) return out;
  if (!has(d.contato?.nome)) out.push("Nome do contato");
  if (!has(d.decisor?.nome)) out.push("Quem decide a compra");
  const pontos = (d.pontos ?? []).filter((p) => has(p.local) || has(p.produto) || has(p.aparelho));
  if (!pontos.length) out.push("Pontos (local, aparelho, produto, quantidade)");
  pontos.forEach((p, i) => { if (!has(p.local)) out.push(`Ponto ${i + 1}: local`); if (!has(p.quantidade)) out.push(`Ponto ${i + 1}: quantidade`); });
  if (tipo === "primeira_visita") {
    if (!has(d.fluxo_pessoas)) out.push("Fluxo de pessoas");
    if (!(d.dores ?? []).some(has)) out.push("Queixas / dores do cliente");
    if (!has(d.produto_atual) && !has(d.concorrente)) out.push("Produto atual / concorrente");
  }
  if (!(d.proximos_passos ?? []).some((p) => p.tipo)) out.push("Próximo passo (proposta, teste, venda direta ou retorno)");
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
  const passos = ["proposta", "teste", "venda_direta", "retorno"];
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
  };
}

/** Strict JSON schema for the AI extraction (all fields required, empty when not said). */
const str = { type: "string" };
export const RASCUNHO_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["contato", "decisor", "pontos", "fluxo_pessoas", "dores", "produto_atual", "concorrente", "produtos_oferecidos", "proximos_passos", "observacoes"],
  properties: {
    contato: { type: "object", additionalProperties: false, required: ["nome", "cargo", "telefone", "email"], properties: { nome: str, cargo: str, telefone: str, email: str } },
    decisor: { type: "object", additionalProperties: false, required: ["nome", "cargo"], properties: { nome: str, cargo: str } },
    pontos: { type: "array", items: { type: "object", additionalProperties: false, required: ["local", "aparelho", "produto", "quantidade"], properties: { local: str, aparelho: str, produto: str, quantidade: str } } },
    fluxo_pessoas: str, dores: { type: "array", items: str }, produto_atual: str, concorrente: str,
    produtos_oferecidos: { type: "array", items: { type: "object", additionalProperties: false, required: ["produto", "reacao"], properties: { produto: str, reacao: str } } },
    proximos_passos: { type: "array", items: { type: "object", additionalProperties: false, required: ["tipo", "data", "observacao"], properties: { tipo: { type: "string", enum: ["proposta", "teste", "venda_direta", "retorno", ""] }, data: { type: "string", description: "AAAA-MM-DD ou vazio" }, observacao: str } } },
    observacoes: str,
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
