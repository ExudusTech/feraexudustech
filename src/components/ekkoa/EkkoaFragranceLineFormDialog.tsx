import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateEkkoaFragranceLine, useUpdateEkkoaFragranceLine, type EkkoaFragranceLine } from "@/hooks/use-ekkoa-fragrance-lines";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fragrance?: EkkoaFragranceLine | null;
}

const empty = { name: "", description: "", category: "", intensity: "", is_active: true, notes: "" };

export default function EkkoaFragranceLineFormDialog({ open, onOpenChange, fragrance }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateEkkoaFragranceLine();
  const update = useUpdateEkkoaFragranceLine();
  const isEdit = !!fragrance;

  useEffect(() => {
    if (fragrance) {
      setForm({
        name: fragrance.name, description: fragrance.description || "", category: fragrance.category || "",
        intensity: fragrance.intensity || "", is_active: fragrance.is_active, notes: fragrance.notes || "",
      });
    } else {
      setForm(empty);
    }
  }, [fragrance, open]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name, description: form.description || null, category: form.category || null,
      intensity: form.intensity || null, is_active: form.is_active, notes: form.notes || null,
    };
    if (isEdit) {
      await update.mutateAsync({ id: fragrance!.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Linha" : "Nova Linha de Fragrância"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="floral">Floral</SelectItem>
                  <SelectItem value="citrica">Cítrica</SelectItem>
                  <SelectItem value="amadeirada">Amadeirada</SelectItem>
                  <SelectItem value="herbal">Herbal</SelectItem>
                  <SelectItem value="frutal">Frutal</SelectItem>
                  <SelectItem value="especiada">Especiada</SelectItem>
                  <SelectItem value="fresca">Fresca</SelectItem>
                  <SelectItem value="outra">Outra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Intensidade</Label>
              <Select value={form.intensity} onValueChange={(v) => set("intensity", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="suave">Suave</SelectItem>
                  <SelectItem value="moderada">Moderada</SelectItem>
                  <SelectItem value="intensa">Intensa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Ativo</Label>
            </div>
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
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
