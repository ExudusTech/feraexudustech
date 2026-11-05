import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ContactActions from "@/components/ContactActions";
import ClientFormDialog from "@/components/crm/ClientFormDialog";
import LeadFormDialog from "@/components/crm/LeadFormDialog";
import { canRegisterExistingClient } from "@/lib/empresa-contatos";
import { SCHEDULE_TYPE_OPTIONS, fromNotes, mapsLink } from "@/lib/service-kind";
import { Badge } from "@/components/ui/badge";
import { useCreateSchedule, useUpdateSchedule, useSchedules, type Schedule } from "@/hooks/use-schedules";
import { useEkkoaCoverageAreas } from "@/hooks/use-ekkoa-coverage-areas";
import { useLeads } from "@/hooks/use-leads";
import { useClients, type Client } from "@/hooks/use-clients";
import { useOrganizationUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { MapPin, AlertTriangle, Clock, ExternalLink, Sparkles, ChevronDown, Plus, X, Search } from "lucide-react";
import { formatCEP } from "@/lib/validations";
import { findCoverageAreaByCep, getAllowedDays, getNextAllowedDates, getTimeWindow, hasScheduleOverlap } from "@/lib/scheduling-utils";
import { MaterialFields, CnpjGate, emptyMaterial, type MaterialValue, type CnpjStatus } from "@/components/agenda/MaterialPronto";
import { SCHEDULE_SUBTYPE_VALUES, scheduleSubtypeLabel } from "@/lib/linha-produto";
import {
  DEFAULT_VISIT_MINUTES, addMinutes, autoTitle, requiresClient, resolveAssignee, scheduleFieldsFromTarget,
  searchTargets, targetAllowed, type ScheduleTarget,
} from "@/lib/schedule-form";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
  /** Pre-select this client when creating (e.g. "Agendar" from the client record). */
  defaultClientId?: string | null;
}

const empty = {
  schedule_type: "visita_comercial", schedule_subtype: "", scheduled_date: "", start_time: "", end_time: "",
  status: "agendado", location: "", zip_code: "", notes: "", description: "", title: "", assigned_to: "",
};

const clientTarget = (c: Client): ScheduleTarget => ({
  kind: "cliente", id: c.id, name: c.company || c.name, city: c.city, address: c.address, zip_code: c.zip_code,
  latitude: (c as any).latitude ?? null, longitude: (c as any).longitude ?? null,
});

