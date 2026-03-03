import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCreateLead, useUpdateLead, STAGE_CONFIG, PIPELINE_STAGES, type Lead, type LeadStage } from "@/hooks/use-leads";
import { useConvertLeadToClient } from "@/hooks/use-lead-conversion";
import { useProducts } from "@/hooks/use-products";
import { useScheduleTestInstallation } from "@/hooks/use-ekkoa-workflow";
import { useEkkoaCoverageAreas } from "@/hooks/use-ekkoa-coverage-areas";
import { useEkkoaInstallations, useUpdateEkkoaInstallation } from "@/hooks/use-ekkoa-installations";
import { useSchedules, useUpdateSchedule } from "@/hooks/use-schedules";
import { useViaCep } from "@/hooks/use-viacep";
import { UserPlus, FlaskConical, MapPin, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { formatCEP, formatPhone } from "@/lib/validations";
import { findCoverageAreaByCep, getAllowedDays, getNextAllowedDates, getTimeWindow, generateTimeSlots, hasScheduleOverlap } from "@/lib/scheduling-utils";

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

const emptyTestForm = {
  street: "",
  number: "",
  complement: "",
  city: "",
  state: "",
  zipCode: "",
  scheduledDate: "",
  startTime: "",
};

function parseAddressParts(value: string | null) {
  if (!value) return { street: "", number: "", complement: "" };
  const [streetPart, rest = ""] = value.split(",");
  const restTrimmed = rest.trim();
  if (!restTrimmed) return { street: streetPart.trim(), number: "", complement: "" };

  const numberMatch = restTrimmed.match(/^([\dA-Za-z-]+)/);
  const number = numberMatch?.[1] ?? "";
  const complement = restTrimmed.replace(/^([\dA-Za-z-]+)/, "").replace(/^\s*[-–—]?\s*/, "").trim();

  return {
    street: streetPart.trim(),
    number,
    complement,
  };
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export default function LeadFormDialog({ open, onOpenChange, lead, defaultStage }: Props) {
  const [form, setForm] = useState(empty);
  const [showTestForm, setShowTestForm] = useState(false);
  const [testForm, setTestForm] = useState(emptyTestForm);

  const create = useCreateLead();
  const update = useUpdateLead();
  const convert = useConvertLeadToClient();
  const scheduleTest = useScheduleTestInstallation();
  const updateSchedule = useUpdateSchedule();
  const updateInstallation = useUpdateEkkoaInstallation();
  const { data: products = [] } = useProducts();
  const { data: coverageAreas = [] } = useEkkoaCoverageAreas();
  const { data: schedules = [] } = useSchedules();
  const { data: installations = [] } = useEkkoaInstallations();

  const isEdit = !!lead;
  const canConvert = isEdit && lead && !lead.client_id && lead.stage !== "fechado_ganho" && lead.stage !== "fechado_perdido";
  const isEkkoa = form.category === "Neutralizadores";

  const leadSearchToken = (lead?.contact_name || lead?.title || "").toLowerCase();
  const existingConsultantSchedule = useMemo(() => {
    if (!leadSearchToken) return null;
    return (
      schedules
        .filter(
          (s) =>
            s.schedule_type === "instalacao_teste" &&
            s.title.toLowerCase().includes(leadSearchToken) &&
            s.status !== "cancelado"
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null
    );
  }, [schedules, leadSearchToken]);

  const existingD1Schedule = useMemo(() => {
    if (!existingConsultantSchedule?.operation_id) return null;
    return (
      schedules.find(
        (s) =>
          s.operation_id === existingConsultantSchedule.operation_id &&
          s.schedule_type === "pre_emissao_nf" &&
          s.status !== "cancelado"
      ) || null
    );
  }, [schedules, existingConsultantSchedule]);

  const existingInstallation = useMemo(() => {
    if (!lead?.title) return null;
    const leadTitle = lead.title.toLowerCase();
    return (
      installations
        .filter((inst) => inst.title.toLowerCase().includes(leadTitle))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null
    );
  }, [installations, lead?.title]);

  const canManageTest = isEdit && !!lead && isEkkoa && (
    lead.stage === "novo" ||
    lead.stage === "qualificacao" ||
    lead.stage === "em_teste" ||
    lead.stage === "feedback" ||
    !!existingConsultantSchedule
  );

  const testActionLabel = existingConsultantSchedule ? "Visualizar / Editar Agendamento" : "Agendar Teste";

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
    setTestForm(emptyTestForm);
  }, [lead, open, defaultStage]);

  useEffect(() => {
    if (!showTestForm || !existingInstallation) return;

    const parsed = parseAddressParts(existingInstallation.address);
    const consultantDate = existingConsultantSchedule?.scheduled_date || existingInstallation.start_date || "";

    setTestForm((prev) => ({
      ...prev,
      street: prev.street || parsed.street,
      number: prev.number || parsed.number,
      complement: prev.complement || parsed.complement,
      city: prev.city || existingInstallation.city || "",
      state: prev.state || existingInstallation.state || "",
      zipCode: prev.zipCode || existingInstallation.zip_code || "",
      scheduledDate: prev.scheduledDate || consultantDate,
      startTime: prev.startTime || existingConsultantSchedule?.start_time || "",
    }));
  }, [showTestForm, existingInstallation, existingConsultantSchedule]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const matchedArea = useMemo(() => {
    if (!testForm.zipCode || testForm.zipCode.replace(/\D/g, "").length < 8) return null;
    return findCoverageAreaByCep(testForm.zipCode, coverageAreas);
  }, [testForm.zipCode, coverageAreas]);

  const cepValid = testForm.zipCode.replace(/\D/g, "").length === 8;
  const cepEntered = testForm.zipCode.replace(/\D/g, "").length > 0;
  const allowedDays = useMemo(() => getAllowedDays(matchedArea), [matchedArea]);
  const allowedDates = useMemo(() => getNextAllowedDates(allowedDays, 60), [allowedDays]);
  const timeWindow = useMemo(() => getTimeWindow(matchedArea), [matchedArea]);
  const timeSlots = useMemo(() => (timeWindow ? generateTimeSlots(timeWindow.start, timeWindow.end, 30) : []), [timeWindow]);

  const assignedTo = lead?.assigned_to || lead?.created_by || "";
  const overlapDetected = useMemo(() => {
    if (!testForm.scheduledDate || !testForm.startTime || !assignedTo) return false;
    return hasScheduleOverlap(
      schedules,
      assignedTo,
      testForm.scheduledDate,
      testForm.startTime,
      null,
      existingConsultantSchedule?.id
    );
  }, [schedules, assignedTo, testForm.scheduledDate, testForm.startTime, existingConsultantSchedule?.id]);

  const viaCep = useViaCep(testForm.zipCode);
  useEffect(() => {
    if (viaCep.data) {
      setTestForm((prev) => ({
        ...prev,
        street: viaCep.data!.logradouro || prev.street,
        city: viaCep.data!.localidade || prev.city,
        state: viaCep.data!.uf || prev.state,
        scheduledDate: "",
        startTime: "",
      }));
    }
  }, [viaCep.data]);

  useEffect(() => {
    if (timeWindow && testForm.scheduledDate && !testForm.startTime) {
      setTestForm((prev) => ({ ...prev, startTime: timeWindow.start }));
    }
  }, [timeWindow, testForm.scheduledDate]);

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

  const handleConvert = async () => {
    if (!lead) return;
    await convert.mutateAsync(lead);
    onOpenChange(false);
  };

  const isTestFormValid =
    !!testForm.street.trim() &&
    !!testForm.number.trim() &&
    !!testForm.complement.trim() &&
    !!testForm.city.trim() &&
    !!testForm.state.trim() &&
    !!testForm.scheduledDate;

  const handleScheduleTest = async () => {
    if (!lead) return;
    if (!cepValid || !matchedArea || overlapDetected || !isTestFormValid) return;

    const fullAddress = `${testForm.street.trim()}, ${testForm.number.trim()} - ${testForm.complement.trim()}`;

    if (existingConsultantSchedule && existingInstallation) {
      await updateInstallation.mutateAsync({
        id: existingInstallation.id,
        address: fullAddress,
        city: testForm.city.trim(),
        state: testForm.state.trim().toUpperCase(),
        zip_code: testForm.zipCode,
        start_date: testForm.scheduledDate,
        end_date: addDays(testForm.scheduledDate, 15),
      });

      await updateSchedule.mutateAsync({
        id: existingConsultantSchedule.id,
        scheduled_date: testForm.scheduledDate,
        start_time: testForm.startTime || null,
        location: `${fullAddress}, ${testForm.city.trim()} - ${testForm.state.trim().toUpperCase()}`,
      });

      if (existingD1Schedule) {
        await updateSchedule.mutateAsync({
          id: existingD1Schedule.id,
          scheduled_date: addDays(testForm.scheduledDate, -1),
          description: `Emitir Nota Fiscal de Remessa para instalação agendada em ${testForm.scheduledDate}`,
        });
      }

      onOpenChange(false);
      return;
    }

    await scheduleTest.mutateAsync({
      lead,
      installationTitle: `Teste - ${lead.title}`,
      address: fullAddress,
      city: testForm.city.trim(),
      state: testForm.state.trim().toUpperCase(),
      zipCode: testForm.zipCode,
      scheduledDate: testForm.scheduledDate,
      startTime: testForm.startTime || undefined,
      assignedTo: lead.assigned_to || lead.created_by,
    });

    onOpenChange(false);
  };

  const isPending =
    create.isPending ||
    update.isPending ||
    convert.isPending ||
    scheduleTest.isPending ||
    updateSchedule.isPending ||
    updateInstallation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Lead" : "Novo Lead"}</DialogTitle>
        </DialogHeader>

        {isEdit && (canConvert || canManageTest) && (
          <>
            <div className="flex flex-wrap gap-2">
              {canManageTest && (
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowTestForm(!showTestForm)} disabled={isPending}>
                  <FlaskConical className="h-4 w-4 mr-1" />{testActionLabel}
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

        {showTestForm && (
          <div className="space-y-3 p-3 rounded-lg border border-dashed bg-muted/30">
            <p className="text-sm font-medium">
              {existingConsultantSchedule ? "Visualizar / Editar Agendamento de Teste" : "Agendar Instalação de Teste (15 dias)"}
            </p>

            <div>
              <Label className="text-xs font-semibold">1. CEP do local *</Label>
              <Input
                value={testForm.zipCode}
                onChange={(e) => setTestForm({ ...testForm, zipCode: formatCEP(e.target.value) })}
                placeholder="00000-000"
                maxLength={9}
                autoFocus
              />
              {cepEntered && !cepValid && testForm.zipCode.replace(/\D/g, "").length >= 5 && (
                <p className="text-xs text-destructive mt-1">CEP incompleto</p>
              )}
            </div>

            {cepValid && (
              <Alert variant={matchedArea ? "default" : "destructive"} className="py-2">
                <div className="flex items-center gap-2">
                  {matchedArea ? (
                    <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  <AlertDescription className="text-sm">
                    {matchedArea ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Área: <strong>{matchedArea.name}</strong>
                        {matchedArea.dia_semana && ` — ${matchedArea.dia_semana}`}
                        {timeWindow && ` (${timeWindow.start}–${timeWindow.end})`}
                      </span>
                    ) : (
                      "CEP fora da área de cobertura cadastrada."
                    )}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            {matchedArea && (
              <>
                {cepValid && !viaCep.loading && !viaCep.data && (
                  <p className="text-xs text-muted-foreground">
                    Não foi possível autopreencher o endereço por CEP. Preencha rua, número, complemento, cidade e estado manualmente.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">2. Endereço (rua/avenida) *</Label>
                    <Input
                      value={testForm.street}
                      onChange={(e) => setTestForm({ ...testForm, street: e.target.value })}
                      placeholder="Rua John Kennedy"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Número *</Label>
                    <Input
                      value={testForm.number}
                      onChange={(e) => setTestForm({ ...testForm, number: e.target.value })}
                      placeholder="120"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Complemento *</Label>
                    <Input
                      value={testForm.complement}
                      onChange={(e) => setTestForm({ ...testForm, complement: e.target.value })}
                      placeholder="Centro, Loja 2, Sala 3..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cidade *</Label>
                    <Input value={testForm.city} onChange={(e) => setTestForm({ ...testForm, city: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Estado *</Label>
                    <Input value={testForm.state} onChange={(e) => setTestForm({ ...testForm, state: e.target.value })} maxLength={2} />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">3. Data do agendamento *</Label>
                  {allowedDates.length > 0 ? (
                    <Select
                      value={testForm.scheduledDate}
                      onValueChange={(v) => setTestForm({ ...testForm, scheduledDate: v, startTime: timeWindow?.start || "" })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma data disponível..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedDates.map((d) => {
                          const dateObj = new Date(d + "T12:00:00");
                          const dayName = dateObj.toLocaleDateString("pt-BR", { weekday: "long" });
                          const formatted = dateObj.toLocaleDateString("pt-BR");
                          const hasOverlap = assignedTo && hasScheduleOverlap(
                            schedules,
                            assignedTo,
                            d,
                            timeWindow?.start || "09:00",
                            timeWindow?.end || "10:00",
                            existingConsultantSchedule?.id
                          );
                          return (
                            <SelectItem key={d} value={d} disabled={!!hasOverlap}>
                              {formatted} ({dayName}){hasOverlap ? " — Ocupado" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Nenhum dia configurado para esta área.</p>
                  )}
                </div>

                {testForm.scheduledDate && (
                  <div>
                    <Label className="text-xs font-semibold">4. Horário</Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={testForm.startTime}
                        onValueChange={(v) => setTestForm({ ...testForm, startTime: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((slot) => (
                            <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {timeWindow && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {timeWindow.start}–{timeWindow.end}
                        </span>
                      )}
                    </div>
                    {overlapDetected && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Já existe agendamento nesse horário para o consultor.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={handleScheduleTest}
                  disabled={isPending || !isTestFormValid || overlapDetected}
                >
                  {scheduleTest.isPending || updateSchedule.isPending || updateInstallation.isPending
                    ? "Salvando agendamento..."
                    : existingConsultantSchedule
                      ? "Salvar Alterações do Agendamento"
                      : "Confirmar Agendamento"}
                </Button>
              </>
            )}
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
