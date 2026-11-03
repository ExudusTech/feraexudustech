export * from "../../supabase/functions/_shared/base-instalada";
import { supabase } from "@/integrations/supabase/client";
import { VisitActionError } from "@/lib/visit-exec";

/** Calls the installed-base backend function and surfaces its friendly error message. */
export async function baseAction<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("base-instalada", { body });
  if (error) {
    let payload: Record<string, unknown> | undefined;
    try { payload = await (error as { context?: Response }).context?.json(); } catch { payload = undefined; }
    throw new VisitActionError(typeof payload?.error === "string" ? payload.error : "Não foi possível concluir. Tente de novo.", payload);
  }
  return data as T;
}

/** Shrinks a phone photo to at most 1600px JPEG and uploads it under the visit's private folder. */
export async function uploadVisitPhoto(orgId: string, scheduleId: string, file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let blob: Blob = file;
  if (bitmap) {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.8));
  }
  const path = `${orgId}/${scheduleId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("visit-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("A foto não foi enviada. Verifique a conexão e tente de novo.");
  return path;
}

export const ESTADO_CLASS: Record<string, string> = {
  verde: "bg-success text-success-foreground", amarelo: "bg-warning text-warning-foreground", vermelho: "bg-destructive text-destructive-foreground",
};
export const ESTADO_HEX: Record<string, string> = { verde: "hsl(142 70% 45%)", amarelo: "hsl(45 95% 55%)", vermelho: "hsl(0 80% 55%)" };
