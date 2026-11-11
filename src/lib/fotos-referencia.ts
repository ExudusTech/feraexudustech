import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/product-images";

/** Reference photos of a dispenser model (up to 3), used to recognise the right device in the field. */
export const FOTO_REF_SLOTS = [
  { key: "frente", label: "Frente" },
  { key: "lado", label: "Lado" },
  { key: "plaqueta", label: "Plaqueta/código" },
] as const;
export type FotoRefSlot = typeof FOTO_REF_SLOTS[number]["key"];
export type FotosReferencia = Partial<Record<FotoRefSlot, string>>;
const SLOT_KEYS: readonly string[] = FOTO_REF_SLOTS.map((s) => s.key);

/** Keeps only known slots with a non-empty storage path (max 3). */
export function normalizarFotosRef(v: unknown): FotosReferencia {
  const out: FotosReferencia = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
    if (SLOT_KEYS.includes(k) && typeof p === "string" && p.trim()) out[k as FotoRefSlot] = p.trim();
  }
  return out;
}

/** Thumbnail shown when choosing a device: front, side, nameplate, then the catalogue image. */
export function fotoPrincipal(p: { fotos_referencia?: unknown; image_url?: string | null }): string | null {
  const f = normalizarFotosRef(p.fotos_referencia);
  return f.frente ?? f.lado ?? f.plaqueta ?? p.image_url ?? null;
}

/** Ordered list of filled slots for display. */
export function listaFotosRef(v: unknown): { key: FotoRefSlot; label: string; path: string }[] {
  const f = normalizarFotosRef(v);
  return FOTO_REF_SLOTS.filter((s) => f[s.key]).map((s) => ({ key: s.key, label: s.label, path: f[s.key]! }));
}

/** Storage path under the organization folder (bucket policies key on it); a fresh name per upload avoids stale cached images. */
export function fotoRefPath(orgId: string, productId: string, slot: FotoRefSlot, stamp: number = Date.now()): string {
  return `${orgId}/referencia/${productId}/${slot}-${stamp}.jpg`;
}

/** Applies a slot change, returning the new map and the path that is no longer used (to delete). */
export function trocarFotoRef(atual: unknown, slot: FotoRefSlot, novo: string | null): { fotos: FotosReferencia; remover: string | null } {
  const fotos = { ...normalizarFotosRef(atual) };
  const antigo = fotos[slot] ?? null;
  if (novo) fotos[slot] = novo; else delete fotos[slot];
  return { fotos, remover: antigo && antigo !== novo ? antigo : null };
}

/** Phone photos are resized (longest side 1600 px) and saved as JPEG before upload. */
async function comprimir(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}

/** Uploads one reference photo and saves the slot on the product; the replaced file is removed. */
export async function salvarFotoRef(orgId: string, product: { id: string; fotos_referencia?: unknown }, slot: FotoRefSlot, file: File | null): Promise<FotosReferencia> {
  let path: string | null = null;
  if (file) {
    if (!file.type.startsWith("image/")) throw new Error("Escolha uma foto");
    const blob = await comprimir(file);
    if (blob.size > 5 * 1024 * 1024) throw new Error("Foto acima de 5 MB");
    path = fotoRefPath(orgId, product.id, slot);
    const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw new Error("A foto não foi enviada. Verifique a conexão e tente de novo.");
  }
  const { fotos, remover } = trocarFotoRef(product.fotos_referencia, slot, path);
  const { error } = await supabase.from("products").update({ fotos_referencia: fotos }).eq("id", product.id);
  if (error) {
    if (path) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
    throw new Error("Não foi possível salvar a foto");
  }
  if (remover) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([remover]).catch(() => undefined);
  return fotos;
}
