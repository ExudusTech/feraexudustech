import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/hooks/use-clients";
import { useCreateOrder, useUpdateOrder, type Order } from "@/hooks/use-orders";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: Order | null;
}

const STATUS_OPTIONS = [
  { value: "pendente", label: "Pendente" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_producao", label: "Em Produção" },
  { value: "enviado", label: "Enviado" },
  { value: "entregue", label: "Entregue" },
  { value: "cancelado", label: "Cancelado" },
];

const PAYMENT_STATUS = [
  { value: "pendente", label: "Pendente" },
  { value: "parcial", label: "Parcial" },
  { value: "pago", label: "Pago" },
];

export default function OrderFormDialog({ open, onOpenChange, order }: Props) {
  const { data: clients = [] } = useClients();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();

  const [form, setForm] = useState({
    client_id: "", order_number: "", status: "pendente", total_value: 0,
    payment_method: "", payment_status: "pendente", delivery_date: "",
    delivery_address: "", notes: "",
  });

  useEffect(() => {
    if (order) {
      setForm({
        client_id: order.client_id || "", order_number: order.order_number || "",
        status: order.status, total_value: order.total_value,
        payment_method: order.payment_method || "", payment_status: order.payment_status || "pendente",
        delivery_date: order.delivery_date || "", delivery_address: order.delivery_address || "",
        notes: order.notes || "",
      });
    } else {
      setForm({ client_id: "", order_number: "", status: "pendente", total_value: 0, payment_method: "", payment_status: "pendente", delivery_date: "", delivery_address: "", notes: "" });
    }
  }, [order, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      client_id: form.client_id || null,
      order_number: form.order_number || null,
      payment_method: form.payment_method || null,
      delivery_date: form.delivery_date || null,
      delivery_address: form.delivery_address || null,
      notes: form.notes || null,
    };
    if (order) {
      updateOrder.mutate({ id: order.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      createOrder.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? "Editar Pedido" : "Novo Pedido"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nº do Pedido</Label>
              <Input value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor Total</Label>
              <Input type="number" step="0.01" min="0" value={form.total_value} onChange={(e) => setForm({ ...form, total_value: +e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="Ex: PIX, Boleto..." />
            </div>
            <div className="space-y-2">
              <Label>Status Pagamento</Label>
              <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Entrega</Label>
              <Input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Endereço de Entrega</Label>
            <Input value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createOrder.isPending || updateOrder.isPending}>
              {order ? "Salvar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
