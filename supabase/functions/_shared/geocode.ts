// Address → coordinates for clients, leads and schedules that lack them (Google Geocoding, read-only).
// Every attempt stamps geocode_tentado_em so an address is retried only after the row is edited.

export interface GeoAddress { endereco?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null; cep?: string | null }

export function geocodeQuery(a: GeoAddress): string | null {
  const cep = String(a.cep ?? "").replace(/\D/g, "");
  const parts = [a.endereco, a.bairro, a.cidade, a.estado].map((p) => String(p ?? "").trim()).filter(Boolean);
  // A city alone is too coarse to validate a check-in (Cabo Frio centre is km away from most clients).
  if (cep.length !== 8 && !String(a.endereco ?? "").trim()) return null;
  if (cep.length === 8) parts.push(`${cep.slice(0, 5)}-${cep.slice(5)}`);
  return parts.length ? `${parts.join(", ")}, Brasil` : null;
}

export async function geocode(a: GeoAddress, fetcher: typeof fetch = fetch): Promise<{ lat: number; lng: number } | null> {
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const q = geocodeQuery(a);
  if (!key || !q) return null;
  try {
    const r = await fetcher(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=br&language=pt-BR&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) { console.error("[geocode] http", r.status); return null; }
    const d = await r.json();
    const top = d.results?.[0];
    // Reject country/state-level matches: they would make a far-away check-in look valid.
    const types: string[] = top?.types ?? [];
    if (!top || types.some((t) => ["country", "administrative_area_level_1", "administrative_area_level_2", "locality"].includes(t))) return null;
    const { lat, lng } = top.geometry?.location ?? {};
    return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  } catch { console.error("[geocode] failed"); return null; }
}

type Admin = any;
const now = () => new Date().toISOString();

export async function geocodeClient(admin: Admin, id: string) {
  const { data: c } = await admin.from("clients").select("id, address, city, state, zip_code, latitude").eq("id", id).maybeSingle();
  if (!c || c.latitude != null) return c?.latitude != null ? null : null;
  const p = await geocode({ endereco: c.address, cidade: c.city, estado: c.state, cep: c.zip_code });
  await admin.from("clients").update(p ? { latitude: p.lat, longitude: p.lng, localizacao_origem: "google", geocode_tentado_em: now() } : { geocode_tentado_em: now() }).eq("id", id);
  return p;
}

export async function geocodeLead(admin: Admin, id: string) {
  const { data: l } = await admin.from("leads").select("id, endereco, bairro, city, zip_code, latitude").eq("id", id).maybeSingle();
  if (!l || l.latitude != null) return null;
  const p = await geocode({ endereco: l.endereco, bairro: l.bairro, cidade: l.city, cep: l.zip_code });
  await admin.from("leads").update(p ? { latitude: p.lat, longitude: p.lng, localizacao_origem: "google", geocode_tentado_em: now() } : { geocode_tentado_em: now() }).eq("id", id);
  return p;
}

export async function geocodeSchedule(admin: Admin, id: string) {
  const { data: s } = await admin.from("schedules").select("id, location, zip_code, latitude").eq("id", id).maybeSingle();
  if (!s || s.latitude != null) return null;
  const p = await geocode({ endereco: s.location, cep: s.zip_code });
  await admin.from("schedules").update(p ? { latitude: p.lat, longitude: p.lng, geocode_tentado_em: now() } : { geocode_tentado_em: now() }).eq("id", id);
  return p;
}

/** Bounded batch for the 15-min scheduler: rows never tried, or edited after the last try. */
export async function geocodePending(admin: Admin, limit = 15) {
  let n = 0;
  const pick = async (table: string, fn: (a: Admin, id: string) => Promise<unknown>) => {
    const { data } = await admin.from(table).select("id, updated_at, geocode_tentado_em").is("latitude", null)
      .order("geocode_tentado_em", { ascending: true, nullsFirst: true }).limit(limit * 3);
    const rows = (data ?? []).filter((r: any) => !r.geocode_tentado_em || r.updated_at > r.geocode_tentado_em).slice(0, limit - n);
    for (const r of rows) { if (await fn(admin, r.id)) n++; }
    return rows.length;
  };
  const tried = (await pick("clients", geocodeClient)) + (await pick("leads", geocodeLead)) + (await pick("schedules", geocodeSchedule));
  return { tentados: tried, geocodificados: n };
}
