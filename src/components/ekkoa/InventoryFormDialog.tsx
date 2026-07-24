import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateInventoryItem, useUpdateInventoryItem, type InventoryItem } from "@/hooks/use-inventory";
import { useClients } from "@/hooks/use-clients";
import { LINHA_PRODUTO_VALUES, linhaLabel } from "@/lib/linha-produto";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
  defaultItemType?: "EQUIPAMENTO" | "CONSUMIVEL";
}

const empty = {
  name: "", serial_number: "", status: "active", location: "",
  installation_date: "", last_maintenance_date: "",
  geolocation: "", photo_url: "", description: "",
  linha_produto: "", item_type: "EQUIPAMENTO",
  em_comodato: false, client_id: "",
  localizacao_interna: "", proxima_manutencao: "",
  category: "", sku: "", quantity: "0", unit: "un",
};

export default function InventoryFormDialog({ open, onOpenChange, item, defaultItemType }: Props) {
  const [form, setForm] = useState<any>({ ...empty, item_type: defaultItemType ?? "EQUIPAMENTO" });
  const { data: clients = [] } = useClients();
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
        linha_produto: item.linha_produto || "",
        item_type: item.item_type || defaultItemType || "EQUIPAMENTO",
        em_comodato: !!item.em_comodato,
        client_id: item.client_id || "",
        localizacao_interna: item.localizacao_interna || "",
        proxima_manutencao: item.proxima_manutencao || "",
        category: item.category || "",
        sku: item.sku || "",
        quantity: String(item.quantity ?? 0),
        unit: item.unit || "un",
      });
    } else {
      setForm({ ...empty, item_type: defaultItemType ?? "EQUIPAMENTO" });
    }
  }, [item, open, defaultItemType]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

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
      linha_produto: form.linha_produto || null,
      item_type: form.item_type || null,
      em_comodato: form.em_comodato,
      client_id: form.em_comodato && form.client_id ? form.client_id : null,
      localizacao_interna: form.localizacao_interna || null,
      proxima_manutencao: form.proxima_manutencao || null,
      category: form.category || null,
      sku: form.sku || null,
      quantity: Number(form.quantity) || 0,
      unit: form.unit || "un",
    };
    if (isEdit) await update.mutateAsync({ id: item!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Item" : "Adicionar Item ao Inventário"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Edite as informações do item." : "Adicione um novo equipamento ou consumível."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={form.item_type} onValueChange={(v) => set("item_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EQUIPAMENTO">Equipamento</SelectItem>
                  <SelectItem value="CONSUMIVEL">Consumível</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Linha de Produto</Label>
              <Select value={form.linha_produto || "none"} onValueChange={(v) => set("linha_produto", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {LINHA_PRODUTO_VALUES.map((l) => <SelectItem key={l} value={l}>{linhaLabel(l)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Marca / Categoria</Label>
              <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Ex: Ekkoa 500" />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} />
            </div>
            <div>
              <Label>Número Serial</Label>
              <Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
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
              <Label>Localização Interna</Label>
              <Input value={form.localizacao_interna} onChange={(e) => set("localizacao_interna", e.target.value)} placeholder="Ex: Estoque A, Prateleira 3" />
            </div>
            <div className="col-span-2 flex items-center gap-3 border rounded-md px-3 py-2">
              <Switch checked={form.em_comodato} onCheckedChange={(v) => set("em_comodato", v)} />
              <Label className="!m-0">Em comodato com cliente</Label>
            </div>
            {form.em_comodato && (
              <div className="col-span-2">
                <Label>Cliente</Label>
                <Select value={form.client_id || "none"} onValueChange={(v) => set("client_id", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Data de Instalação</Label>
              <Input type="date" value={form.installation_date} onChange={(e) => set("installation_date", e.target.value)} />
            </div>
            <div>
              <Label>Última Manutenção</Label>
              <Input type="date" value={form.last_maintenance_date} onChange={(e) => set("last_maintenance_date", e.target.value)} />
            </div>
            <div>
              <Label>Próxima Manutenção</Label>
              <Input type="date" value={form.proxima_manutencao} onChange={(e) => set("proxima_manutencao", e.target.value)} />
            </div>
            <div>
              <Label>Localização Geral</Label>
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Geolocalização</Label>
              <Input value={form.geolocation} onChange={(e) => set("geolocation", e.target.value)} placeholder="lat, lng" />
            </div>
            <div className="col-span-2">
              <Label>URL da Foto</Label>
              <Input value={form.photo_url} onChange={(e) => set("photo_url", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
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
