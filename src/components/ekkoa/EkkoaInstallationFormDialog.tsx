import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateEkkoaInstallation, useUpdateEkkoaInstallation, type EkkoaInstallation } from "@/hooks/use-ekkoa-installations";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; installation?: EkkoaInstallation | null; }

const empty = { title: "", description: "", installation_type: "residencial", address: "", city: "", state: "", zip_code: "", power_kwp: "", panels_count: "", inverter_model: "", start_date: "", end_date: "", status: "planejada", notes: "" };

export default function EkkoaInstallationFormDialog({ open, onOpenChange, installation }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateEkkoaInstallation();
  const update = useUpdateEkkoaInstallation();
  const isEdit = !!installation;

  useEffect(() => {
    if (installation) {
      setForm({
        title: installation.title, description: installation.description || "",
        installation_type: installation.installation_type, address: installation.address || "",
        city: installation.city || "", state: installation.state || "", zip_code: installation.zip_code || "",
        power_kwp: String(installation.power_kwp || ""), panels_count: String(installation.panels_count || ""),
        inverter_model: installation.inverter_model || "", start_date: installation.start_date || "",
        end_date: installation.end_date || "", status: installation.status, notes: installation.notes || "",
      });
    } else setForm(empty);
  }, [installation, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title, description: form.description || null,
      installation_type: form.installation_type, address: form.address || null,
      city: form.city || null, state: form.state || null, zip_code: form.zip_code || null,
      power_kwp: form.power_kwp ? parseFloat(form.power_kwp) : null,
      panels_count: form.panels_count ? parseInt(form.panels_count) : null,
      inverter_model: form.inverter_model || null, start_date: form.start_date || null,
      end_date: form.end_date || null, status: form.status, notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: installation!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Instalação" : "Nova Instalação"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.installation_type} onValueChange={(v) => set("installation_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residencial">Residencial</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="rural">Rural</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejada">Planejada</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Potência (kWp)</Label><Input type="number" step="0.01" value={form.power_kwp} onChange={(e) => set("power_kwp", e.target.value)} /></div>
            <div><Label>Nº Painéis</Label><Input type="number" value={form.panels_count} onChange={(e) => set("panels_count", e.target.value)} /></div>
            <div className="col-span-2"><Label>Modelo do Inversor</Label><Input value={form.inverter_model} onChange={(e) => set("inverter_model", e.target.value)} /></div>
            <div><Label>Início</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
            <div><Label>Fim</Label><Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
            <div className="col-span-2"><Label>Endereço</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></div>
            <div><Label>Cidade</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
            <div><Label>Estado</Label><Input value={form.state} onChange={(e) => set("state", e.target.value)} /></div>
            <div><Label>CEP</Label><Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
            <div className="col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
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
