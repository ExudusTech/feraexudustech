import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateEkkoaClient, useUpdateEkkoaClient, type EkkoaClient } from "@/hooks/use-ekkoa-clients";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; client?: EkkoaClient | null; }

const empty = { name: "", email: "", phone: "", document: "", company: "", address: "", city: "", state: "", zip_code: "", client_type: "residencial", notes: "", status: "active" };

export default function EkkoaClientFormDialog({ open, onOpenChange, client }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateEkkoaClient();
  const update = useUpdateEkkoaClient();
  const isEdit = !!client;

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name, email: client.email || "", phone: client.phone || "",
        document: client.document || "", company: client.company || "", address: client.address || "",
        city: client.city || "", state: client.state || "", zip_code: client.zip_code || "",
        client_type: client.client_type, notes: client.notes || "", status: client.status,
      });
    } else setForm(empty);
  }, [client, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name, email: form.email || null, phone: form.phone || null,
      document: form.document || null, company: form.company || null, address: form.address || null,
      city: form.city || null, state: form.state || null, zip_code: form.zip_code || null,
      client_type: form.client_type, notes: form.notes || null, status: form.status,
    };
    if (isEdit) await update.mutateAsync({ id: client!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Cliente Ekkoa" : "Novo Cliente Ekkoa"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} required /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div><Label>Documento</Label><Input value={form.document} onChange={(e) => set("document", e.target.value)} /></div>
            <div><Label>Empresa</Label><Input value={form.company} onChange={(e) => set("company", e.target.value)} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.client_type} onValueChange={(v) => set("client_type", v)}>
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
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Endereço</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></div>
            <div><Label>Cidade</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
            <div><Label>Estado</Label><Input value={form.state} onChange={(e) => set("state", e.target.value)} /></div>
            <div><Label>CEP</Label><Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} /></div>
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
