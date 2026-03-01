import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateLead, useUpdateLead, STAGE_CONFIG, PIPELINE_STAGES, type Lead, type LeadStage } from "@/hooks/use-leads";
import { useConvertLeadToClient } from "@/hooks/use-lead-conversion";
import { UserPlus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
  defaultStage?: LeadStage;
}

const empty = {
  title: "", description: "", stage: "novo" as LeadStage, value: "",
  source: "", contact_name: "", contact_email: "", contact_phone: "", expected_close_date: "",
};

export default function LeadFormDialog({ open, onOpenChange, lead, defaultStage }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateLead();
  const update = useUpdateLead();
  const convert = useConvertLeadToClient();
  const isEdit = !!lead;
  const canConvert = isEdit && lead && !lead.client_id && lead.stage !== "fechado_ganho" && lead.stage !== "fechado_perdido";

  useEffect(() => {
    if (lead) {
      setForm({
        title: lead.title,
        description: lead.description || "",
        stage: lead.stage,
        value: String(lead.value || ""),
        source: lead.source || "",
        contact_name: lead.contact_name || "",
        contact_email: lead.contact_email || "",
        contact_phone: lead.contact_phone || "",
        expected_close_date: lead.expected_close_date || "",
      });
    } else {
      setForm({ ...empty, stage: defaultStage || "novo" });
    }
  }, [lead, open, defaultStage]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    const payload = {
      title: form.title,
      description: form.description || null,
      stage: form.stage,
      value: parseFloat(form.value) || 0,
      source: form.source || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      expected_close_date: form.expected_close_date || null,
    };

    if (isEdit) {
      await update.mutateAsync({ id: lead!.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending || convert.isPending;

  const handleConvert = async () => {
    if (!lead) return;
    await convert.mutateAsync(lead);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Lead" : "Novo Lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} required />
            </div>
            <div>
              <Label>Estágio</Label>
              <Select value={form.stage} onValueChange={(v) => set("stage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{STAGE_CONFIG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={form.value} onChange={(e) => set("value", e.target.value)} />
            </div>
            <div>
              <Label>Origem</Label>
              <Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="Site, indicação..." />
            </div>
            <div>
              <Label>Data prevista</Label>
              <Input type="date" value={form.expected_close_date} onChange={(e) => set("expected_close_date", e.target.value)} />
            </div>
            <div>
              <Label>Contato</Label>
              <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
            <div>
              <Label>E-mail contato</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
            </div>
            <div>
              <Label>Telefone contato</Label>
              <Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>
          </div>
          <div className="flex justify-between gap-2">
            {canConvert ? (
              <Button type="button" variant="secondary" onClick={handleConvert} disabled={isPending}>
                <UserPlus className="h-4 w-4 mr-2" />Converter em Cliente
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
