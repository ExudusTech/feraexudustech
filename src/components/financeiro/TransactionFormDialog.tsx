import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateFinancialTransaction, useUpdateFinancialTransaction, type FinancialTransaction } from "@/hooks/use-financeiro";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; transaction?: FinancialTransaction | null; }

const empty = { title: "", description: "", transaction_type: "receita", category: "", amount: "0", due_date: "", status: "pendente", reference_number: "", notes: "" };

export default function TransactionFormDialog({ open, onOpenChange, transaction }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateFinancialTransaction();
  const update = useUpdateFinancialTransaction();
  const isEdit = !!transaction;

  useEffect(() => {
    if (transaction) {
      setForm({
        title: transaction.title, description: transaction.description || "",
        transaction_type: transaction.transaction_type, category: transaction.category || "",
        amount: String(transaction.amount), due_date: transaction.due_date || "",
        status: transaction.status, reference_number: transaction.reference_number || "",
        notes: transaction.notes || "",
      });
    } else setForm(empty);
  }, [transaction, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title, description: form.description || null, transaction_type: form.transaction_type,
      category: form.category || null, amount: parseFloat(form.amount) || 0,
      due_date: form.due_date || null, status: form.status,
      reference_number: form.reference_number || null, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: transaction!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Transação" : "Nova Transação"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.transaction_type} onValueChange={(v) => set("transaction_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="atrasado">Atrasado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
            <div><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
            <div><Label>Referência</Label><Input value={form.reference_number} onChange={(e) => set("reference_number", e.target.value)} /></div>
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
