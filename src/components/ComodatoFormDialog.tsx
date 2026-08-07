import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateComodato, useUpdateComodato, type Comodato } from "@/hooks/use-comodatos";
import { useClients } from "@/hooks/use-clients";
import { useInventory } from "@/hooks/use-inventory";
import { useProducts } from "@/hooks/use-products";
import { useDispenserFamilies } from "@/hooks/use-dispenser-families";
import { LINHA_PRODUTO_VALUES, linhaLabel } from "@/lib/linha-produto";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comodato?: Comodato | null;
}

const empty = {
  numero_contrato: "",
  client_id: "",
  inventory_item_id: "",
  product_id: "",
  dispenser_family_id: "",
  linha_produto: "",

  localizacao_interna: "",
  endereco_instalacao: "",
  cidade: "",
  estado: "",
  consumo_minimo: "",
  unidade_consumo: "un",
  valor_mensal: "",
  data_inicio: "",
  data_fim: "",
  status: "ATIVO",
  proxima_manutencao: "",
  periodicidade_manut: "",
  notes: "",
};

export default function ComodatoFormDialog({ open, onOpenChange, comodato }: Props) {
  const [form, setForm] = useState(empty);
  const { data: clients = [] } = useClients();
  const { data: inventory = [] } = useInventory();
  const { data: products = [] } = useProducts();
  const create = useCreateComodato();
  const update = useUpdateComodato();
  const isEdit = !!comodato;

  useEffect(() => {
    if (comodato) {
      setForm({
        numero_contrato: comodato.numero_contrato ?? "",
        client_id: comodato.client_id ?? "",
        inventory_item_id: comodato.inventory_item_id ?? "",
        product_id: comodato.product_id ?? "",
        dispenser_family_id: comodato.dispenser_family_id ?? "",

        linha_produto: comodato.linha_produto ?? "",
        localizacao_interna: comodato.localizacao_interna ?? "",
        endereco_instalacao: comodato.endereco_instalacao ?? "",
        cidade: comodato.cidade ?? "",
        estado: comodato.estado ?? "",
        consumo_minimo: comodato.consumo_minimo != null ? String(comodato.consumo_minimo) : "",
        unidade_consumo: comodato.unidade_consumo ?? "un",
        valor_mensal: comodato.valor_mensal != null ? String(comodato.valor_mensal) : "",
        data_inicio: comodato.data_inicio ?? "",
        data_fim: comodato.data_fim ?? "",
        status: comodato.status ?? "ATIVO",
        proxima_manutencao: comodato.proxima_manutencao ?? "",
        periodicidade_manut: comodato.periodicidade_manut ?? "",
        notes: comodato.notes ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [comodato, open]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const familyId = form.dispenser_family_id;

  // Equipamentos (dispensers físicos), filtrados pela família quando informada
  const equipmentOptions = useMemo(
    () =>
      inventory
        .filter((i) => (i.item_type ?? "EQUIPAMENTO") === "EQUIPAMENTO")
        .filter((i) => !familyId || !i.dispenser_family_id || i.dispenser_family_id === familyId),
    [inventory, familyId]
  );

  // Consumíveis disponíveis para comodato, compatíveis com a família selecionada
  const productOptions = useMemo(
    () =>
      products
        .filter((p) => p.disponivel_comodato !== false && !p.is_dispenser)
        .filter((p) => !familyId || (p.compatible_dispenser_families || []).includes(familyId)),
    [products, familyId]
  );


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id) return;
    const payload: any = {
      numero_contrato: form.numero_contrato || null,
      client_id: form.client_id,
      inventory_item_id: form.inventory_item_id || null,
      product_id: form.product_id || null,
      linha_produto: form.linha_produto || null,
      dispenser_family_id: form.dispenser_family_id || null,

      localizacao_interna: form.localizacao_interna || null,
      endereco_instalacao: form.endereco_instalacao || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      consumo_minimo: form.consumo_minimo ? Number(form.consumo_minimo) : null,
      unidade_consumo: form.unidade_consumo || null,
      valor_mensal: form.valor_mensal ? Number(form.valor_mensal) : null,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      status: form.status,
      proxima_manutencao: form.proxima_manutencao || null,
      periodicidade_manut: form.periodicidade_manut || null,
      notes: form.notes || null,
    };
    if (isEdit) await update.mutateAsync({ id: comodato!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Comodato" : "Novo Comodato"}</DialogTitle>
          <DialogDescription>Contrato de cessão de equipamento a cliente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nº Contrato</Label>
              <Input value={form.numero_contrato} onChange={(e) => set("numero_contrato", e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="SUSPENSO">Suspenso</SelectItem>
                  <SelectItem value="ENCERRADO">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Cliente *</Label>
              <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Linha de Produto</Label>
              <Select value={form.linha_produto || "none"} onValueChange={(v) => set("linha_produto", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {LINHA_PRODUTO_VALUES.map((l) => <SelectItem key={l} value={l}>{linhaLabel(l)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Dispenser</Label>
              <Select
                value={form.dispenser_family_id || "none"}
                onValueChange={(v) => {
                  const next = v === "none" ? "" : v;
                  setForm((p) => ({ ...p, dispenser_family_id: next, inventory_item_id: "", product_id: "" }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {families.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Equipamento</Label>
              <Select value={form.inventory_item_id || "none"} onValueChange={(v) => set("inventory_item_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {equipmentOptions.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}{i.serial_number ? ` — ${i.serial_number}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Produto Consumível</Label>
              <Select value={form.product_id || "none"} onValueChange={(v) => set("product_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {productOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {familyId && productOptions.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Nenhum consumível compatível com este dispenser.</p>
              )}
            </div>
            <div>

              <Label>Consumo Mínimo</Label>
              <Input type="number" step="0.01" value={form.consumo_minimo} onChange={(e) => set("consumo_minimo", e.target.value)} />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input value={form.unidade_consumo} onChange={(e) => set("unidade_consumo", e.target.value)} placeholder="un, L, kg..." />
            </div>
            <div>
              <Label>Valor Mensal (R$)</Label>
              <Input type="number" step="0.01" value={form.valor_mensal} onChange={(e) => set("valor_mensal", e.target.value)} />
            </div>
            <div>
              <Label>Localização Interna</Label>
              <Input value={form.localizacao_interna} onChange={(e) => set("localizacao_interna", e.target.value)} placeholder="Ex: banheiro térreo" />
            </div>
            <div className="col-span-2">
              <Label>Endereço de Instalação</Label>
              <Input value={form.endereco_instalacao} onChange={(e) => set("endereco_instalacao", e.target.value)} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div>
              <Label>Estado</Label>
              <Input value={form.estado} onChange={(e) => set("estado", e.target.value)} maxLength={2} />
            </div>
            <div>
              <Label>Data Início</Label>
              <Input type="date" value={form.data_inicio} onChange={(e) => set("data_inicio", e.target.value)} />
            </div>
            <div>
              <Label>Data Fim</Label>
              <Input type="date" value={form.data_fim} onChange={(e) => set("data_fim", e.target.value)} />
            </div>
            <div>
              <Label>Próxima Manutenção</Label>
              <Input type="date" value={form.proxima_manutencao} onChange={(e) => set("proxima_manutencao", e.target.value)} />
            </div>
            <div>
              <Label>Periodicidade Manut.</Label>
              <Input value={form.periodicidade_manut} onChange={(e) => set("periodicidade_manut", e.target.value)} placeholder="Ex: mensal, trimestral" />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !form.client_id}>{isPending ? "Salvando..." : isEdit ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
