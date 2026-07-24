import { useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { useInventory, useDeleteInventoryItem, type InventoryItem } from "@/hooks/use-inventory";
import { useClients } from "@/hooks/use-clients";
import InventoryFormDialog from "@/components/ekkoa/InventoryFormDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LINHA_PRODUTO_VALUES, linhaLabel, linhaBadgeClass } from "@/lib/linha-produto";
import { cn } from "@/lib/utils";

export default function Equipamentos() {
  const { data: items = [], isLoading } = useInventory();
  const { data: clients = [] } = useClients();
  const deleteItem = useDeleteInventoryItem();

  const [search, setSearch] = useState("");
  const [linha, setLinha] = useState("all");
  const [status, setStatus] = useState("all");
  const [comodato, setComodato] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [edit, setEdit] = useState<InventoryItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    return items
      .filter((i) => (i.item_type ?? "EQUIPAMENTO") === "EQUIPAMENTO")
      .filter((i) => {
        if (linha !== "all" && (i.linha_produto ?? "") !== linha) return false;
        if (status !== "all" && i.status !== status) return false;
        if (comodato === "yes" && !i.em_comodato) return false;
        if (comodato === "no" && i.em_comodato) return false;
        if (search && !`${i.name} ${i.serial_number ?? ""} ${i.sku ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });
  }, [items, linha, status, comodato, search]);

  return (
    <AppLayout
      title="Equipamentos"
      subtitle="Todos os equipamentos operacionais, independente da linha"
      actions={<Button onClick={() => { setEdit(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo Equipamento</Button>}
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, série, SKU..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={linha} onValueChange={setLinha}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Linha de produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as linhas</SelectItem>
            {LINHA_PRODUTO_VALUES.map((l) => <SelectItem key={l} value={l}>{linhaLabel(l)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Disponível</SelectItem>
            <SelectItem value="em_teste">Em Teste</SelectItem>
            <SelectItem value="instalado">Instalado</SelectItem>
            <SelectItem value="manutencao">Em Manutenção</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={comodato} onValueChange={setComodato}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Comodato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="yes">Em comodato</SelectItem>
            <SelectItem value="no">Livres</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Linha</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Nº Série</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Próx. Manutenção</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum equipamento encontrado.</TableCell></TableRow>
            ) : filtered.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.name}</TableCell>
                <TableCell><span className={cn("px-2 py-0.5 rounded-full text-xs", linhaBadgeClass(i.linha_produto))}>{linhaLabel(i.linha_produto)}</span></TableCell>
                <TableCell>{i.category ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{i.serial_number ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{i.status}</Badge></TableCell>
                <TableCell>{i.em_comodato && i.client_id ? (clientMap.get(i.client_id) ?? "—") : "—"}</TableCell>
                <TableCell>{i.localizacao_interna ?? i.location ?? "—"}</TableCell>
                <TableCell>{i.proxima_manutencao ? new Date(i.proxima_manutencao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEdit(i); setDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteId(i.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <InventoryFormDialog open={dialogOpen} onOpenChange={setDialogOpen} item={edit} defaultItemType="EQUIPAMENTO" />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir equipamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deleteId) await deleteItem.mutateAsync(deleteId); setDeleteId(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
