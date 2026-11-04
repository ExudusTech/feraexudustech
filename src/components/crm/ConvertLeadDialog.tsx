import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useConvertLeadToClient, MOTIVO_LABEL, type ConversionCandidate } from "@/hooks/use-lead-conversion";

interface Props { leadId: string | null; nome?: string; onOpenChange: (o: boolean) => void; onDone?: () => void }

/** Confirms "Converter em cliente" and, if a matching client exists, lets the user link to it instead of duplicating. */
export default function ConvertLeadDialog({ leadId, nome, onOpenChange, onDone }: Props) {
  const convert = useConvertLeadToClient();
  const [cands, setCands] = useState<ConversionCandidate[] | null>(null);
  useEffect(() => { if (leadId) setCands(null); }, [leadId]);

  const run = async (opts: { clienteExistente?: string; ignorarDuplicados?: boolean } = {}) => {
    if (!leadId) return;
    const r = await convert.mutateAsync({ lead: { id: leadId }, ...opts });
    if (r.status === "duplicados") { setCands(r.candidatos); return; }
    onOpenChange(false); onDone?.();
  };

  return (
    <AlertDialog open={!!leadId} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Converter em cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            {cands ? "Já existe cliente parecido. Ligue o lead a ele para não duplicar, ou crie um novo." :
              `${nome ?? "Este lead"} vira cliente, levando endereço, localização e contatos. O lead continua no histórico, ligado ao cliente.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {cands && (
          <div className="space-y-2">
            {cands.map((c) => (
              <Button key={c.id} variant="outline" className="w-full h-auto justify-start text-left whitespace-normal" disabled={convert.isPending}
                onClick={() => run({ clienteExistente: c.id })}>
                <span><strong>Ligar a {c.name}</strong><span className="block text-xs text-muted-foreground">{c.city || "—"} · {MOTIVO_LABEL[c.motivo]}</span></span>
              </Button>
            ))}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Agora não</AlertDialogCancel>
          <Button disabled={convert.isPending} variant={cands ? "secondary" : "default"} onClick={() => run({ ignorarDuplicados: !!cands })}>
            {cands ? "Criar novo cliente mesmo assim" : "Converter"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
