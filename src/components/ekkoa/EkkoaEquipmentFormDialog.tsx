import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateEkkoaEquipment, useUpdateEkkoaEquipment, type EkkoaEquipment } from "@/hooks/use-ekkoa-equipment";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; equipment?: EkkoaEquipment | null; }

const empty = { name: "", model: "", brand: "", serial_number: "", category: "", power_watts: "", quantity: "1", unit_cost: "0", description: "", status: "disponivel", notes: "" };

export default function EkkoaEquipmentFormDialog({ open, onOpenChange, equipment }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateEkkoaEquipment();
  const update = useUpdateEkkoaEquipment();
  const isEdit = !!equipment;

  useEffect(() => {
    if (equipment) {
      setForm({
        name: equipment.name, model: equipment.model || "", brand: equipment.brand || "",
        serial_number: equipment.serial_number || "", category: equipment.category || "",
        power_watts: String(equipment.power_watts || ""), quantity: String(equipment.quantity),
        unit_cost: String(equipment.unit_cost || 0), description: equipment.description || "",
        status: equipment.status, notes: equipment.notes || "",
      });
    } else setForm(empty);
  }, [equipment, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name, model: form.model || null, brand: form.brand || null,
      serial_number: form.serial_number || null, category: form.category || null,
      power_watts: form.power_watts ? parseFloat(form.power_watts) : null,
      quantity: parseInt(form.quantity) || 1, unit_cost: parseFloat(form.unit_cost) || 0,
      description: form.description || null, status: form.status, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: equipment!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} required /></div>
            <div><Label>Modelo</Label><Input value={form.model} onChange={(e) => set("model", e.target.value)} /></div>
            <div><Label>Marca</Label><Input value={form.brand} onChange={(e) => set("brand", e.target.value)} /></div>
            <div><Label>Nº Série</Label><Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} /></div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Painel, Inversor..." /></div>
            <div><Label>Potência (W)</Label><Input type="number" value={form.power_watts} onChange={(e) => set("power_watts", e.target.value)} /></div>
            <div><Label>Quantidade</Label><Input type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></div>
            <div><Label>Custo Unit. (R$)</Label><Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disponivel">Disponível</SelectItem>
                  <SelectItem value="em_uso">Em Uso</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="indisponivel">Indisponível</SelectItem>
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
