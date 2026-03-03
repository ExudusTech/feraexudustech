import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateLead, useUpdateLead, STAGE_CONFIG, PIPELINE_STAGES, type Lead, type LeadStage } from "@/hooks/use-leads";
import { useConvertLeadToClient } from "@/hooks/use-lead-conversion";
import { useProducts } from "@/hooks/use-products";
import { useScheduleTestInstallation } from "@/hooks/use-ekkoa-workflow";
import { useEkkoaCoverageAreas } from "@/hooks/use-ekkoa-coverage-areas";
import { useEkkoaInstallations, useUpdateEkkoaInstallation } from "@/hooks/use-ekkoa-installations";
import { useSchedules, useUpdateSchedule } from "@/hooks/use-schedules";
import { useViaCep } from "@/hooks/use-viacep";
import { useOrganizationUsers } from "@/hooks/use-users";
import { UserPlus, FlaskConical, MapPin, AlertTriangle, CheckCircle, Clock, X } from "lucide-react";
import { formatCEP, formatPhone } from "@/lib/validations";
import { findCoverageAreaByCep, getAllowedDays, getNextAllowedDates, getTimeWindow, generateTimeSlots, hasScheduleOverlap } from "@/lib/scheduling-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
  defaultStage?: LeadStage;
}

const empty = {
  title: "", description: "", stage: "novo" as LeadStage,
  source: "", contact_name: "", contact_email: "", contact_phone: "",
  categories: [] as string[],
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
  assignedConsultant: "",
};

