import { useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { useComodatos, useDeleteComodato, COMODATO_STATUS_BADGE, type Comodato } from "@/hooks/use-comodatos";
import { useClients } from "@/hooks/use-clients";
import { useInventory } from "@/hooks/use-inventory";
import { useProducts } from "@/hooks/use-products";
import ComodatoFormDialog from "@/components/ComodatoFormDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LINHA_PRODUTO_VALUES, linhaLabel, linhaBadgeClass } from "@/lib/linha-produto";
import { cn } from "@/lib/utils";

const BRL = (v: number | null) => v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Comodatos() {
  const { data: comodatos = [], isLoading } = useComodatos();
  const { data: clients = [] } = useClients();
  const { data: inventory = [] } = useInventory();
  const { data: products = [] } = useProducts();
  const del = useDeleteComodato();

  const [search, setSearch] = useState("");
  const [linha, setLinha] = useState("all");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [edit, setEdit] = useState<Comodato | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const equipMap = useMemo(() => new Map(inventory.map((i) => [i.id, i])), [inventory]);
  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  const filtered = useMemo(() => comodatos.filter((c) => {
    if (linha !== "all" && (c.linha_produto ?? "") !== linha) return false;
    if (status !== "all" && c.status !== status) return false;
    if (search) {
      const client = c.client_id ? clientMap.get(c.client_id) ?? "" : "";
      const equip = c.inventory_item_id ? (equipMap.get(c.inventory_item_id)?.name ?? "") : "";
      const hay = `${c.numero_contrato ?? ""} ${client} ${equip}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [comodatos, linha, status, search, clientMap, equipMap]);

  return (
    <AppLayout
      title="Comodatos"
      subtitle="Contratos de cessão de equipamento a clientes"
      actions={<Button onClick={() => { setEdit(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo Comodato</Button>}
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar contrato, cliente, equipamento..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={linha} onValueChange={setLinha}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Linha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as linhas</SelectItem>
            {LINHA_PRODUTO_VALUES.map((l) => <SelectItem key={l} value={l}>{linhaLabel(l)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="SUSPENSO">Suspenso</SelectItem>
            <SelectItem value="ENCERRADO">Encerrado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Contrato</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Equipamento</TableHead>
              <TableHead>Consumível</TableHead>
              <TableHead>Linha</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Consumo Mín.</TableHead>
              <TableHead>Valor Mensal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Próx. Manutenção</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Nenhum comodato cadastrado.</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.numero_contrato ?? "—"}</TableCell>
                <TableCell>{c.client_id ? (clientMap.get(c.client_id) ?? "—") : "—"}</TableCell>
                <TableCell>{c.inventory_item_id ? (equipMap.get(c.inventory_item_id)?.name ?? "—") : "—"}</TableCell>
                <TableCell>{c.product_id ? (prodMap.get(c.product_id) ?? "—") : "—"}</TableCell>
                <TableCell><span className={cn("px-2 py-0.5 rounded-full text-xs", linhaBadgeClass(c.linha_produto))}>{linhaLabel(c.linha_produto)}</span></TableCell>
                <TableCell>{c.localizacao_interna ?? c.endereco_instalacao ?? "—"}</TableCell>
                <TableCell>{c.consumo_minimo != null ? `${c.consumo_minimo} ${c.unidade_consumo ?? ""}` : "—"}</TableCell>
                <TableCell>{BRL(c.valor_mensal)}</TableCell>
                <TableCell><span className={cn("px-2 py-0.5 rounded-full text-xs", COMODATO_STATUS_BADGE[c.status] ?? COMODATO_STATUS_BADGE.ENCERRADO)}>{c.status}</span></TableCell>
                <TableCell>{c.proxima_manutencao ? new Date(c.proxima_manutencao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEdit(c); setDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteId(c.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ComodatoFormDialog open={dialogOpen} onOpenChange={setDialogOpen} comodato={edit} />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir comodato?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deleteId) await del.mutateAsync(deleteId); setDeleteId(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
