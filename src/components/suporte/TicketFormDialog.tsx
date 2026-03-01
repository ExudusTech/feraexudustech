import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateSupportTicket, useUpdateSupportTicket, type SupportTicket } from "@/hooks/use-support";
import { validateTicketTitle, validateTicketDescription } from "@/lib/validations";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; ticket?: SupportTicket | null; }

const empty = { title: "", description: "", category: "geral", priority: "media", status: "aberto" };

export default function TicketFormDialog({ open, onOpenChange, ticket }: Props) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const create = useCreateSupportTicket();
  const update = useUpdateSupportTicket();
  const isEdit = !!ticket;

  useEffect(() => {
    if (ticket) {
      setForm({ title: ticket.title, description: ticket.description || "", category: ticket.category, priority: ticket.priority, status: ticket.status });
    } else setForm(empty);
    setErrors({});
  }, [ticket, open]);

  const set = (k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    // Clear error on change
    if (k === "title" || k === "description") {
      setErrors((prev) => ({ ...prev, [k]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const titleErr = validateTicketTitle(form.title);
    const descErr = !isEdit ? validateTicketDescription(form.description) : null;
    if (titleErr || descErr) {
      setErrors({ title: titleErr || undefined, description: descErr || undefined });
      return;
    }

    const payload = { title: form.title, description: form.description || null, category: form.category, priority: form.priority, status: form.status };
    if (isEdit) await update.mutateAsync({ id: ticket!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Ticket" : "Novo Ticket"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Título * <span className="text-xs text-muted-foreground">(mínimo 5 caracteres)</span></Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} required />
              {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral</SelectItem>
                  <SelectItem value="tecnico">Técnico</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
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
            {isEdit && (
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="resolvido">Resolvido</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2">
              <Label>Descrição {!isEdit && <span className="text-xs text-muted-foreground">(mínimo 20 caracteres)</span>}</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} />
              {errors.description && <p className="text-xs text-destructive mt-1">{errors.description}</p>}
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
