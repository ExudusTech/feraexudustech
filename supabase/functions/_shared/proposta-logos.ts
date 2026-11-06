// Brand logos of the proposal PDF ("Parcerias com marcas líderes"). Kept in organizations.proposta_config.logos; files in private org-logos.
export const GRUPOS_LOGO = ["destaque", "parceiros", "produtos"] as const;
export type GrupoLogo = typeof GRUPOS_LOGO[number];
export const GRUPO_LOGO_LABEL: Record<GrupoLogo, string> = { destaque: "Destaque", parceiros: "Parceiros", produtos: "Marcas de produto" };
export interface LogoProposta { id: string; path: string; marca: string; grupo: GrupoLogo; ordem: number }

/** Cell layout per group: highlights bigger on the first row, product brands smaller. */
export const LOGO_LAYOUT: Record<GrupoLogo, { porLinha: number; altura: number }> = {
  destaque: { porLinha: 3, altura: 58 }, parceiros: { porLinha: 4, altura: 44 }, produtos: { porLinha: 5, altura: 34 },
};

export const marcaKey = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Sanitized list from the stored config (unknown input). */
export function parseLogos(v: unknown, orgId?: string): LogoProposta[] {
  if (!Array.isArray(v)) return [];
  const out: LogoProposta[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const path = typeof o.path === "string" ? o.path : "";
    if (!/^[0-9a-f-]{36}\/proposta\/[\w.-]+\.(png|jpe?g)$/i.test(path) || (orgId && !path.startsWith(`${orgId}/`))) continue;
    const grupo = GRUPOS_LOGO.includes(o.grupo as GrupoLogo) ? o.grupo as GrupoLogo : "produtos";
    out.push({ id: typeof o.id === "string" ? o.id.slice(0, 64) : path, path, marca: typeof o.marca === "string" ? o.marca.trim().slice(0, 80) : "",
      grupo, ordem: Number.isFinite(Number(o.ordem)) ? Number(o.ordem) : 0 });
  }
  return out;
}

/** Logos shown on the PDF, grouped and ordered. Never an inactive brand (Multi Química, or a catalog brand with no active product). */
export function logosVisiveis(logos: LogoProposta[], marcasInativas: Iterable<string> = []): LogoProposta[] {
  const inativas = new Set([...marcasInativas].map(marcaKey));
  return logos.filter((l) => { const k = marcaKey(l.marca); return !k.includes("multiquimica") && !inativas.has(k); })
    .sort((a, b) => GRUPOS_LOGO.indexOf(a.grupo) - GRUPOS_LOGO.indexOf(b.grupo) || a.ordem - b.ordem);
}

/** Catalog brands whose products are all inactive. */
export function marcasSoInativas(rows: { brand: string | null; is_active: boolean | null }[]): string[] {
  const ativo = new Map<string, boolean>(); const nome = new Map<string, string>();
  for (const r of rows) { const k = marcaKey(r.brand); if (!k) continue; nome.set(k, r.brand!); ativo.set(k, (ativo.get(k) ?? false) || !!r.is_active); }
  return [...ativo.entries()].filter(([, a]) => !a).map(([k]) => nome.get(k)!);
}

/** Fit an image in a cell keeping its ratio (no distortion or crop) and never above its native width (avoid pixelation). 1 px = 0.75 pt. */
export function encaixarLogo(imgW: number, imgH: number, cellW: number, cellH: number) {
  const maxW = Math.min(cellW, imgW * 0.75), maxH = cellH;
  const s = Math.min(maxW / imgW, maxH / imgH);
  const w = imgW * s, h = imgH * s;
  return { w, h, dx: (cellW - w) / 2, dy: (cellH - h) / 2 };
}