export default function ScheduleFormDialog({ open, onOpenChange, schedule, defaultClientId }: Props) {
  const [form, setForm] = useState(empty);
  const [target, setTarget] = useState<ScheduleTarget | null>(null);
  const [term, setTerm] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [endTouched, setEndTouched] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [material, setMaterial] = useState<MaterialValue>(emptyMaterial);
  const [cnpjStatus, setCnpjStatus] = useState<CnpjStatus>({ ok: false });
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const { data: coverageAreas = [] } = useEkkoaCoverageAreas();
  const { data: allSchedules = [] } = useSchedules();
  const { data: leads = [] } = useLeads();
  const { data: clients = [] } = useClients();
  const { data: users = [] } = useOrganizationUsers();
  const { user } = useAuth();
  const roles = (user?.roles ?? [user?.role ?? ""]) as string[];
  const canChooseAssignee = roles.some((r) => ["admin", "gestor", "super_admin", "operacional"].includes(r));
  const isEdit = !!schedule;

  const targets = useMemo<ScheduleTarget[]>(() => [
    ...clients.map(clientTarget),
    ...leads.map((l: any) => ({
      kind: "lead" as const, id: l.id, name: l.empresa_nome || l.company_name || l.title, city: l.city ?? null,
      address: l.endereco ?? null, zip_code: l.zip_code ?? null, latitude: l.latitude ?? null, longitude: l.longitude ?? null,
    })),
  ], [clients, leads]);

  useEffect(() => {
    if (!open) return;
    setTerm(""); setTriedSubmit(false); setMoreOpen(false);
    if (schedule) {
      setForm({
        schedule_type: schedule.schedule_type || "visita_comercial", schedule_subtype: schedule.schedule_subtype || "",
        scheduled_date: schedule.scheduled_date, start_time: schedule.start_time?.slice(0, 5) || "",
        end_time: schedule.end_time?.slice(0, 5) || "", status: schedule.status, location: schedule.location || "",
        zip_code: schedule.zip_code || "", notes: schedule.notes || "", description: schedule.description || "",
        title: schedule.title, assigned_to: schedule.assigned_to || "",
      });
      setTitleTouched(true); setEndTouched(!!schedule.end_time);
      setMaterial({ operacao: ((schedule as any).operacao_material ?? "") as any, tipo_nota: ((schedule as any).tipo_nota ?? "") as any, itens: Array.isArray((schedule as any).itens) ? (schedule as any).itens : [] });
    } else {
      setForm({ ...empty, assigned_to: user?.id || "", schedule_type: defaultClientId ? "manutencao" : "visita_comercial" });
      setTitleTouched(false); setEndTouched(false);
      setMaterial(emptyMaterial);
    }
  }, [schedule, open, defaultClientId, user?.id]);

  // Resolve the linked client/lead once lists load.
  useEffect(() => {
    if (!open) return;
    const cid = schedule?.client_id ?? (schedule ? null : defaultClientId);
    const lid = schedule?.lead_id ?? null;
    const found = targets.find((t) => (cid && t.kind === "cliente" && t.id === cid) || (!cid && lid && t.kind === "lead" && t.id === lid));
    setTarget(found ?? null);
    if (found && !schedule) applyTarget(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schedule?.id, defaultClientId, targets.length]);

  const set = (k: keyof typeof empty, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function applyTarget(t: ScheduleTarget) {
    const f = scheduleFieldsFromTarget(t);
    setTarget(t); setTerm("");
    setForm((p) => ({ ...p, location: f.location || p.location, zip_code: f.zip_code ? formatCEP(f.zip_code) : p.zip_code }));
  }

  // Auto title unless edited by hand.
  useEffect(() => {
    if (!titleTouched) setForm((p) => ({ ...p, title: autoTitle(p.schedule_type, target?.name) }));
  }, [form.schedule_type, target?.name, titleTouched]);

  // End = start + default duration unless edited by hand.
  useEffect(() => {
    if (!endTouched && form.start_time) setForm((p) => ({ ...p, end_time: addMinutes(p.start_time, DEFAULT_VISIT_MINUTES) }));
  }, [form.start_time, endTouched]);

  const matchedArea = useMemo(() => {
    if (form.zip_code.replace(/\D/g, "").length < 8) return null;
    return findCoverageAreaByCep(form.zip_code, coverageAreas);
  }, [form.zip_code, coverageAreas]);
  const allowedDates = useMemo(() => getNextAllowedDates(getAllowedDays(matchedArea), 60), [matchedArea]);
  const timeWindow = useMemo(() => getTimeWindow(matchedArea), [matchedArea]);

  const assignedTo = user ? resolveAssignee(roles, user.id, form.assigned_to) : "";
  const overlapDetected = useMemo(() => {
    if (!form.scheduled_date || !form.start_time || !assignedTo) return false;
    return hasScheduleOverlap(allSchedules, assignedTo, form.scheduled_date, form.start_time, form.end_time || null, schedule?.id);
  }, [allSchedules, assignedTo, form.scheduled_date, form.start_time, form.end_time, schedule?.id]);

  const results = useMemo(() => searchTargets(targets, term, form.schedule_type), [targets, term, form.schedule_type]);
  const needsClient = requiresClient(form.schedule_type);
  const targetOk = targetAllowed(form.schedule_type, target);
  const precisaNota = !!material.operacao;
  const materialOk = !precisaNota || (cnpjStatus.ok && material.itens.length > 0 && material.itens.every((i) => Number(i.quantidade) > 0));
  const valid = targetOk && !!form.scheduled_date && !!form.start_time && !overlapDetected && materialOk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);
    if (!valid || !target || !user) return;
    const f = scheduleFieldsFromTarget(target);
    const payload: any = {
      title: form.title.trim() || autoTitle(form.schedule_type, target.name),
      description: form.description || null, scheduled_date: form.scheduled_date,
      start_time: form.start_time, end_time: form.end_time || null,
      status: isEdit ? form.status : "agendado",
      location: form.location || null, zip_code: form.zip_code || null, notes: form.notes || null,
      schedule_subtype: form.schedule_subtype || null, schedule_type: form.schedule_type,
      client_id: f.client_id, lead_id: f.lead_id, latitude: f.latitude, longitude: f.longitude,
      assigned_to: assignedTo,
      operacao_material: material.operacao || null, tipo_nota: material.operacao ? (material.tipo_nota || null) : null,
      itens: material.operacao ? material.itens : [],
    };
    if (isEdit) await update.mutateAsync({ id: schedule!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;
  const selectedLead: any = target?.kind === "lead" ? leads.find((l) => l.id === target.id) : null;
  const selectedClient: any = target?.kind === "cliente" ? clients.find((c) => c.id === target.id) : null;
  const mapUrlFromNotes = form.notes.match(/Mapa:\s*(https:\/\/\S+)/i)?.[1]?.replace(/[|,.;]+$/, "");
  const mapsUrl = selectedLead?.maps_url || mapUrlFromNotes || null;
  const execLocked = ["em_atendimento", "concluido", "nao_realizado"].includes(form.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{isEdit ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
            {schedule?.source === "flora" && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> Agendado pela Flora</Badge>}
          </div>
        </DialogHeader>
        {isEdit && (
          <ContactActions
            phone={selectedClient?.phone || selectedLead?.contact_phone || fromNotes(form.notes, "Telefone")}
            whatsapp={selectedLead?.pessoa?.whatsapp}
            mapUrl={mapsUrl || mapsLink(form.location)}
          />
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tipo de serviço *</Label>
              <Select value={form.schedule_type} onValueChange={(v) => set("schedule_type", v)}>
                <SelectTrigger aria-label="Tipo de serviço"><SelectValue /></SelectTrigger>
                <SelectContent>{SCHEDULE_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subtipo</Label>
              <Select value={form.schedule_subtype || "none"} onValueChange={(v) => set("schedule_subtype", v === "none" ? "" : v)}>
                <SelectTrigger aria-label="Subtipo"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {SCHEDULE_SUBTYPE_VALUES.map((v) => <SelectItem key={v} value={v}>{scheduleSubtypeLabel(v)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>Para quem? *</Label>
              {target ? (
                <div className="flex items-start gap-2 rounded-md border p-2">
                  <Badge variant={target.kind === "cliente" ? "default" : "secondary"}>{target.kind === "cliente" ? "Cliente" : "Lead"}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{target.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{[target.address, target.city].filter(Boolean).join(" · ") || "Sem endereço"}</div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Trocar" onClick={() => setTarget(null)}><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" aria-label="Buscar cliente ou lead" placeholder={needsClient ? "Buscar cliente..." : "Buscar cliente ou lead..."} value={term} onChange={(e) => setTerm(e.target.value)} />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                    {results.length === 0 ? (
                      <p className="p-2 text-sm text-muted-foreground">Nada encontrado.</p>
                    ) : results.map((r) => (
                      <button type="button" key={`${r.kind}-${r.id}`} onClick={() => applyTarget(r)} className="flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-accent">
                        <Badge variant={r.kind === "cliente" ? "default" : "secondary"} className="shrink-0">{r.kind === "cliente" ? "Cliente" : "Lead"}</Badge>
                        <span className="flex-1 truncate">{r.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{r.city || "—"}</span>
                      </button>
                    ))}
                  </div>
                  {!needsClient ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setNewLeadOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo lead</Button>
                  ) : canRegisterExistingClient(roles) ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setNewClientOpen(true)}><Plus className="h-4 w-4 mr-1" /> Cliente já atendido</Button>
                  ) : null}
                </>
              )}
              {target && !targetOk && <p className="text-xs text-destructive">Este tipo de serviço exige um cliente (não lead).</p>}
              {triedSubmit && !target && <p className="text-xs text-destructive">Escolha {needsClient ? "o cliente" : "o cliente ou lead"}.</p>}
              {matchedArea && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {matchedArea.name}{matchedArea.dia_semana && ` — ${matchedArea.dia_semana}`}{timeWindow && ` (${timeWindow.start}–${timeWindow.end})`}
                </p>
              )}
            </div>

            <div>
              <Label>Data *</Label>
              <Input type="date" aria-label="Data" value={form.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} required />
              {matchedArea && allowedDates.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {allowedDates.slice(0, 4).map((d) => (
                    <button type="button" key={d} onClick={() => setForm((p) => ({ ...p, scheduled_date: d, start_time: p.start_time || timeWindow?.start || "" }))}
                      className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent">
                      {new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Hora *</Label>
              <Input type="time" aria-label="Hora" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} required />
              {timeWindow && <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Clock className="h-3 w-3" /> Faixa da região {timeWindow.start}–{timeWindow.end}</span>}
            </div>
            {triedSubmit && (!form.scheduled_date || !form.start_time) && <p className="sm:col-span-2 text-xs text-destructive">Informe data e hora.</p>}
            {overlapDetected && (
              <p className="sm:col-span-2 text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Já existe agendamento nesse horário para o responsável.</p>
            )}

            <div className="sm:col-span-2">
              <Label>Responsável</Label>
              {canChooseAssignee ? (
                <Select value={form.assigned_to || user?.id || ""} onValueChange={(v) => set("assigned_to", v)}>
                  <SelectTrigger aria-label="Responsável"><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <p className="text-sm py-2">{users.find((u) => u.user_id === user?.id)?.name || "Você"}</p>
              )}
            </div>

            <MaterialFields scheduleType={form.schedule_type} value={material} onChange={setMaterial} />
            {precisaNota && <CnpjGate target={target ? { kind: target.kind, id: target.id } : null} onStatus={setCnpjStatus} />}
            {triedSubmit && precisaNota && !materialOk && (
              <p className="sm:col-span-2 text-xs text-destructive">{!cnpjStatus.ok ? "Informe um CNPJ válido e ativo para emitir a nota." : "Adicione os itens com quantidade."}</p>
            )}

            <div className="sm:col-span-2"><Label>Observação</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
          </div>

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="px-0"><ChevronDown className={`h-4 w-4 mr-1 transition-transform ${moreOpen ? "rotate-180" : ""}`} /> Mais detalhes</Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="sm:col-span-2"><Label>Título</Label><Input value={form.title} onChange={(e) => { setTitleTouched(true); set("title", e.target.value); }} /></div>
              <div><Label>Hora fim</Label><Input type="time" value={form.end_time} onChange={(e) => { setEndTouched(true); set("end_time", e.target.value); }} /></div>
              <div><Label>CEP</Label><Input value={form.zip_code} onChange={(e) => set("zip_code", formatCEP(e.target.value))} placeholder="00000-000" maxLength={9} /></div>
              <div className="sm:col-span-2"><Label>Endereço / local</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
              {isEdit && (
                <div className="sm:col-span-2">
                  <Label>Status</Label>
                  {execLocked ? (
                    <p className="text-sm text-muted-foreground py-2">Use Iniciar/Encerrar na visita.</p>
                  ) : (
                    <Select value={form.status} onValueChange={(v) => set("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agendado">Agendado</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {mapsUrl && (
                <Button type="button" variant="outline" asChild className="sm:col-span-2">
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-2" /> Abrir no Google Maps</a>
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="sticky bottom-0 -mx-4 px-4 py-2 bg-background border-t sm:static sm:mx-0 sm:px-0 sm:py-0 sm:border-0 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || overlapDetected}>{isPending ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
      <ClientFormDialog open={newClientOpen} onOpenChange={setNewClientOpen} onSaved={(c) => applyTarget(clientTarget(c))} />
      <LeadFormDialog open={newLeadOpen} onOpenChange={setNewLeadOpen} onCreated={(l: any) => applyTarget({
        kind: "lead", id: l.id, name: l.empresa_nome || l.title, city: l.city ?? null, address: l.endereco ?? null,
        zip_code: l.zip_code ?? null, latitude: l.latitude ?? null, longitude: l.longitude ?? null,
      })} />
    </Dialog>
  );
}
