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

/** Calls the visit-actions backend function and surfaces its friendly error message. */
export async function visitAction<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("visita-acoes", { body });
  if (error) {
    let payload: Record<string, unknown> | undefined;
    try { payload = await (error as { context?: Response }).context?.json(); } catch { payload = undefined; }
    throw new VisitActionError(typeof payload?.error === "string" ? payload.error : "Não foi possível concluir. Tente de novo.", payload);
  }
  return data as T;
}

export function getPosition(): Promise<{ lat: number; lng: number; precisao: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}
