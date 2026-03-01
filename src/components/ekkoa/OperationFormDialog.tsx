import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateOperation, useUpdateOperation, type Operation, type OperationStatus } from "@/hooks/use-operations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation?: Operation | null;
}

const empty = { title: "", description: "", status: "pendente" as OperationStatus, priority: "media", start_date: "", end_date: "", location: "", notes: "" };

export default function OperationFormDialog({ open, onOpenChange, operation }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateOperation();
  const update = useUpdateOperation();
  const isEdit = !!operation;

  useEffect(() => {
    if (operation) {
      setForm({
        title: operation.title, description: operation.description || "",
        status: operation.status, priority: operation.priority,
        start_date: operation.start_date?.slice(0, 16) || "",
        end_date: operation.end_date?.slice(0, 16) || "",
        location: operation.location || "", notes: operation.notes || "",
      });
    } else setForm(empty);
  }, [operation, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title, description: form.description || null, status: form.status as OperationStatus,
      priority: form.priority, start_date: form.start_date || null, end_date: form.end_date || null,
      location: form.location || null, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: operation!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Operação" : "Nova Operação"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Início</Label><Input type="datetime-local" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
            <div><Label>Fim</Label><Input type="datetime-local" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
            <div className="col-span-2"><Label>Local</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
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