function parseAddressParts(value: string | null) {
  if (!value) return { street: "", number: "", complement: "" };
  const [streetPart, rest = ""] = value.split(",");
  const restTrimmed = rest.trim();
  if (!restTrimmed) return { street: streetPart.trim(), number: "", complement: "" };
  const numberMatch = restTrimmed.match(/^([\dA-Za-z-]+)/);
  const number = numberMatch?.[1] ?? "";
  const complement = restTrimmed.replace(/^([\dA-Za-z-]+)/, "").replace(/^\s*[-–—]?\s*/, "").trim();
  return { street: streetPart.trim(), number, complement };
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
  const [showSchedulePrompt, setShowSchedulePrompt] = useState(false);
  const [savedLead, setSavedLead] = useState<Lead | null>(null);

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
  const { data: orgUsers = [] } = useOrganizationUsers();

  const consultants = useMemo(() =>
    orgUsers.filter(u => u.role === "consultor_tecnico" && u.is_active),
    [orgUsers]
  );

  const isEdit = !!lead;
  const canConvert = isEdit && lead && !lead.client_id && lead.stage !== "fechado_ganho" && lead.stage !== "fechado_perdido";
  const hasCategories = form.categories.length > 0;

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
    const targetLead = lead || savedLead;
    if (!targetLead?.title) return null;
    const leadTitle = targetLead.title.toLowerCase();
    return (
      installations
        .filter((inst) => inst.title.toLowerCase().includes(leadTitle))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null
    );
  }, [installations, lead?.title, savedLead?.title]);

  const canManageTest = isEdit && !!lead && hasCategories && (
    lead.stage === "novo" ||
    lead.stage === "qualificacao" ||
    lead.stage === "em_teste" ||
    lead.stage === "feedback" ||
    !!existingConsultantSchedule
  );

  const testActionLabel = existingConsultantSchedule ? "Visualizar / Editar Agendamento" : "Agendar Teste";

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];

  // Parse category field: supports comma-separated multi-category stored in single field
  const parseCategories = (cat: string | null): string[] => {
    if (!cat) return [];
    return cat.split(",").map(c => c.trim()).filter(Boolean);
  };

  useEffect(() => {
    if (lead) {
      setForm({
        title: lead.title,
        description: lead.description || "",
        stage: lead.stage,
        source: lead.source || "",
        contact_name: lead.contact_name || "",
        contact_email: lead.contact_email || "",
        contact_phone: lead.contact_phone || "",
        categories: parseCategories(lead.category),
      });
    } else {
      setForm({ ...empty, stage: defaultStage || "novo" });
    }
    setShowTestForm(false);
    setTestForm(emptyTestForm);
    setShowSchedulePrompt(false);
    setSavedLead(null);
  }, [lead, open, defaultStage]);

  useEffect(() => {
    if (!showTestForm) return;
    if (existingInstallation) {
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
    }
  }, [showTestForm, existingInstallation, existingConsultantSchedule]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const toggleCategory = (cat: string) => {
    setForm((p) => ({
      ...p,
      categories: p.categories.includes(cat)
        ? p.categories.filter(c => c !== cat)
        : [...p.categories, cat],
    }));
  };

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

  const assignedTo = testForm.assignedConsultant || lead?.assigned_to || lead?.created_by || "";
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

    const categoryStr = form.categories.length > 0 ? form.categories.join(", ") : null;

    const payload = {
      title: form.title,
      description: form.description || null,
      stage: form.stage,
      value: 0,
      source: form.source || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      expected_close_date: null,
      category: categoryStr,
    };

    if (isEdit) {
      await update.mutateAsync({ id: lead!.id, ...payload });
      onOpenChange(false);
    } else {
      const result = await create.mutateAsync(payload);
      // After creating, show schedule prompt
      setSavedLead(result as Lead);
      setShowSchedulePrompt(true);
    }
  };

  const handleConvert = async () => {
    if (!lead) return;
    await convert.mutateAsync(lead);
    onOpenChange(false);
  };

  const handleSchedulePromptYes = () => {
    // Close and reopen with the saved lead to show scheduling form
    setShowSchedulePrompt(false);
    if (savedLead) {
      // We need to switch to edit mode with the saved lead and auto-open test form
      onOpenChange(false);
      // Use a small delay so the dialog can close and reopen
      setTimeout(() => {
        // This will be handled by the parent - we need to trigger opening with the new lead
        // For now, just close. The user can click the card.
        // Actually let's directly switch to schedule mode
      }, 100);
    }
  };

  const handleSchedulePromptNo = () => {
    setShowSchedulePrompt(false);
    onOpenChange(false);
  };

  const isTestFormValid =
    !!testForm.street.trim() &&
    !!testForm.number.trim() &&
    !!testForm.city.trim() &&
    !!testForm.state.trim() &&
    !!testForm.scheduledDate &&
    !!assignedTo;

  const handleScheduleTest = async () => {
    const targetLead = lead || savedLead;
    if (!targetLead) return;
    if (!cepValid || !matchedArea || overlapDetected || !isTestFormValid) return;

    const complementPart = testForm.complement.trim() ? ` - ${testForm.complement.trim()}` : "";
    const fullAddress = `${testForm.street.trim()}, ${testForm.number.trim()}${complementPart}`;

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
      lead: targetLead,
      installationTitle: `Teste - ${targetLead.title}`,
      address: fullAddress,
      city: testForm.city.trim(),
      state: testForm.state.trim().toUpperCase(),
      zipCode: testForm.zipCode,
      scheduledDate: testForm.scheduledDate,
      startTime: testForm.startTime || undefined,
      assignedTo: assignedTo,
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

  // Post-save schedule prompt
  if (showSchedulePrompt && savedLead) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lead criado com sucesso!</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deseja criar um agendamento de teste para <strong>{savedLead.title}</strong>?
          </p>
          {/* If yes, show the scheduling form inline */}
          {showTestForm ? (
            <div className="space-y-3 p-3 rounded-lg border border-dashed bg-muted/30">
              <p className="text-sm font-medium">Agendar Instalação de Teste (15 dias)</p>
              {renderScheduleForm()}
            </div>
          ) : (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleSchedulePromptNo}>Não, obrigado</Button>
              <Button onClick={() => setShowTestForm(true)}>
                <FlaskConical className="h-4 w-4 mr-1" /> Sim, agendar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  function renderScheduleForm() {
    return (
      <>
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
                Não foi possível autopreencher o endereço por CEP. Preencha manualmente.
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
                <Label className="text-xs">Complemento</Label>
                <Input
                  value={testForm.complement}
                  onChange={(e) => setTestForm({ ...testForm, complement: e.target.value })}
                  placeholder="Centro, Loja 2..."
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
                        schedules, assignedTo, d,
                        timeWindow?.start || "09:00", timeWindow?.end || "10:00",
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

            <div>
              <Label className="text-xs font-semibold">5. Consultor responsável *</Label>
              <Select
                value={testForm.assignedConsultant}
                onValueChange={(v) => setTestForm({ ...testForm, assignedConsultant: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o consultor..." />
                </SelectTrigger>
                <SelectContent>
                  {consultants.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                  ))}
                  {consultants.length === 0 && (
                    <SelectItem value="_none" disabled>Nenhum consultor técnico cadastrado</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

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
      </>
    );
  }

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

        {/* Show lead details summary when in edit mode */}
        {isEdit && lead && !showTestForm && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {lead.category && (
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">Categorias:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {parseCategories(lead.category).map(cat => (
                      <Badge key={cat} variant="secondary" className="text-xs">{cat}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {lead.contact_name && (
                <div><span className="text-muted-foreground text-xs">Contato:</span> <span>{lead.contact_name}</span></div>
              )}
              {lead.contact_phone && (
                <div><span className="text-muted-foreground text-xs">Telefone:</span> <span>{lead.contact_phone}</span></div>
              )}
              {lead.contact_email && (
                <div className="col-span-2"><span className="text-muted-foreground text-xs">Email:</span> <span>{lead.contact_email}</span></div>
              )}
              {lead.source && (
                <div><span className="text-muted-foreground text-xs">Origem:</span> <span>{lead.source}</span></div>
              )}
              <div><span className="text-muted-foreground text-xs">Estágio:</span> <Badge variant="outline" className="text-xs ml-1">{STAGE_CONFIG[lead.stage].label}</Badge></div>
              {lead.description && (
                <div className="col-span-2"><span className="text-muted-foreground text-xs">Descrição:</span> <p className="text-xs mt-0.5">{lead.description}</p></div>
              )}
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Criado em:</span> <span className="text-xs">{new Date(lead.created_at).toLocaleString("pt-BR")}</span>
              </div>
            </div>
            {existingConsultantSchedule && (
              <div className="mt-2 p-2 rounded border border-primary/20 bg-primary/5">
                <p className="text-xs font-medium flex items-center gap-1"><FlaskConical className="h-3 w-3" /> Agendamento ativo</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Data: {existingConsultantSchedule.scheduled_date ? new Date(existingConsultantSchedule.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                  {existingConsultantSchedule.start_time && ` às ${existingConsultantSchedule.start_time}`}
                  {existingConsultantSchedule.location && ` — ${existingConsultantSchedule.location}`}
                </p>
              </div>
            )}
          </div>
        )}

        {showTestForm && (
          <div className="space-y-3 p-3 rounded-lg border border-dashed bg-muted/30">
            <p className="text-sm font-medium">
              {existingConsultantSchedule ? "Visualizar / Editar Agendamento de Teste" : "Agendar Instalação de Teste (15 dias)"}
            </p>
            {renderScheduleForm()}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} required />
            </div>
            <div className="col-span-2">
              <Label>Categorias</Label>
              <div className="flex flex-wrap gap-2 mt-1.5 p-2 rounded-md border bg-background min-h-[40px]">
                {form.categories.length > 0 && form.categories.map(cat => (
                  <Badge key={cat} variant="secondary" className="text-xs gap-1 pr-1">
                    {cat}
                    <button type="button" onClick={() => toggleCategory(cat)} className="ml-0.5 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {form.categories.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma categoria selecionada</span>}
              </div>
              <div className="grid grid-cols-2 gap-1 mt-2 max-h-32 overflow-y-auto">
                {categories.sort().map((cat) => (
                  <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <Checkbox
                      checked={form.categories.includes(cat)}
                      onCheckedChange={() => toggleCategory(cat)}
                    />
                    {cat}
                  </label>
                ))}
              </div>
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
              <Label>Origem</Label>
              <Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="Site, indicação..." />
            </div>
            <div>
              <Label>Contato</Label>
              <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
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
            <div>
              <Label>E-mail contato</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
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
