import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCreateSchedule, useUpdateSchedule, useSchedules, type Schedule } from "@/hooks/use-schedules";
import { useEkkoaCoverageAreas } from "@/hooks/use-ekkoa-coverage-areas";
import { useAuth } from "@/hooks/use-auth";
import { MapPin, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { formatCEP } from "@/lib/validations";
import { findCoverageAreaByCep, getAllowedDays, getNextAllowedDates, getTimeWindow, hasScheduleOverlap } from "@/lib/scheduling-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
}

const empty = { title: "", description: "", scheduled_date: "", start_time: "", end_time: "", status: "agendado", location: "", notes: "", zip_code: "" };

export default function ScheduleFormDialog({ open, onOpenChange, schedule }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const { data: coverageAreas = [] } = useEkkoaCoverageAreas();
  const { data: allSchedules = [] } = useSchedules();
  const { user } = useAuth();
  const isEdit = !!schedule;

  useEffect(() => {
    if (schedule) {
      setForm({
        title: schedule.title, description: schedule.description || "",
        scheduled_date: schedule.scheduled_date, start_time: schedule.start_time || "",
        end_time: schedule.end_time || "", status: schedule.status,
        location: schedule.location || "", notes: schedule.notes || "",
        zip_code: "",
      });
    } else setForm(empty);
  }, [schedule, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Coverage validation
  const matchedArea = useMemo(() => {
    if (!form.zip_code || form.zip_code.replace(/\D/g, "").length < 8) return null;
    return findCoverageAreaByCep(form.zip_code, coverageAreas);
  }, [form.zip_code, coverageAreas]);

  const cepValid = form.zip_code.replace(/\D/g, "").length === 8;
  const cepEntered = form.zip_code.replace(/\D/g, "").length > 0;
  const hasAreas = coverageAreas.filter((a) => a.is_active).length > 0;

  // Allowed dates
  const allowedDays = useMemo(() => getAllowedDays(matchedArea), [matchedArea]);
  const allowedDates = useMemo(() => getNextAllowedDates(allowedDays, 60), [allowedDays]);

  // Time window
  const timeWindow = useMemo(() => getTimeWindow(matchedArea), [matchedArea]);

  // Overlap check
  const assignedTo = schedule?.assigned_to || user?.id || "";
  const overlapDetected = useMemo(() => {
    if (!form.scheduled_date || !form.start_time || !assignedTo) return false;
    return hasScheduleOverlap(allSchedules, assignedTo, form.scheduled_date, form.start_time, form.end_time || null, schedule?.id);
  }, [allSchedules, assignedTo, form.scheduled_date, form.start_time, form.end_time, schedule?.id]);

  // Reset date/time when CEP changes
  useEffect(() => {
    if (!isEdit) {
      setForm((prev) => ({ ...prev, scheduled_date: "", start_time: "", end_time: "" }));
    }
  }, [form.zip_code]);

  // Auto-fill time from window
  useEffect(() => {
    if (timeWindow && form.scheduled_date && !form.start_time) {
      setForm((prev) => ({ ...prev, start_time: timeWindow.start, end_time: timeWindow.end }));
    }
  }, [timeWindow, form.scheduled_date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_date) return;
    if (hasAreas && cepValid && !matchedArea) return;
    if (overlapDetected) return;

    const payload = {
      title: form.title, description: form.description || null, scheduled_date: form.scheduled_date,
      start_time: form.start_time || null, end_time: form.end_time || null, status: form.status,
      location: form.location || null, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: schedule!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;
  const blockSubmit = (hasAreas && cepValid && !matchedArea) || overlapDetected;
  const showCepSection = hasAreas;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>

            {/* CEP First - when areas exist */}
            {showCepSection && (
              <>
                <div className="col-span-2">
                  <Label className="font-semibold">CEP do local {!isEdit && "*"}</Label>
                  <Input
                    value={form.zip_code}
                    onChange={(e) => set("zip_code", formatCEP(e.target.value))}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                </div>

                {cepValid && (
                  <div className="col-span-2">
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
                              <MapPin className="h-3 w-3" /> <strong>{matchedArea.name}</strong>
                              {matchedArea.dia_semana && ` — ${matchedArea.dia_semana}`}
                              {timeWindow && ` (${timeWindow.start}–${timeWindow.end})`}
                            </span>
                          ) : (
                            "CEP fora da área de cobertura."
                          )}
                        </AlertDescription>
                      </div>
                    </Alert>
                  </div>
                )}
              </>
            )}

            {/* Date - smart filtering when area matched */}
            {matchedArea && allowedDates.length > 0 ? (
              <div className="col-span-2">
                <Label>Data *</Label>
                <Select
                  value={form.scheduled_date}
                  onValueChange={(v) => set("scheduled_date", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma data disponível..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedDates.map((d) => {
                      const dateObj = new Date(d + "T12:00:00");
                      const dayName = dateObj.toLocaleDateString("pt-BR", { weekday: "long" });
                      const formatted = dateObj.toLocaleDateString("pt-BR");
                      const overlap = assignedTo && hasScheduleOverlap(allSchedules, assignedTo, d, timeWindow?.start || "09:00", timeWindow?.end || "10:00", schedule?.id);
                      return (
                        <SelectItem key={d} value={d} disabled={!!overlap}>
                          {formatted} ({dayName}){overlap ? " — Ocupado" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} required />
              </div>
            )}

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time - with window hints */}
            <div>
              <Label>Hora início</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => set("start_time", e.target.value)}
                min={timeWindow?.start}
                max={timeWindow?.end}
              />
              {timeWindow && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" /> {timeWindow.start}–{timeWindow.end}
                </span>
              )}
            </div>
            <div>
              <Label>Hora fim</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => set("end_time", e.target.value)}
                min={timeWindow?.start}
                max={timeWindow?.end}
              />
            </div>

            {overlapDetected && (
              <div className="col-span-2">
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Já existe agendamento nesse horário para o consultor.
                </p>
              </div>
            )}

            <div className="col-span-2"><Label>Local</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
            <div className="col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || blockSubmit}>{isPending ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
