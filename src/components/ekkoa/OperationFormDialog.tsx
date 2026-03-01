import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateOperation, useUpdateOperation, type Operation, type OperationStatus } from "@/hooks/use-operations";
import { Play, Clock, MessageSquare, CheckCircle, XCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";

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

  // Workflow actions
  const handleStartTest = async () => {
    if (!operation) return;
    const now = new Date().toISOString();
    const endDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(); // 15 days
    await update.mutateAsync({
      id: operation.id,
      status: "em_andamento",
      start_date: now,
      end_date: endDate,
      notes: `${operation.notes || ""}\n[${new Date().toLocaleDateString("pt-BR")}] Teste iniciado - duração de 15 dias.`.trim(),
    });
    onOpenChange(false);
  };

  const handleExtendTest = async () => {
    if (!operation) return;
    const currentEnd = operation.end_date ? new Date(operation.end_date) : new Date();
    const newEnd = new Date(currentEnd.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(); // +10 days
    await update.mutateAsync({
      id: operation.id,
      end_date: newEnd,
      notes: `${operation.notes || ""}\n[${new Date().toLocaleDateString("pt-BR")}] Teste estendido por +10 dias.`.trim(),
    });
    onOpenChange(false);
  };

  const handleComplete = async () => {
    if (!operation) return;
    await update.mutateAsync({
      id: operation.id,
      status: "concluida",
      end_date: new Date().toISOString(),
      notes: `${operation.notes || ""}\n[${new Date().toLocaleDateString("pt-BR")}] Operação concluída com sucesso.`.trim(),
    });
    onOpenChange(false);
  };

  const handleCancel = async () => {
    if (!operation) return;
    await update.mutateAsync({
      id: operation.id,
      status: "cancelada",
      end_date: new Date().toISOString(),
      notes: `${operation.notes || ""}\n[${new Date().toLocaleDateString("pt-BR")}] Operação cancelada.`.trim(),
    });
    onOpenChange(false);
  };

  const canStartTest = isEdit && operation?.status === "pendente";
  const canExtendTest = isEdit && operation?.status === "em_andamento";
  const canComplete = isEdit && (operation?.status === "em_andamento" || operation?.status === "pendente");
  const canCancel = isEdit && operation?.status !== "concluida" && operation?.status !== "cancelada";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Operação" : "Nova Operação"}</DialogTitle></DialogHeader>

        {/* Workflow Actions */}
        {isEdit && (canStartTest || canExtendTest || canComplete || canCancel) && (
          <>
            <div className="flex flex-wrap gap-2">
              {canStartTest && (
                <Button type="button" size="sm" variant="default" onClick={handleStartTest} disabled={isPending}>
                  <Play className="h-4 w-4 mr-1" />Iniciar Teste
                </Button>
              )}
              {canExtendTest && (
                <Button type="button" size="sm" variant="secondary" onClick={handleExtendTest} disabled={isPending}>
                  <Clock className="h-4 w-4 mr-1" />Estender Teste (+10d)
                </Button>
              )}
              {canComplete && (
                <Button type="button" size="sm" variant="default" onClick={handleComplete} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="h-4 w-4 mr-1" />Concluir
                </Button>
              )}
              {canCancel && (
                <Button type="button" size="sm" variant="destructive" onClick={handleCancel} disabled={isPending}>
                  <XCircle className="h-4 w-4 mr-1" />Cancelar Op.
                </Button>
              )}
            </div>
            <Separator />
          </>
        )}

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
