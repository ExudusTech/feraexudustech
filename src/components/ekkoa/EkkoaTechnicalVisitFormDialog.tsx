import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateEkkoaTechnicalVisit, useUpdateEkkoaTechnicalVisit, type EkkoaTechnicalVisit } from "@/hooks/use-ekkoa-technical-visits";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit?: EkkoaTechnicalVisit | null;
}

const empty = {
  visit_date: new Date().toISOString().split("T")[0], visit_type: "manutencao", status: "agendada",
  description: "", findings: "", recommendations: "", next_visit_date: "", duration_minutes: "", notes: "",
};

export default function EkkoaTechnicalVisitFormDialog({ open, onOpenChange, visit }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateEkkoaTechnicalVisit();
  const update = useUpdateEkkoaTechnicalVisit();
  const isEdit = !!visit;

  useEffect(() => {
    if (visit) {
      setForm({
        visit_date: visit.visit_date || "", visit_type: visit.visit_type, status: visit.status,
        description: visit.description || "", findings: visit.findings || "",
        recommendations: visit.recommendations || "", next_visit_date: visit.next_visit_date || "",
        duration_minutes: visit.duration_minutes?.toString() || "", notes: visit.notes || "",
      });
    } else {
      setForm(empty);
    }
  }, [visit, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      visit_date: form.visit_date, visit_type: form.visit_type, status: form.status,
      description: form.description || null, findings: form.findings || null,
      recommendations: form.recommendations || null, next_visit_date: form.next_visit_date || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      notes: form.notes || null,
    };
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
          <DialogTitle>{isEdit ? "Editar Visita Técnica" : "Nova Visita Técnica"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.visit_date} onChange={(e) => set("visit_date", e.target.value)} required />
            </div>
            <div>
              <Label>Duração (min)</Label>
              <Input type="number" value={form.duration_minutes} onChange={(e) => set("duration_minutes", e.target.value)} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.visit_type} onValueChange={(v) => set("visit_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="inspecao">Inspeção</SelectItem>
                  <SelectItem value="instalacao">Instalação</SelectItem>
                  <SelectItem value="vistoria">Vistoria</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
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
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
            </div>
            <div className="col-span-2">
              <Label>Achados</Label>
              <Textarea value={form.findings} onChange={(e) => set("findings", e.target.value)} rows={2} />
            </div>
            <div className="col-span-2">
              <Label>Recomendações</Label>
              <Textarea value={form.recommendations} onChange={(e) => set("recommendations", e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Próxima Visita</Label>
              <Input type="date" value={form.next_visit_date} onChange={(e) => set("next_visit_date", e.target.value)} />
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
