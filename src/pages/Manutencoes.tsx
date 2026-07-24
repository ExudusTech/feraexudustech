import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, ExternalLink } from "lucide-react";
import { useMaintenanceSchedule, useDeleteMaintenance, type MaintenanceItem } from "@/hooks/use-financeiro";
import { useInventory } from "@/hooks/use-inventory";
import { useComodatos } from "@/hooks/use-comodatos";
import MaintenanceFormDialog from "@/components/financeiro/MaintenanceFormDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LINHA_PRODUTO_VALUES, linhaLabel, linhaBadgeClass } from "@/lib/linha-produto";
import { cn } from "@/lib/utils";

export default function Manutencoes() {
  const { data: items = [], isLoading } = useMaintenanceSchedule();
  const { data: inventory = [] } = useInventory();
  const { data: comodatos = [] } = useComodatos();
  const del = useDeleteMaintenance();

  const [search, setSearch] = useState("");
  const [linha, setLinha] = useState("all");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [edit, setEdit] = useState<MaintenanceItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invMap = useMemo(() => new Map(inventory.map((i) => [i.id, i.name])), [inventory]);
  const comMap = useMemo(() => new Map(comodatos.map((c) => [c.id, c.numero_contrato ?? c.id.slice(0, 8)])), [comodatos]);

  const filtered = useMemo(() => items.filter((m) => {
    if (linha !== "all" && (m.linha_produto ?? "") !== linha) return false;
    if (status !== "all" && m.status !== status) return false;
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, linha, status, search]);

  return (
    <AppLayout
      title="Manutenções"
      subtitle="Manutenções programadas para todas as linhas de produto"
      actions={<Button onClick={() => { setEdit(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova Manutenção</Button>}
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por título..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            <SelectItem value="agendada">Agendada</SelectItem>
            <SelectItem value="em_andamento">Em Andamento</SelectItem>
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Linha</TableHead>
              <TableHead>Equipamento</TableHead>
              <TableHead>Comodato</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma manutenção encontrada.</TableCell></TableRow>
            ) : filtered.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.title}</TableCell>
                <TableCell>{m.maintenance_type}</TableCell>
                <TableCell><span className={cn("px-2 py-0.5 rounded-full text-xs", linhaBadgeClass(m.linha_produto))}>{linhaLabel(m.linha_produto)}</span></TableCell>
                <TableCell>{m.inventory_item_id ? (invMap.get(m.inventory_item_id) ?? "—") : "—"}</TableCell>
                <TableCell>
                  {m.comodato_id ? (
                    <Link to="/comodatos" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {comMap.get(m.comodato_id) ?? "ver"}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : "—"}
                </TableCell>
                <TableCell>{new Date(m.scheduled_date).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell><Badge variant="outline">{m.status}</Badge></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEdit(m); setDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteId(m.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <MaintenanceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} item={edit} />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir manutenção?</AlertDialogTitle>
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
