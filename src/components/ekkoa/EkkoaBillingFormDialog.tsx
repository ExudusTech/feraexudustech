import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateEkkoaBilling, useUpdateEkkoaBilling, type EkkoaBilling } from "@/hooks/use-ekkoa-billing";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; billing?: EkkoaBilling | null; }

const empty = { title: "", description: "", invoice_number: "", billing_type: "unico", due_date: "", amount: "0", paid_amount: "0", payment_method: "", status: "pendente", notes: "" };

export default function EkkoaBillingFormDialog({ open, onOpenChange, billing }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateEkkoaBilling();
  const update = useUpdateEkkoaBilling();
  const isEdit = !!billing;

  useEffect(() => {
    if (billing) {
      setForm({
        title: billing.title, description: billing.description || "",
        invoice_number: billing.invoice_number || "", billing_type: billing.billing_type,
        due_date: billing.due_date || "", amount: String(billing.amount),
        paid_amount: String(billing.paid_amount || 0), payment_method: billing.payment_method || "",
        status: billing.status, notes: billing.notes || "",
      });
    } else setForm(empty);
  }, [billing, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title, description: form.description || null, invoice_number: form.invoice_number || null,
      billing_type: form.billing_type, due_date: form.due_date || null,
      amount: parseFloat(form.amount) || 0, paid_amount: parseFloat(form.paid_amount) || null,
      payment_method: form.payment_method || null, status: form.status, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: billing!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Faturamento" : "Novo Faturamento"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div><Label>Nº Nota/Fatura</Label><Input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.billing_type} onValueChange={(v) => set("billing_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Único</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="parcela">Parcela</SelectItem>
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
            <div><Label>Valor Pago (R$)</Label><Input type="number" step="0.01" value={form.paid_amount} onChange={(e) => set("paid_amount", e.target.value)} /></div>
            <div><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
            <div><Label>Forma Pagamento</Label><Input value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} /></div>
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
