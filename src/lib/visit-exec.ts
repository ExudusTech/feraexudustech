export * from "../../supabase/functions/_shared/visit-exec";
import { supabase } from "@/integrations/supabase/client";

export const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", confirmado: "Confirmado", em_atendimento: "Em atendimento", concluido: "Concluído",
  nao_realizado: "Não realizado", cancelado: "Cancelado",
};
export const CONFIRMACAO_LABEL: Record<string, string> = {
  pendente: "Aguardando confirmação", confirmado: "Cliente confirmou", remarcar: "Cliente pediu para remarcar",
  sem_resposta: "Sem resposta do cliente", nao_aplicavel: "",
};
export const ITEM_OPTIONS: { value: string; label: string }[] = [
  { value: "refil_reposto", label: "Refil reposto" }, { value: "problema_encontrado", label: "Problema encontrado" },
  { value: "aparelho_trocado", label: "Aparelho trocado" }, { value: "limpeza_realizada", label: "Limpeza realizada" },
  { value: "treinamento", label: "Treinamento da equipe" },
];

export class VisitActionError extends Error { constructor(message: string, public data?: Record<string, unknown>) { super(message); } }

/** Friendly Portuguese message for a failed backend call (no connection, expired session, server error). */
export function friendlyActionError(status: number | undefined, serverMessage: unknown, offline = false): string {
  if (offline) return "Sem conexão com a internet. O que você preencheu foi mantido; tente salvar de novo quando o sinal voltar.";
  if (typeof serverMessage === "string" && serverMessage.trim() && status !== 401) return serverMessage;
  if (status === 401) return "Sua sessão precisou ser renovada. O que você preencheu foi mantido; toque em salvar de novo.";
  if (!status) return "Não foi possível falar com o servidor. Verifique a conexão; o que você preencheu foi mantido.";
  return "Não foi possível concluir agora. O que você preencheu foi mantido; tente de novo.";
}

/** Calls a backend function; on an expired token it refreshes the session once and retries, never signing the user out. */
export async function invokeAction<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (!error) return data as T;
    const ctx = (error as { context?: Response }).context;
    const status = ctx && typeof ctx.status === "number" ? ctx.status : undefined;
    let payload: Record<string, unknown> | undefined;
    try { payload = await ctx?.json(); } catch { payload = undefined; }
    if (status === 401 && attempt === 0) { await supabase.auth.refreshSession().catch(() => undefined); continue; }
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new VisitActionError(friendlyActionError(status, payload?.error, offline), payload);
  }
  throw new VisitActionError(friendlyActionError(401, undefined));
}

/** Calls the visit-actions backend function and surfaces its friendly error message. */
export function visitAction<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  return invokeAction<T>("visita-acoes", body);
}

export function getPosition(): Promise<{ lat: number; lng: number; precisao: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}
