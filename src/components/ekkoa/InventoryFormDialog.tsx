import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateInventoryItem, useUpdateInventoryItem, type InventoryItem } from "@/hooks/use-inventory";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
}

const empty = { name: "", description: "", sku: "", category: "", quantity: "0", min_quantity: "0", unit: "un", unit_cost: "0", location: "" };

export default function InventoryFormDialog({ open, onOpenChange, item }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateInventoryItem();
  const update = useUpdateInventoryItem();
  const isEdit = !!item;

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name, description: item.description || "", sku: item.sku || "",
        category: item.category || "", quantity: String(item.quantity), min_quantity: String(item.min_quantity),
        unit: item.unit, unit_cost: String(item.unit_cost), location: item.location || "",
      });
    } else setForm(empty);
  }, [item, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name, description: form.description || null, sku: form.sku || null,
      category: form.category || null, quantity: parseInt(form.quantity) || 0,
      min_quantity: parseInt(form.min_quantity) || 0, unit: form.unit || "un",
      unit_cost: parseFloat(form.unit_cost) || 0, location: form.location || null,
    };
    if (isEdit) await update.mutateAsync({ id: item!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Item" : "Novo Item"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} required /></div>
            <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => set("sku", e.target.value)} /></div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
            <div><Label>Quantidade</Label><Input type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></div>
            <div><Label>Qtd. Mínima</Label><Input type="number" value={form.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} /></div>
            <div><Label>Unidade</Label><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="un, kg, m..." /></div>
            <div><Label>Custo Unit. (R$)</Label><Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} /></div>
            <div className="col-span-2"><Label>Localização</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
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
