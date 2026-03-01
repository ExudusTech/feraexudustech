import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useCreateEkkoaCoverageArea, useUpdateEkkoaCoverageArea, type EkkoaCoverageArea } from "@/hooks/use-ekkoa-coverage-areas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area?: EkkoaCoverageArea | null;
}

const empty = { name: "", description: "", city: "", state: "", zip_code_start: "", zip_code_end: "", radius_km: "", latitude: "", longitude: "", is_active: true };

export default function EkkoaCoverageAreaFormDialog({ open, onOpenChange, area }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateEkkoaCoverageArea();
  const update = useUpdateEkkoaCoverageArea();
  const isEdit = !!area;

  useEffect(() => {
    if (area) {
      setForm({
        name: area.name, description: area.description || "", city: area.city || "", state: area.state || "",
        zip_code_start: area.zip_code_start || "", zip_code_end: area.zip_code_end || "",
        radius_km: area.radius_km?.toString() || "", latitude: area.latitude?.toString() || "",
        longitude: area.longitude?.toString() || "", is_active: area.is_active,
      });
    } else {
      setForm(empty);
    }
  }, [area, open]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name, description: form.description || null, city: form.city || null, state: form.state || null,
      zip_code_start: form.zip_code_start || null, zip_code_end: form.zip_code_end || null,
      radius_km: form.radius_km ? Number(form.radius_km) : null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      is_active: form.is_active,
    };
    if (isEdit) {
      await update.mutateAsync({ id: area!.id, ...payload });
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
          <DialogTitle>{isEdit ? "Editar Área" : "Nova Área de Cobertura"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>Estado</Label>
              <Input value={form.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div>
              <Label>CEP Início</Label>
              <Input value={form.zip_code_start} onChange={(e) => set("zip_code_start", e.target.value)} />
            </div>
            <div>
              <Label>CEP Fim</Label>
              <Input value={form.zip_code_end} onChange={(e) => set("zip_code_end", e.target.value)} />
            </div>
            <div>
              <Label>Raio (km)</Label>
              <Input type="number" value={form.radius_km} onChange={(e) => set("radius_km", e.target.value)} />
            </div>
            <div>
              <Label>Latitude</Label>
              <Input type="number" step="any" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input type="number" step="any" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Ativo</Label>
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
