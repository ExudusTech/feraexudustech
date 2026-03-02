import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useCreateLead, useUpdateLead, STAGE_CONFIG, PIPELINE_STAGES, type Lead, type LeadStage } from "@/hooks/use-leads";
import { useConvertLeadToClient } from "@/hooks/use-lead-conversion";
import { useProducts } from "@/hooks/use-products";
import { useScheduleTestInstallation } from "@/hooks/use-ekkoa-workflow";
import { UserPlus, FlaskConical } from "lucide-react";
import { validateCEP, formatCEP, formatPhone } from "@/lib/validations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
  defaultStage?: LeadStage;
}

const empty = {
  title: "", description: "", stage: "novo" as LeadStage, value: "",
  source: "", contact_name: "", contact_email: "", contact_phone: "", expected_close_date: "",
  category: "",
};

export default function LeadFormDialog({ open, onOpenChange, lead, defaultStage }: Props) {
  const [form, setForm] = useState(empty);
  const [showTestForm, setShowTestForm] = useState(false);
  const [testForm, setTestForm] = useState({ address: "", city: "", state: "", zipCode: "", scheduledDate: "", startTime: "" });

  const create = useCreateLead();
  const update = useUpdateLead();
  const convert = useConvertLeadToClient();
  const scheduleTest = useScheduleTestInstallation();
  const { data: products = [] } = useProducts();
  const isEdit = !!lead;
  const canConvert = isEdit && lead && !lead.client_id && lead.stage !== "fechado_ganho" && lead.stage !== "fechado_perdido";
  const isEkkoa = form.category === "Neutralizadores";
  const canScheduleTest = isEdit && lead && isEkkoa && (lead.stage === "novo" || lead.stage === "qualificacao");

  // Get unique categories from products
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];

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
        category: lead.category || "",
      });
    } else {
      setForm({ ...empty, stage: defaultStage || "novo" });
    }
    setShowTestForm(false);
    setTestForm({ address: "", city: "", state: "", zipCode: "", scheduledDate: "", startTime: "" });
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
      category: form.category || null,
    };

    if (isEdit) {
      await update.mutateAsync({ id: lead!.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending || convert.isPending || scheduleTest.isPending;

  const handleConvert = async () => {
    if (!lead) return;
    await convert.mutateAsync(lead);
    onOpenChange(false);
  };

  const handleScheduleTest = async () => {
    if (!lead) return;
    if (testForm.zipCode && !validateCEP(testForm.zipCode)) return;
    if (!testForm.address || !testForm.city || !testForm.state || !testForm.scheduledDate) return;

    await scheduleTest.mutateAsync({
      lead,
      installationTitle: `Teste - ${lead.title}`,
      address: testForm.address,
      city: testForm.city,
      state: testForm.state,
      zipCode: testForm.zipCode,
      scheduledDate: testForm.scheduledDate,
      startTime: testForm.startTime || undefined,
      assignedTo: lead.assigned_to || lead.created_by,
      leadTable: "leads",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Lead" : "Novo Lead"}</DialogTitle>
        </DialogHeader>

        {/* Workflow Actions for Ekkoa leads */}
        {isEdit && (canConvert || canScheduleTest) && (
          <>
            <div className="flex flex-wrap gap-2">
              {canScheduleTest && (
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowTestForm(!showTestForm)} disabled={isPending}>
                  <FlaskConical className="h-4 w-4 mr-1" />Agendar Teste
                </Button>
              )}
              {canConvert && (
                <Button type="button" size="sm" variant="secondary" onClick={handleConvert} disabled={isPending}>
                  <UserPlus className="h-4 w-4 mr-1" />Converter em Cliente
                </Button>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Schedule Test Form (Ekkoa workflow) */}
        {showTestForm && (
          <div className="space-y-3 p-3 rounded-lg border border-dashed bg-muted/30">
            <p className="text-sm font-medium">Agendar Instalação de Teste (15 dias)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Endereço *</Label><Input value={testForm.address} onChange={(e) => setTestForm({ ...testForm, address: e.target.value })} placeholder="Rua, nº" /></div>
              <div><Label className="text-xs">Cidade *</Label><Input value={testForm.city} onChange={(e) => setTestForm({ ...testForm, city: e.target.value })} /></div>
              <div><Label className="text-xs">Estado *</Label><Input value={testForm.state} onChange={(e) => setTestForm({ ...testForm, state: e.target.value })} maxLength={2} placeholder="SP" /></div>
              <div>
                <Label className="text-xs">CEP</Label>
                <Input
                  value={testForm.zipCode}
                  onChange={(e) => setTestForm({ ...testForm, zipCode: formatCEP(e.target.value) })}
                  placeholder="00000-000"
                  maxLength={9}
                />
                {testForm.zipCode && !validateCEP(testForm.zipCode) && (
                  <p className="text-xs text-destructive mt-1">CEP inválido</p>
                )}
              </div>
              <div><Label className="text-xs">Data *</Label><Input type="date" value={testForm.scheduledDate} onChange={(e) => setTestForm({ ...testForm, scheduledDate: e.target.value })} /></div>
              <div><Label className="text-xs">Horário</Label><Input type="time" value={testForm.startTime} onChange={(e) => setTestForm({ ...testForm, startTime: e.target.value })} /></div>
            </div>
            <Button type="button" size="sm" onClick={handleScheduleTest} disabled={isPending || !testForm.address || !testForm.city || !testForm.state || !testForm.scheduledDate}>
              {scheduleTest.isPending ? "Agendando..." : "Confirmar Agendamento"}
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} required />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {categories.sort().map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estágio</Label>
              <Select value={form.stage} onValueChange={(v) => set("stage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
              {PIPELINE_STAGES.filter((s) => s !== "negociacao").map((s) => (
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
              <Input
                value={form.contact_phone}
                onChange={(e) => set("contact_phone", formatPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
              />
            </div>
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
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
