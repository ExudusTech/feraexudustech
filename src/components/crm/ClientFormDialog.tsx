import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCreateClient, useUpdateClient, type Client } from "@/hooks/use-clients";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import ContatosEditor from "@/components/crm/ContatosEditor";
import PlaceSearch from "@/components/crm/PlaceSearch";
import { useEmpresaContatos, saveEmpresaContatos, useInvalidateContatos } from "@/hooks/use-empresa-contatos";
import { validateContatos, type ContatoDraft } from "@/lib/empresa-contatos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  onSaved?: (client: Client) => void;
}

const empty = { name: "", email: "", phone: "", document: "", company: "", address: "", city: "", state: "", zip_code: "", notes: "", status: "active" };
const ORIGEM_LABEL: Record<string, string> = { base_existente: "Base existente", importacao: "Importação", conversao: "Convertido de lead" };

/** New clients here are always "já atendido (base existente)"; prospects go through Novo lead. */
export default function ClientFormDialog({ open, onOpenChange, client, onSaved }: Props) {
  const [form, setForm] = useState(empty);
  const [geo, setGeo] = useState<{ latitude: number | null; longitude: number | null; place_id: string | null }>({ latitude: null, longitude: null, place_id: null });
  const [contatos, setContatos] = useState<ContatoDraft[]>([]);
  const [cErr, setCErr] = useState<Record<string, string>>({});
  const create = useCreateClient();
  const update = useUpdateClient();
  const { user } = useAuth();
  const invalidate = useInvalidateContatos();
  const isEdit = !!client;
  const { data: saved } = useEmpresaContatos(open && client ? { client_id: client.id } : null);

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name, email: client.email || "", phone: client.phone || "", document: client.document || "",
        company: client.company || "", address: client.address || "", city: client.city || "", state: client.state || "",
        zip_code: client.zip_code || "", notes: client.notes || "", status: client.status,
      });
    } else { setForm(empty); setContatos([]); setGeo({ latitude: null, longitude: null, place_id: null }); }
    setCErr({});
  }, [client, open]);
  useEffect(() => { if (open && client && saved) setContatos(saved); }, [open, client, saved]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const errs = validateContatos(contatos, { minOne: false });
    setCErr(errs);
    if (Object.keys(errs).length) return;
    let saved: Client | null = null;
    if (isEdit) {
      saved = (await update.mutateAsync({ id: client!.id, ...form })) as Client;
    } else {
      saved = (await create.mutateAsync({ ...form, ...(geo.place_id ? geo : {}), origem: "base_existente" } as any)) as Client;
    }
    if (saved && user?.organization_id) {
      await saveEmpresaContatos(user.organization_id, { client_id: saved.id }, contatos, user.id)
        .catch((er) => toast({ title: "Erro ao salvar contatos", description: er.message, variant: "destructive" }));
      invalidate();
    }
    if (!isEdit && saved) onSaved?.(saved);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;
  const origem = (client as any)?.origem as string | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Cliente" : "Cadastrar cliente já atendido"}</DialogTitle>
          {!isEdit && <DialogDescription>Para empresas que ainda não são clientes, use Novo lead em Leads.</DialogDescription>}
          {isEdit && origem && <Badge variant="secondary" className="w-fit">{ORIGEM_LABEL[origem] ?? origem}</Badge>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <div className="col-span-2">
                <PlaceSearch onPick={(p) => {
                  setForm((f) => ({ ...f, name: f.name || p.nome, company: f.company || p.nome, address: p.endereco, city: p.cidade || f.city, state: p.estado || f.state }));
                  setGeo({ latitude: p.lat, longitude: p.lng, place_id: p.place_id });
                }} />
              </div>
            )}
            <div className="col-span-2">
              <Label>Nome da empresa *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input value={form.document} onChange={(e) => set("document", e.target.value)} />
            </div>
            <div>
              <Label>Telefone da empresa</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>E-mail da empresa</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
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
              <ContatosEditor value={contatos} onChange={(v) => { setContatos(v); setCErr({}); }} errors={cErr} />
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
