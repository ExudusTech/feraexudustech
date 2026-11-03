import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useClients } from "@/hooks/use-clients";
import { baseAction } from "@/lib/base-instalada";
import { VisitActionError } from "@/lib/visit-exec";

interface Place { place_id: string; nome: string; endereco: string; lat: number | null; lng: number | null; cidade: string | null; estado: string | null }
interface Props { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (scheduleId: string) => void }

/** Field registration: pick an existing client or find the establishment (Google) / type its name, then open the visit now. */
export default function NovaManutencaoDialog({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<{ nome: string; place?: Place } | null>(null);
  const matches = q.trim().length >= 2 ? clients.filter((c: any) => `${c.name} ${c.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await baseAction<{ schedule_id: string }>({ action: "nova_manutencao", ...body });
      qc.invalidateQueries({ queryKey: ["schedules"] }); qc.invalidateQueries({ queryKey: ["clients"] });
      setQ(""); setPlaces([]); setDup(null); onOpenChange(false); onCreated(r.schedule_id);
    } catch (e) {
      if (e instanceof VisitActionError && e.data?.duplicado) { setDup({ nome: String(body.nome), place: body.place as Place | undefined }); return; }
      toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally { setBusy(false); }
  };
  const buscar = async () => {
    setBusy(true);
    try { const r = await baseAction<{ resultados: Place[] }>({ action: "buscar_local", q }); setPlaces(r.resultados ?? []); }
    catch { setPlaces([]); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova visita de manutenção</DialogTitle>
          <DialogDescription>Escolha o cliente ou procure o estabelecimento. A visita é aberta agora, em seu nome.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="nm-q">Estabelecimento</Label>
          <div className="flex gap-2">
            <Input id="nm-q" value={q} onChange={(e) => { setQ(e.target.value); setDup(null); }} placeholder="Ex.: Restaurante X Búzios" maxLength={120} />
            <Button variant="outline" onClick={buscar} disabled={busy || q.trim().length < 3} aria-label="Buscar no Google"><Search className="h-4 w-4" /></Button>
          </div>
        </div>
        {matches.length > 0 && <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Clientes cadastrados</p>
          {matches.map((c: any) => <Button key={c.id} variant="outline" className="w-full justify-start min-h-11" disabled={busy} onClick={() => run({ client_id: c.id })}>
            {c.name}{c.city && <span className="text-muted-foreground ml-1">· {c.city}</span>}</Button>)}
        </div>}
        {places.length > 0 && <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Resultados do Google</p>
          {places.map((p) => <Button key={p.place_id} variant="outline" className="w-full h-auto min-h-11 justify-start text-left whitespace-normal" disabled={busy}
            onClick={() => run({ nome: p.nome, place: p })}><span><strong>{p.nome}</strong><span className="block text-xs text-muted-foreground">{p.endereco}</span></span></Button>)}
        </div>}
        {dup ? (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm">Já existe um cliente chamado "{dup.nome}". Escolha-o na lista acima ou cadastre outro mesmo assim.</p>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => run({ nome: dup.nome, place: dup.place, forcar: true })}>Cadastrar mesmo assim</Button>
          </div>
        ) : q.trim().length >= 2 && (
          <Button className="w-full min-h-12" disabled={busy} onClick={() => run({ nome: q.trim() })}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Cadastrar "{q.trim()}" e iniciar</Button>)}
      </DialogContent>
    </Dialog>
  );
}
