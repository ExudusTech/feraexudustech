import type { GeolocationErrorType } from "../../supabase/functions/_shared/visit-exec";

export interface VisitPosition { lat: number; lng: number; precisao: number; timestamp: number }
export interface LocationResult { position: VisitPosition | null; error: GeolocationErrorType | null; cached: boolean }
export const RECENT_POSITION_MS = 60_000;
let recentPosition: VisitPosition | null = null;

export function locationErrorMessage(error: string | null): string {
  switch (error) {
    case "PERMISSION_DENIED": return "O navegador recusou o acesso à localização. Confira a permissão do aplicativo e do celular.";
    case "POSITION_UNAVAILABLE": return "O celular não conseguiu determinar sua posição. Confira se a localização está ligada e tente em um local com melhor sinal.";
    case "TIMEOUT": return "O celular demorou demais para obter a localização. Tente de novo em um local com melhor sinal.";
    case "UNSUPPORTED": return "Este navegador não disponibilizou a localização. Abra o Fera em um navegador atualizado.";
    case "INVALID_POSITION": return "O celular devolveu uma posição inválida. Tente de novo.";
    default: return "Não foi possível obter a localização; o navegador não informou a causa.";
  }
}

/** Memory only: exact GPS is never persisted in browser storage. Capture starts in the button gesture. */
export async function getPosition(geo: Geolocation | undefined = navigator.geolocation): Promise<LocationResult> {
  if (!geo) return { position: null, error: "UNSUPPORTED", cached: false };
  const attempt = (timeout: number) => new Promise<LocationResult>((resolve) => {
    try {
      geo.getCurrentPosition((p) => {
        const { latitude: lat, longitude: lng, accuracy: precisao } = p.coords;
        if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 || !Number.isFinite(precisao) || precisao < 0) {
          resolve({ position: null, error: "INVALID_POSITION", cached: false }); return;
        }
        const timestamp = p.timestamp;
        if (!Number.isFinite(timestamp) || timestamp > Date.now() || Date.now() - timestamp > RECENT_POSITION_MS) {
          resolve({ position: null, error: "POSITION_UNAVAILABLE", cached: false }); return;
        }
        recentPosition = { lat, lng, precisao, timestamp };
        resolve({ position: recentPosition, error: null, cached: false });
      }, (e) => resolve({ position: null, error: e.code === 1 ? "PERMISSION_DENIED" : e.code === 2 ? "POSITION_UNAVAILABLE" : e.code === 3 ? "TIMEOUT" : "UNKNOWN", cached: false }),
      { enableHighAccuracy: true, timeout, maximumAge: RECENT_POSITION_MS });
    } catch { resolve({ position: null, error: "UNKNOWN", cached: false }); }
  });
  let result = await attempt(20_000);
  if (result.position || result.error === "PERMISSION_DENIED") return result;
  result = await attempt(45_000);
  if (!result.position && result.error !== "PERMISSION_DENIED" && recentPosition && Date.now() - recentPosition.timestamp <= RECENT_POSITION_MS) {
    return { position: recentPosition, error: result.error, cached: true };
  }
  return result;
}