import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useProductImageUrls } from "@/hooks/use-product-images";
import { FOTO_REF_SLOTS, normalizarFotosRef, salvarFotoRef, type FotoRefSlot, type FotosReferencia as Fotos } from "@/lib/fotos-referencia";

interface Props { orgId: string; product: { id: string; name: string; fotos_referencia?: unknown }; canEdit: boolean }

/** Up to 3 reference photos (front, side, nameplate) of a dispenser model; on a phone the button opens the camera or the gallery. */
export default function FotosReferencia({ orgId, product, canEdit }: Props) {
  const qc = useQueryClient();
  const [fotos, setFotos] = useState<Fotos>(() => normalizarFotosRef(product.fotos_referencia));
  const [busy, setBusy] = useState<FotoRefSlot | null>(null);
  const { data: urls = {} } = useProductImageUrls(Object.values(fotos));

  const trocar = async (slot: FotoRefSlot, file: File | null) => {
    setBusy(slot);
    try {
      const next = await salvarFotoRef(orgId, { id: product.id, fotos_referencia: fotos }, slot, file);
      setFotos(next);
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: file ? "Foto salva" : "Foto removida" });
    } catch (e) {
      toast({ title: "Atenção", description: e instanceof Error ? e.message : "Tente de novo.", variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {FOTO_REF_SLOTS.map((s) => {
        const path = fotos[s.key];
        return (
          <div key={s.key} className="space-y-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{s.label}</p>
            <div className="aspect-square rounded-md border bg-muted flex items-center justify-center overflow-hidden">
              {busy === s.key ? <Loader2 className="h-5 w-5 animate-spin" />
                : path && urls[path] ? <img src={urls[path]} alt={`${product.name} — ${s.label}`} className="h-full w-full object-cover" />
                : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
            </div>
            {canEdit && <div className="flex gap-1">
              <Button asChild type="button" variant="outline" size="sm" className="flex-1 min-h-11 px-1 text-xs" disabled={!!busy}>
                <label className="cursor-pointer" aria-label={`${path ? "Trocar" : "Adicionar"} foto ${s.label}`}><Camera className="h-4 w-4" />{path ? "Trocar" : "Foto"}
                  <input type="file" accept="image/*" className="sr-only" disabled={!!busy}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) trocar(s.key, f); }} /></label>
              </Button>
              {path && <Button type="button" variant="ghost" size="icon" className="min-h-11 shrink-0" disabled={!!busy} aria-label={`Remover foto ${s.label}`} onClick={() => trocar(s.key, null)}>
                <Trash2 className="h-4 w-4" /></Button>}
            </div>}
          </div>);
      })}
    </div>
  );
}
