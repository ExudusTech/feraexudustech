import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateClientVisit, useUpdateClientVisit, type ClientVisit } from "@/hooks/use-client-visits";
import { useClients } from "@/hooks/use-clients";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit?: ClientVisit | null;
  defaultClientId?: string;
}

const empty = { client_id: "", visit_date: new Date().toISOString().split("T")[0], visit_type: "presencial", subject: "", notes: "", outcome: "", next_visit_date: "" };

export default function ClientVisitFormDialog({ open, onOpenChange, visit, defaultClientId }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateClientVisit();
  const update = useUpdateClientVisit();
  const { data: clients = [] } = useClients();
  const isEdit = !!visit;

  useEffect(() => {
    if (visit) {
      setForm({
        client_id: visit.client_id || "",
        visit_date: visit.visit_date || "",
        visit_type: visit.visit_type,
        subject: visit.subject || "",
        notes: visit.notes || "",
        outcome: visit.outcome || "",
        next_visit_date: visit.next_visit_date || "",
      });
    } else {
      setForm({ ...empty, client_id: defaultClientId || "" });
    }
  }, [visit, open, defaultClientId]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id) return;
    const payload = { ...form, next_visit_date: form.next_visit_date || null };
    if (isEdit) {
      await update.mutateAsync({ id: visit!.id, ...payload });
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
          <DialogTitle>{isEdit ? "Editar Visita" : "Nova Visita"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Cliente *</Label>
              <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.visit_date} onChange={(e) => set("visit_date", e.target.value)} required />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.visit_type} onValueChange={(v) => set("visit_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presencial">Presencial</SelectItem>
                  <SelectItem value="virtual">Virtual</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Assunto</Label>
              <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Resultado</Label>
              <Input value={form.outcome} onChange={(e) => set("outcome", e.target.value)} />
            </div>
            <div>
              <Label>Próxima Visita</Label>
              <Input type="date" value={form.next_visit_date} onChange={(e) => set("next_visit_date", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
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
