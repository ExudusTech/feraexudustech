import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateEkkoaContract, useUpdateEkkoaContract, type EkkoaContract } from "@/hooks/use-ekkoa-contracts";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; contract?: EkkoaContract | null; }

const empty = { title: "", description: "", contract_number: "", contract_type: "instalacao", start_date: "", end_date: "", total_value: "0", monthly_value: "0", payment_method: "", payment_terms: "", status: "rascunho", notes: "" };

export default function EkkoaContractFormDialog({ open, onOpenChange, contract }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateEkkoaContract();
  const update = useUpdateEkkoaContract();
  const isEdit = !!contract;

  useEffect(() => {
    if (contract) {
      setForm({
        title: contract.title, description: contract.description || "",
        contract_number: contract.contract_number || "", contract_type: contract.contract_type,
        start_date: contract.start_date || "", end_date: contract.end_date || "",
        total_value: String(contract.total_value), monthly_value: String(contract.monthly_value || 0),
        payment_method: contract.payment_method || "", payment_terms: contract.payment_terms || "",
        status: contract.status, notes: contract.notes || "",
      });
    } else setForm(empty);
  }, [contract, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title, description: form.description || null, contract_number: form.contract_number || null,
      contract_type: form.contract_type, start_date: form.start_date || null, end_date: form.end_date || null,
      total_value: parseFloat(form.total_value) || 0, monthly_value: parseFloat(form.monthly_value) || null,
      payment_method: form.payment_method || null, payment_terms: form.payment_terms || null,
      status: form.status, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: contract!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Contrato" : "Novo Contrato"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div><Label>Nº Contrato</Label><Input value={form.contract_number} onChange={(e) => set("contract_number", e.target.value)} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.contract_type} onValueChange={(v) => set("contract_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instalacao">Instalação</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="locacao">Locação</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Valor Total (R$)</Label><Input type="number" step="0.01" value={form.total_value} onChange={(e) => set("total_value", e.target.value)} /></div>
            <div><Label>Valor Mensal (R$)</Label><Input type="number" step="0.01" value={form.monthly_value} onChange={(e) => set("monthly_value", e.target.value)} /></div>
            <div><Label>Início</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
            <div><Label>Fim</Label><Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
            <div><Label>Forma Pagamento</Label><Input value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} /></div>
            <div><Label>Condições</Label><Input value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
            <div className="col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
