import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useCreateProduct, useUpdateProduct, type Product } from "@/hooks/use-products";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

const empty = {
  name: "", description: "", sku: "", category: "", brand: "", unit: "un",
  price: "", cost: "", stock: "0", min_stock: "0", is_active: true,
};

export default function ProductFormDialog({ open, onOpenChange, product }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const isEdit = !!product;

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name, description: product.description || "", sku: product.sku || "",
        category: product.category || "", brand: product.brand || "", unit: product.unit,
        price: String(product.price), cost: String(product.cost), stock: String(product.stock),
        min_stock: String(product.min_stock), is_active: product.is_active,
      });
    } else setForm(empty);
  }, [product, open]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name, description: form.description || null, sku: form.sku || null,
      category: form.category || null, brand: form.brand || null, unit: form.unit || "un",
      price: parseFloat(form.price) || 0, cost: parseFloat(form.cost) || 0,
      stock: parseInt(form.stock) || 0, min_stock: parseInt(form.min_stock) || 0,
      is_active: form.is_active,
    };
    if (isEdit) await update.mutateAsync({ id: product!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Produto" : "Novo Produto"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} required /></div>
            <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => set("sku", e.target.value)} /></div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
            <div><Label>Marca</Label><Input value={form.brand} onChange={(e) => set("brand", e.target.value)} /></div>
            <div><Label>Unidade</Label><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="un, kg, m..." /></div>
            <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} /></div>
            <div><Label>Custo (R$)</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} /></div>
            <div><Label>Estoque</Label><Input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} /></div>
            <div><Label>Estoque Mín.</Label><Input type="number" value={form.min_stock} onChange={(e) => set("min_stock", e.target.value)} /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} /></div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Produto ativo</Label>
            </div>
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
