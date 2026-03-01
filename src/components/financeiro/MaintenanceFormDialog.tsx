import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateMaintenance, useUpdateMaintenance, type MaintenanceItem } from "@/hooks/use-financeiro";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; item?: MaintenanceItem | null; }

const empty = { title: "", description: "", maintenance_type: "preventiva", scheduled_date: "", start_time: "", end_time: "", estimated_cost: "0", status: "agendada", recurrence: "unico", notes: "" };

export default function MaintenanceFormDialog({ open, onOpenChange, item }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateMaintenance();
  const update = useUpdateMaintenance();
  const isEdit = !!item;

  useEffect(() => {
    if (item) {
      setForm({
        title: item.title, description: item.description || "",
        maintenance_type: item.maintenance_type, scheduled_date: item.scheduled_date,
        start_time: item.start_time || "", end_time: item.end_time || "",
        estimated_cost: String(item.estimated_cost || 0), status: item.status,
        recurrence: item.recurrence || "unico", notes: item.notes || "",
      });
    } else setForm(empty);
  }, [item, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_date) return;
    const payload = {
      title: form.title, description: form.description || null,
      maintenance_type: form.maintenance_type, scheduled_date: form.scheduled_date,
      start_time: form.start_time || null, end_time: form.end_time || null,
      estimated_cost: parseFloat(form.estimated_cost) || null,
      status: form.status, recurrence: form.recurrence, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: item!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Manutenção" : "Nova Manutenção"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.maintenance_type} onValueChange={(v) => set("maintenance_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventiva">Preventiva</SelectItem>
                  <SelectItem value="corretiva">Corretiva</SelectItem>
                  <SelectItem value="preditiva">Preditiva</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data *</Label><Input type="date" value={form.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} required /></div>
            <div><Label>Custo Estimado (R$)</Label><Input type="number" step="0.01" value={form.estimated_cost} onChange={(e) => set("estimated_cost", e.target.value)} /></div>
            <div><Label>Hora início</Label><Input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} /></div>
            <div><Label>Hora fim</Label><Input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} /></div>
            <div>
              <Label>Recorrência</Label>
              <Select value={form.recurrence} onValueChange={(v) => set("recurrence", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Único</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
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
