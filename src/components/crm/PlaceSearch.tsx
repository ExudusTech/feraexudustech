import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { baseAction } from "@/lib/base-instalada";

export interface Place { place_id: string; nome: string; endereco: string; lat: number | null; lng: number | null; cidade: string | null; estado: string | null }

/** Google establishment search (same lookup used by the field visit flow). */
export default function PlaceSearch({ onPick }: { onPick: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const buscar = async () => {
    setBusy(true);
    try { const r = await baseAction<{ resultados: Place[] }>({ action: "buscar_local", q }); setPlaces(r.resultados ?? []); }
    catch { setPlaces([]); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa no Google (nome + cidade)" maxLength={120}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (q.trim().length >= 3) buscar(); } }} />
        <Button type="button" variant="outline" onClick={buscar} disabled={busy || q.trim().length < 3} aria-label="Buscar no Google">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      {places.map((p) => (
        <button type="button" key={p.place_id} onClick={() => { onPick(p); setPlaces([]); }}
          className="w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
          <strong>{p.nome}</strong><span className="block text-xs text-muted-foreground">{p.endereco}</span>
        </button>
      ))}
    </div>
  );
}
