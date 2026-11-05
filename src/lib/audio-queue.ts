// Offline-resistant audio queue (Lote 15): recordings are kept in IndexedDB until the upload and registration succeed.
import { supabase } from "@/integrations/supabase/client";
import { visitAction } from "@/lib/visit-exec";

export interface AudioItem { id: string; scheduleId: string; orgId: string; blob: Blob; mime: string; duracao: number; createdAt: number }
const DB = "fera-audio"; const STORE = "fila";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const q = fn(db.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export const enqueue = (i: AudioItem) => tx("readwrite", (s) => s.put(i));
export const pending = async (scheduleId?: string) => ((await tx<AudioItem[]>("readonly", (s) => s.getAll())) ?? []).filter((i) => !scheduleId || i.scheduleId === scheduleId);
const remove = (id: string) => tx("readwrite", (s) => s.delete(id));

let flushing = false;
/** Uploads every queued audio; failures stay queued for the next attempt. Returns how many were sent. */
export async function flushAudio(): Promise<number> {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return 0;
  flushing = true; let sent = 0;
  try {
    for (const i of await pending()) {
      const ext = i.mime.includes("mp4") ? "m4a" : i.mime.includes("ogg") ? "ogg" : "webm";
      const path = `${i.orgId}/${i.scheduleId}/${i.id}.${ext}`;
      const { error } = await supabase.storage.from("visit-audio").upload(path, i.blob, { contentType: i.mime.split(";")[0] || "audio/webm", upsert: true });
      if (error) continue;
      try { await visitAction({ id: i.scheduleId, action: "audio", audio_path: path, duracao_s: i.duracao, client_uuid: i.id }); }
      catch { continue; }
      await remove(i.id); sent++;
    }
  } finally { flushing = false; }
  return sent;
}

export function pickMime(): string {
  const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return typeof MediaRecorder !== "undefined" ? opts.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "" : "";
}
