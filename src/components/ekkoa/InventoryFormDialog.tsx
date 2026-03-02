import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateInventoryItem, useUpdateInventoryItem, type InventoryItem } from "@/hooks/use-inventory";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
}

const empty = {
  name: "", serial_number: "", status: "active", location: "",
  installation_date: "", last_maintenance_date: "",
  geolocation: "", photo_url: "", description: "",
};

export default function InventoryFormDialog({ open, onOpenChange, item }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateInventoryItem();
  const update = useUpdateInventoryItem();
  const isEdit = !!item;

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name, serial_number: item.serial_number || "",
        status: item.status, location: item.location || "",
        installation_date: item.installation_date || "",
        last_maintenance_date: item.last_maintenance_date || "",
        geolocation: item.geolocation || "",
        photo_url: item.photo_url || "",
        description: item.description || "",
      });
    } else setForm(empty);
  }, [item, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload: any = {
      name: form.name,
      serial_number: form.serial_number || null,
      status: form.status,
      location: form.location || null,
      installation_date: form.installation_date || null,
      last_maintenance_date: form.last_maintenance_date || null,
      geolocation: form.geolocation || null,
      photo_url: form.photo_url || null,
      description: form.description || null,
    };
    if (isEdit) await update.mutateAsync({ id: item!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Item do Inventário" : "Adicionar Item ao Inventário"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Edite as informações do equipamento." : "Adicione um novo equipamento ao inventário do sistema Ekkoa."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Equipamento *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Ex: Ekkoa 500, Ekkoa Mini" />
            </div>
            <div>
              <Label>Número Serial *</Label>
              <Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} placeholder="Ex: EK500001" />
            </div>
            <div>
              <Label>Status *</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Disponível</SelectItem>
                  <SelectItem value="em_teste">Em Teste</SelectItem>
                  <SelectItem value="instalado">Instalado</SelectItem>
                  <SelectItem value="manutencao">Em Manutenção</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Localização Atual</Label>
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Ex: Estoque, Cliente ABC" />
            </div>
            <div>
              <Label>Data de Instalação</Label>
              <Input type="date" value={form.installation_date} onChange={(e) => set("installation_date", e.target.value)} />
            </div>
            <div>
              <Label>Última Manutenção</Label>
              <Input type="date" value={form.last_maintenance_date} onChange={(e) => set("last_maintenance_date", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Geolocalização</Label>
              <Input value={form.geolocation} onChange={(e) => set("geolocation", e.target.value)} placeholder="Ex: -22.906847, -43.172896" />
            </div>
            <div className="col-span-2">
              <Label>URL da Foto de Instalação</Label>
              <Input value={form.photo_url} onChange={(e) => set("photo_url", e.target.value)} placeholder="https://..." />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Observações sobre o equipamento..." />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : isEdit ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
