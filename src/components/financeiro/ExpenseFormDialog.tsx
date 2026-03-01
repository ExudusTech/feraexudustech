import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateOperationalExpense, useUpdateOperationalExpense, type OperationalExpense } from "@/hooks/use-financeiro";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; expense?: OperationalExpense | null; }

const empty = { title: "", description: "", category: "geral", amount: "0", expense_date: new Date().toISOString().slice(0, 10), due_date: "", recurrence: "unico", status: "pendente", vendor: "", invoice_number: "", notes: "" };

export default function ExpenseFormDialog({ open, onOpenChange, expense }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateOperationalExpense();
  const update = useUpdateOperationalExpense();
  const isEdit = !!expense;

  useEffect(() => {
    if (expense) {
      setForm({
        title: expense.title, description: expense.description || "", category: expense.category,
        amount: String(expense.amount), expense_date: expense.expense_date,
        due_date: expense.due_date || "", recurrence: expense.recurrence || "unico",
        status: expense.status, vendor: expense.vendor || "",
        invoice_number: expense.invoice_number || "", notes: expense.notes || "",
      });
    } else setForm({ ...empty, expense_date: new Date().toISOString().slice(0, 10) });
  }, [expense, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title, description: form.description || null, category: form.category,
      amount: parseFloat(form.amount) || 0, expense_date: form.expense_date,
      due_date: form.due_date || null, recurrence: form.recurrence,
      status: form.status, vendor: form.vendor || null,
      invoice_number: form.invoice_number || null, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: expense!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Despesa" : "Nova Despesa"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
            <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
            <div><Label>Data Despesa</Label><Input type="date" value={form.expense_date} onChange={(e) => set("expense_date", e.target.value)} /></div>
            <div><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
            <div><Label>Fornecedor</Label><Input value={form.vendor} onChange={(e) => set("vendor", e.target.value)} /></div>
            <div><Label>Nº Nota</Label><Input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} /></div>
            <div>
              <Label>Recorrência</Label>
              <Select value={form.recurrence} onValueChange={(v) => set("recurrence", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Único</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
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
