import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle } from "lucide-react";
import { useSubmitTestFeedback } from "@/hooks/use-ekkoa-workflow";
import type { Operation } from "@/hooks/use-operations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: Operation | null;
  leadId?: string;
}

export default function TestFeedbackDialog({ open, onOpenChange, operation, leadId }: Props) {
  const [approved, setApproved] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [contractTitle, setContractTitle] = useState("");
  const [contractType, setContractType] = useState("instalacao");
  const [monthlyValue, setMonthlyValue] = useState("");
  const [duration, setDuration] = useState("12");

  const submitFeedback = useSubmitTestFeedback();

  const handleSubmit = async () => {
    if (approved === null || !operation) return;

    await submitFeedback.mutateAsync({
      operationId: operation.id,
      leadId,
      approved,
      feedback,
      // Contract data for auto-creation on approval
      ...(approved && {
        contractData: {
          title: contractTitle || `Contrato - ${operation.title}`,
          contractType,
          monthlyValue: parseFloat(monthlyValue) || 0,
          durationMonths: parseInt(duration) || 12,
          clientId: operation.client_id || undefined,
        },
      }),
    });
    onOpenChange(false);
    // Reset
    setApproved(null);
    setFeedback("");
    setContractTitle("");
    setContractType("instalacao");
    setMonthlyValue("");
    setDuration("12");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Feedback do Teste</DialogTitle>
          <DialogDescription>
            {operation?.title} — Avalie o resultado do período de teste.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Approval buttons */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant={approved === true ? "default" : "outline"}
              className={approved === true ? "bg-emerald-600 hover:bg-emerald-700 flex-1" : "flex-1"}
              onClick={() => setApproved(true)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />Aprovado
            </Button>
            <Button
              type="button"
              variant={approved === false ? "destructive" : "outline"}
              className="flex-1"
              onClick={() => setApproved(false)}
            >
              <XCircle className="h-4 w-4 mr-2" />Não Aprovado
            </Button>
          </div>

          {/* Feedback text */}
          <div>
            <Label>Feedback / Observações</Label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="Descreva o resultado do teste..."
            />
          </div>

          {/* Auto-contract form (only on approval) */}
          {approved === true && (
            <div className="space-y-3 p-3 rounded-lg border border-dashed bg-muted/30">
              <p className="text-sm font-medium">Gerar Contrato Automaticamente</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Título do Contrato</Label>
                  <Input
                    value={contractTitle}
                    onChange={(e) => setContractTitle(e.target.value)}
                    placeholder={`Contrato - ${operation?.title || ""}`}
                  />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={contractType} onValueChange={setContractType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instalacao">Instalação</SelectItem>
                      <SelectItem value="manutencao">Manutenção</SelectItem>
                      <SelectItem value="locacao">Locação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Duração (meses)</Label>
                  <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={1} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Valor Mensal (R$)</Label>
                  <Input type="number" step="0.01" value={monthlyValue} onChange={(e) => setMonthlyValue(e.target.value)} placeholder="0,00" />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={approved === null || submitFeedback.isPending}
            >
              {submitFeedback.isPending ? "Enviando..." : "Enviar Feedback"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
