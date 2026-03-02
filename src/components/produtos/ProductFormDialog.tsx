import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";
import { useCreateProduct, useUpdateProduct, type Product } from "@/hooks/use-products";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

const CATEGORY_FIELDS: Record<string, { key: string; label: string; type: string }[]> = {
  "Aromatização": [
    { key: "fragrance", label: "Fragrância", type: "text" },
    { key: "volume_ml", label: "Volume (ml)", type: "number" },
    { key: "duration_hours", label: "Duração (horas)", type: "number" },
    { key: "coverage_m2", label: "Cobertura (m²)", type: "number" },
  ],
  "Energia Solar": [
    { key: "power_wp", label: "Potência (Wp)", type: "number" },
    { key: "efficiency", label: "Eficiência (%)", type: "number" },
    { key: "dimensions", label: "Dimensões", type: "text" },
    { key: "warranty_years", label: "Garantia (anos)", type: "number" },
  ],
  "Equipamento": [
    { key: "voltage", label: "Voltagem", type: "text" },
    { key: "weight_kg", label: "Peso (kg)", type: "number" },
    { key: "serial_prefix", label: "Prefixo Serial", type: "text" },
  ],
};

const empty = {
  name: "", description: "", sku: "", category: "", brand: "", unit: "un",
  price: "", cost: "", stock: "0", min_stock: "0", is_active: true,
};

export default function ProductFormDialog({ open, onOpenChange, product }: Props) {
  const [form, setForm] = useState(empty);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [customSpecs, setCustomSpecs] = useState<{ key: string; value: string }[]>([]);
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
      // Parse existing specifications
      const existingSpecs = (product.specifications || {}) as Record<string, any>;
      const categoryFields = CATEGORY_FIELDS[product.category || ""] || [];
      const knownKeys = categoryFields.map(f => f.key);
      const known: Record<string, string> = {};
      const custom: { key: string; value: string }[] = [];
      Object.entries(existingSpecs).forEach(([k, v]) => {
        if (knownKeys.includes(k)) known[k] = String(v || "");
        else custom.push({ key: k, value: String(v || "") });
      });
      setSpecs(known);
      setCustomSpecs(custom.length > 0 ? custom : []);
    } else {
      setForm(empty);
      setSpecs({});
      setCustomSpecs([]);
    }
  }, [product, open]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const dynamicFields = CATEGORY_FIELDS[form.category] || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    // Build specifications from dynamic + custom fields
    const allSpecs: Record<string, any> = { ...specs };
    customSpecs.forEach(cs => {
      if (cs.key.trim()) allSpecs[cs.key.trim()] = cs.value;
    });

    const payload = {
      name: form.name, description: form.description || null, sku: form.sku || null,
      category: form.category || null, brand: form.brand || null, unit: form.unit || "un",
      price: parseFloat(form.price) || 0, cost: parseFloat(form.cost) || 0,
      stock: parseInt(form.stock) || 0, min_stock: parseInt(form.min_stock) || 0,
      is_active: form.is_active, specifications: allSpecs,
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
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Ex: Aromatização, Energia Solar..." /></div>
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

          {/* Dynamic fields based on category */}
          {dynamicFields.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3">Campos de {form.category}</p>
                <div className="grid grid-cols-2 gap-4">
                  {dynamicFields.map((field) => (
                    <div key={field.key}>
                      <Label>{field.label}</Label>
                      <Input
                        type={field.type}
                        value={specs[field.key] || ""}
                        onChange={(e) => setSpecs(prev => ({ ...prev, [field.key]: e.target.value }))}
                        step={field.type === "number" ? "0.01" : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Custom specification fields */}
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Campos Personalizados</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCustomSpecs(prev => [...prev, { key: "", value: "" }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            </div>
            {customSpecs.map((cs, i) => (
              <div key={i} className="flex items-end gap-2 mb-2">
                <div className="flex-1">
                  {i === 0 && <Label className="text-xs">Nome</Label>}
                  <Input
                    placeholder="Ex: Cor, Peso..."
                    value={cs.key}
                    onChange={(e) => {
                      const next = [...customSpecs];
                      next[i] = { ...next[i], key: e.target.value };
                      setCustomSpecs(next);
                    }}
                  />
                </div>
                <div className="flex-1">
                  {i === 0 && <Label className="text-xs">Valor</Label>}
                  <Input
                    placeholder="Valor"
                    value={cs.value}
                    onChange={(e) => {
                      const next = [...customSpecs];
                      next[i] = { ...next[i], value: e.target.value };
                      setCustomSpecs(next);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-destructive"
                  onClick={() => setCustomSpecs(prev => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
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
