import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCreateSchedule, useUpdateSchedule, type Schedule } from "@/hooks/use-schedules";
import { useCoverageValidation } from "@/hooks/use-coverage-validation";
import { MapPin, AlertTriangle, CheckCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
}

const empty = { title: "", description: "", scheduled_date: "", start_time: "", end_time: "", status: "agendado", location: "", notes: "", zip_code: "", city: "", state: "" };

export default function ScheduleFormDialog({ open, onOpenChange, schedule }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const isEdit = !!schedule;
  const { validate, hasAreas } = useCoverageValidation();

  useEffect(() => {
    if (schedule) {
      setForm({
        title: schedule.title, description: schedule.description || "",
        scheduled_date: schedule.scheduled_date, start_time: schedule.start_time || "",
        end_time: schedule.end_time || "", status: schedule.status,
        location: schedule.location || "", notes: schedule.notes || "",
        zip_code: "", city: "", state: "",
      });
    } else setForm(empty);
  }, [schedule, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const coverageResult = useMemo(
    () => validate(form.zip_code || null, form.city || null, form.state || null),
    [form.zip_code, form.city, form.state, validate]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_date) return;
    if (hasAreas && !coverageResult.isValid && (form.zip_code || form.city || form.state)) return;
    const locationParts = [form.location, form.city, form.state].filter(Boolean);
    const payload = {
      title: form.title, description: form.description || null, scheduled_date: form.scheduled_date,
      start_time: form.start_time || null, end_time: form.end_time || null, status: form.status,
      location: locationParts.join(", ") || null, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: schedule!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;
  const showCoverage = hasAreas && (form.zip_code || form.city || form.state);
  const blockSubmit = hasAreas && !coverageResult.isValid && !!(form.zip_code || form.city || form.state);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div><Label>Data *</Label><Input type="date" value={form.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} required /></div>
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
            <div><Label>Hora início</Label><Input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} /></div>
            <div><Label>Hora fim</Label><Input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} /></div>
            <div className="col-span-2"><Label>Local</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
            <div><Label>Cidade</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
            <div><Label>Estado</Label><Input value={form.state} onChange={(e) => set("state", e.target.value)} /></div>
            <div><Label>CEP</Label><Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} placeholder="00000-000" /></div>

            {showCoverage && (
              <div className="col-span-2">
                <Alert variant={coverageResult.isValid ? "default" : "destructive"} className="py-2">
                  <div className="flex items-center gap-2">
                    {coverageResult.isValid ? (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    <AlertDescription className="text-sm">
                      {coverageResult.isValid && coverageResult.matchedArea && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {coverageResult.message}
                        </span>
                      )}
                      {!coverageResult.isValid && coverageResult.message}
                    </AlertDescription>
                  </div>
                </Alert>
              </div>
            )}

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
