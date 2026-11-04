import { useEffect, useState } from "react";

/** Local drafts keep what the consultant filled in during a visit until it is saved (survives errors, reloads and the camera app). */
const PREFIX = "fera:rascunho:";
const OPEN_KEY = "fera:visita-aberta";
const MAX_AGE_MS = 2 * 24 * 3_600_000;

function store(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export function readDraft<T>(key: string): T | null {
  const raw = store()?.getItem(PREFIX + key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at: number; v: T };
    if (!parsed || typeof parsed.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) { clearDraft(key); return null; }
    return parsed.v;
  } catch { clearDraft(key); return null; }
}

export function writeDraft<T>(key: string, value: T | null | undefined): void {
  const s = store(); if (!s) return;
  try {
    if (value === null || value === undefined) s.removeItem(PREFIX + key);
    else s.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), v: value }));
  } catch { /* storage full or blocked: draft is best effort */ }
}

export function clearDraft(key: string): void { try { store()?.removeItem(PREFIX + key); } catch { /* ignore */ } }

/** useState that mirrors itself into a local draft. */
export function useDraftState<T>(key: string, initial: T): [T, (v: T | ((cur: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readDraft<T>(key) ?? initial);
  useEffect(() => { setValue(readDraft<T>(key) ?? initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  useEffect(() => { writeDraft(key, value); }, [key, value]);
  return [value, setValue];
}

/** Remembers which visit was open so it reopens after the phone reloads the page. */
export function rememberOpenVisit(id: string | null): void {
  try { if (id) sessionStorage.setItem(OPEN_KEY, id); else sessionStorage.removeItem(OPEN_KEY); } catch { /* ignore */ }
}
export function openVisitFromSession(): string | null {
  try { return sessionStorage.getItem(OPEN_KEY); } catch { return null; }
}

export interface ClosingState {
  finished: boolean; resultado: string; resumo: string; proximo: string; pendingPoints: number; totalPoints: number;
  fotoObrigatoria: boolean; fotos: number; dataAlvo?: string; motivoPerda?: string; confPerdido?: boolean;
}

/** What is still missing to close the visit, in plain Portuguese. Empty list = can close. */
export function faltasParaEncerrar(c: ClosingState): string[] {
  const f: string[] = [];
  if (c.pendingPoints > 0) f.push(c.pendingPoints === 1 ? "avaliar 1 ponto" : `avaliar ${c.pendingPoints} pontos`);
  if (c.fotoObrigatoria && c.totalPoints === 0 && c.fotos < 1) f.push("cadastrar um ponto ou tirar uma foto do equipamento");
  if (!c.resultado) f.push("resultado");
  if (c.resumo.trim().length < 3) f.push("resumo");
  if (!c.proximo) f.push("próximo passo");
  else if (c.proximo === "follow_up" && !c.dataAlvo) f.push("data do follow-up");
  else if (c.proximo === "perdido" && ((c.motivoPerda ?? "").trim().length < 3 || !c.confPerdido)) f.push("motivo e confirmação da perda");
  return f;
}
