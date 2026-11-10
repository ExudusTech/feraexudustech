import { useState } from "react";
import { QrCode, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { baseAction } from "@/lib/base-instalada";
import { formatEtiqueta } from "@/lib/etiquetas";
import EtiquetaScanner from "@/components/etiquetas/EtiquetaScanner";

export interface ItemReservado { product_id: string; descricao: string; quantidade: number }
interface Props { scheduleId?: string; osId?: string; itens: ItemReservado[]; separados: { id: string; etiqueta_numero: number | null; product_id: string | null }[]; onDone: () => void }

/** Separation by scan: stick any label, scan it and pick which reserved device it is → "aparelho nº X separado". */
export default function SepararEtiqueta({ scheduleId, osId, itens, separados, onDone }: Props) {
  const [scan, setScan] = useState(false);
  const [numero, setNumero] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (!itens.length) return null;
  const faltam = itens.map((i) => ({ ...i, falta: i.quantidade - separados.filter((s) => s.product_id === i.product_id).length }));
  const separar = async (n: number, productId: string) => {
    setBusy(true);
    try {
      await baseAction({ action: "etiqueta_separar", numero: n, product_id: productId, ...(scheduleId ? { schedule_id: scheduleId } : { os_id: osId }) });
      toast({ title: `Aparelho nº ${formatEtiqueta(n)} separado` }); setNumero(null); onDone();
    } catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); } finally { setBusy(false); }
  };
  const desfazer = async (id: string) => {
    try { await baseAction({ action: "etiqueta_desfazer_separacao", comodato_id: id }); onDone(); }
    catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); }
  };
  const abertos = faltam.filter((i) => i.falta > 0);
  return (
    <div className="w-full space-y-1">
      {separados.map((s) => (
        <span key={s.id} className="mr-1 inline-flex items-center gap-1">
          <Badge className="gap-1">aparelho nº {formatEtiqueta(s.etiqueta_numero)} separado</Badge>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Desfazer separação nº ${formatEtiqueta(s.etiqueta_numero)}`} onClick={() => desfazer(s.id)}><Undo2 className="h-3 w-3" /></Button>
        </span>))}
      {abertos.length > 0 && !numero && <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={busy} onClick={() => setScan(true)}><QrCode className="h-4 w-4 mr-1" />Escanear etiqueta</Button>}
      {numero && <div className="rounded border p-2 space-y-1">
        <p className="text-xs">Etiqueta nº {formatEtiqueta(numero)}: qual item reservado é?</p>
        <div className="flex flex-wrap gap-2">{abertos.map((i) => (
          <Button key={i.product_id} type="button" size="sm" className="min-h-9 h-auto whitespace-normal" disabled={busy} onClick={() => separar(numero, i.product_id)}>{i.descricao} (faltam {i.falta})</Button>))}
          <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => setNumero(null)}>Cancelar</Button></div>
      </div>}
      <EtiquetaScanner open={scan} onOpenChange={setScan} titulo="Separar aparelho" descricao="Cole qualquer etiqueta no aparelho e escaneie."
        onNumero={(n) => { setScan(false); if (abertos.length === 1) separar(n, abertos[0].product_id); else setNumero(n); }} />
    </div>
  );
}
