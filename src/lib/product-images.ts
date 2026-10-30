import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_IMAGE_BUCKET = "product-images";
export const ALLOWED_IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

export const normalizeSku = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "");

export function fileBaseName(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export interface SkuProduct { id: string; sku: string | null; image_url: string | null; name: string }
export interface ImageMatchPlan<F> {
  novos: { file: F; product: SkuProduct }[];
  substituir: { file: F; product: SkuProduct }[];
  semSku: F[];
}

/** Matches files to products by file name (without extension) = SKU. Products with an image go to "substituir" (needs confirmation). */
export function planImageMatches<F extends { name: string }>(files: F[], products: SkuProduct[]): ImageMatchPlan<F> {
  const bySku = new Map<string, SkuProduct>();
  for (const p of products) if (p.sku) bySku.set(normalizeSku(p.sku), p);
  const plan: ImageMatchPlan<F> = { novos: [], substituir: [], semSku: [] };
  for (const f of files) {
    const product = ALLOWED_IMAGE_EXT.includes(fileExt(f.name)) ? bySku.get(normalizeSku(fileBaseName(f.name))) : undefined;
    if (!product) plan.semSku.push(f);
    else if (product.image_url) plan.substituir.push({ file: f, product });
    else plan.novos.push({ file: f, product });
  }
  return plan;
}

export function productImagePath(orgId: string, sku: string | null, productId: string, ext: string) {
  const base = (sku ? normalizeSku(sku) : productId).replace(/[^A-Z0-9._-]/gi, "_");
  return `${orgId}/${base}.${ext === "jpeg" ? "jpg" : ext}`;
}

/** Uploads to the private bucket and returns the storage path (stored in products.image_url). */
export async function uploadProductImage(orgId: string, product: { id: string; sku: string | null }, file: File) {
  const ext = fileExt(file.name);
  if (!ALLOWED_IMAGE_EXT.includes(ext)) throw new Error("Use JPG, PNG ou WebP");
  if (file.size > 5 * 1024 * 1024) throw new Error("Imagem acima de 5 MB");
  const path = productImagePath(orgId, product.sku, product.id, ext);
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw new Error("Não foi possível enviar a imagem");
  return path;
}

export async function removeProductImage(path: string | null) {
  if (!path || /^https?:\/\//i.test(path)) return;
  await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
}

/** Short-lived signed URLs, generated only for display. */
export async function signProductImages(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const toSign = paths.filter((p) => { if (/^https?:\/\//i.test(p)) { out[p] = p; return false; } return true; });
  for (let i = 0; i < toSign.length; i += 100) {
    const { data } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).createSignedUrls(toSign.slice(i, i + 100), 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  }
  return out;
}

export type Disponibilidade = "estoque" | "sob_encomenda" | "descontinuado";
export const DISPONIBILIDADE_LABEL: Record<Disponibilidade, string> = {
  estoque: "Em estoque", sob_encomenda: "Sob encomenda", descontinuado: "Descontinuado",
};

/** Reactivation goes back to "sob_encomenda" for partner-catalog items, else "estoque". */
export function reactivationStatus(p: { specifications?: Record<string, unknown> | null }): Disponibilidade {
  const s = p.specifications ?? {};
  return s.disponibilidade === "sob_encomenda" || typeof s.origem === "string" && String(s.origem).startsWith("catalogo_") ? "sob_encomenda" : "estoque";
}
