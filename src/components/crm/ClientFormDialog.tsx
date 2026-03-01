import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateClient, useUpdateClient, type Client } from "@/hooks/use-clients";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
}

const empty = { name: "", email: "", phone: "", document: "", company: "", address: "", city: "", state: "", zip_code: "", notes: "", status: "active" };

export default function ClientFormDialog({ open, onOpenChange, client }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateClient();
  const update = useUpdateClient();
  const isEdit = !!client;

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name,
        email: client.email || "",
        phone: client.phone || "",
        document: client.document || "",
        company: client.company || "",
        address: client.address || "",
        city: client.city || "",
        state: client.state || "",
        zip_code: client.zip_code || "",
        notes: client.notes || "",
        status: client.status,
      });
    } else {
      setForm(empty);
    }
  }, [client, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    if (isEdit) {
      await update.mutateAsync({ id: client!.id, ...form });
    } else {
      await create.mutateAsync(form);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <Label>CPF/CNPJ</Label>
              <Input value={form.document} onChange={(e) => set("document", e.target.value)} />
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Endereço</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
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
              <Label>CEP</Label>
              <Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
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
