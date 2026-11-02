import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RESULTADO_LABEL, useAtendimentoAction, type Atendimento } from "@/hooks/use-atendimentos";

export default function ResolveDialog({ atendimento, onClose }: { atendimento: Atendimento | null; onClose: () => void }) {
  const action = useAtendimentoAction();
  const [resultado, setResultado] = useState("");
  const [resolucao, setResolucao] = useState("");
  const [moverPerdido, setMoverPerdido] = useState(false);
  const valid = resultado && resolucao.trim().length >= 3;
  const close = () => { setResultado(""); setResolucao(""); setMoverPerdido(false); onClose(); };
  const submit = async () => {
    if (!atendimento || !valid) return;
    await action.mutateAsync({ id: atendimento.id, action: "resolver", resultado, resolucao: resolucao.trim(), mover_perdido: resultado === "perdido" && moverPerdido });
    close();
  };
  return (
    <Dialog open={!!atendimento} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resolver atendimento</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger aria-label="Resultado"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{Object.entries(RESULTADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resolucao">Resolução (obrigatória)</Label>
            <Textarea id="resolucao" maxLength={500} value={resolucao} onChange={(e) => setResolucao(e.target.value)} placeholder="Ex.: Enviei a tabela de preços e agendei visita para quinta." />
          </div>
          {resultado === "perdido" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={moverPerdido} onCheckedChange={(v) => setMoverPerdido(v === true)} />
              Mover o lead para a etapa “Perdido”
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid || action.isPending}>{action.isPending ? "Salvando..." : "Resolver"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
