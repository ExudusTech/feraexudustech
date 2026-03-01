import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, Wrench, CalendarDays, Package, AlertTriangle } from "lucide-react";

import { useOperations, useDeleteOperation, STATUS_CONFIG, type Operation } from "@/hooks/use-operations";
import { useSchedules, useDeleteSchedule, type Schedule } from "@/hooks/use-schedules";
import { useInventory, useDeleteInventoryItem, type InventoryItem } from "@/hooks/use-inventory";
import OperationFormDialog from "@/components/ekkoa/OperationFormDialog";
import ScheduleFormDialog from "@/components/ekkoa/ScheduleFormDialog";
import InventoryFormDialog from "@/components/ekkoa/InventoryFormDialog";

export default function Ekkoa() {
  const [tab, setTab] = useState("operacoes");
  const [search, setSearch] = useState("");

  const { data: operations = [], isLoading: opsLoading } = useOperations();
  const deleteOp = useDeleteOperation();
  const [opDialog, setOpDialog] = useState(false);
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [deleteOpId, setDeleteOpId] = useState<string | null>(null);

  const { data: schedules = [], isLoading: schLoading } = useSchedules();
  const deleteSch = useDeleteSchedule();
  const [schDialog, setSchDialog] = useState(false);
  const [selectedSch, setSelectedSch] = useState<Schedule | null>(null);
  const [deleteSchId, setDeleteSchId] = useState<string | null>(null);

  const { data: inventory = [], isLoading: invLoading } = useInventory();
  const deleteInv = useDeleteInventoryItem();
  const [invDialog, setInvDialog] = useState(false);
  const [selectedInv, setSelectedInv] = useState<InventoryItem | null>(null);
  const [deleteInvId, setDeleteInvId] = useState<string | null>(null);

  const filteredOps = operations.filter((o) => [o.title, o.location].some((f) => f?.toLowerCase().includes(search.toLowerCase())));
  const filteredSch = schedules.filter((s) => [s.title, s.location].some((f) => f?.toLowerCase().includes(search.toLowerCase())));
  const filteredInv = inventory.filter((i) => [i.name, i.sku, i.category].some((f) => f?.toLowerCase().includes(search.toLowerCase())));

  const handleNewClick = () => {
    if (tab === "operacoes") { setSelectedOp(null); setOpDialog(true); }
    else if (tab === "agendamentos") { setSelectedSch(null); setSchDialog(true); }
    else { setSelectedInv(null); setInvDialog(true); }
  };

  const buttonLabel = tab === "operacoes" ? "Nova Operação" : tab === "agendamentos" ? "Novo Agendamento" : "Novo Item";

  return (
    <AppLayout
      title="Ekkoa"
      subtitle="Operações, Agendamentos e Inventário"
      actions={<Button onClick={handleNewClick}><Plus className="h-4 w-4 mr-2" />{buttonLabel}</Button>}
    >
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSearch(""); }} className="space-y-4">
        <TabsList>
          <TabsTrigger value="operacoes" className="gap-2"><Wrench className="h-4 w-4" />Operações</TabsTrigger>
          <TabsTrigger value="agendamentos" className="gap-2"><CalendarDays className="h-4 w-4" />Agendamentos</TabsTrigger>
          <TabsTrigger value="inventario" className="gap-2"><Package className="h-4 w-4" />Inventário</TabsTrigger>
        </TabsList>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <TabsContent value="operacoes">
          {opsLoading ? <LoadingState /> : filteredOps.length === 0 ? (
            <EmptyState icon={<Wrench className="h-12 w-12" />} msg={search ? "Nenhuma operação encontrada." : "Nenhuma operação cadastrada."} onAdd={!search ? () => { setSelectedOp(null); setOpDialog(true); } : undefined} />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead><TableHead>Status</TableHead><TableHead>Prioridade</TableHead>
                    <TableHead>Local</TableHead><TableHead>Início</TableHead><TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOps.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => { setSelectedOp(o); setOpDialog(true); }}>
                      <TableCell className="font-medium">{o.title}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${STATUS_CONFIG[o.status].color}`} />
                          {STATUS_CONFIG[o.status].label}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={o.priority === "alta" || o.priority === "urgente" ? "destructive" : o.priority === "media" ? "default" : "secondary"}>{o.priority.charAt(0).toUpperCase() + o.priority.slice(1)}</Badge></TableCell>
                      <TableCell>{o.location || "—"}</TableCell>
                      <TableCell>{o.start_date ? new Date(o.start_date).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ActionMenu onEdit={() => { setSelectedOp(o); setOpDialog(true); }} onDelete={() => setDeleteOpId(o.id)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="agendamentos">
          {schLoading ? <LoadingState /> : filteredSch.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-12 w-12" />} msg={search ? "Nenhum agendamento encontrado." : "Nenhum agendamento cadastrado."} onAdd={!search ? () => { setSelectedSch(null); setSchDialog(true); } : undefined} />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead><TableHead>Data</TableHead><TableHead>Horário</TableHead>
                    <TableHead>Status</TableHead><TableHead>Local</TableHead><TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSch.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => { setSelectedSch(s); setSchDialog(true); }}>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell>{new Date(s.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{s.start_time ? `${s.start_time.slice(0, 5)}${s.end_time ? ` - ${s.end_time.slice(0, 5)}` : ""}` : "—"}</TableCell>
                      <TableCell><Badge variant={s.status === "cancelado" ? "destructive" : s.status === "realizado" ? "default" : "secondary"}>{s.status.charAt(0).toUpperCase() + s.status.slice(1)}</Badge></TableCell>
                      <TableCell>{s.location || "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ActionMenu onEdit={() => { setSelectedSch(s); setSchDialog(true); }} onDelete={() => setDeleteSchId(s.id)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="inventario">
          {invLoading ? <LoadingState /> : filteredInv.length === 0 ? (
            <EmptyState icon={<Package className="h-12 w-12" />} msg={search ? "Nenhum item encontrado." : "Nenhum item no inventário."} onAdd={!search ? () => { setSelectedInv(null); setInvDialog(true); } : undefined} />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead><TableHead>SKU</TableHead><TableHead>Categoria</TableHead>
                    <TableHead>Qtd.</TableHead><TableHead>Custo Unit.</TableHead><TableHead>Alerta</TableHead><TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInv.map((i) => (
                    <TableRow key={i.id} className="cursor-pointer" onClick={() => { setSelectedInv(i); setInvDialog(true); }}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-muted-foreground">{i.sku || "—"}</TableCell>
                      <TableCell>{i.category || "—"}</TableCell>
                      <TableCell>{i.quantity} {i.unit}</TableCell>
                      <TableCell>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(i.unit_cost)}</TableCell>
                      <TableCell>
                        {i.quantity <= i.min_quantity && i.min_quantity > 0 ? (
                          <div className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" /><span className="text-xs">Baixo</span></div>
                        ) : <span className="text-xs text-muted-foreground">OK</span>}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ActionMenu onEdit={() => { setSelectedInv(i); setInvDialog(true); }} onDelete={() => setDeleteInvId(i.id)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <OperationFormDialog open={opDialog} onOpenChange={setOpDialog} operation={selectedOp} />
      <ScheduleFormDialog open={schDialog} onOpenChange={setSchDialog} schedule={selectedSch} />
      <InventoryFormDialog open={invDialog} onOpenChange={setInvDialog} item={selectedInv} />

      <DeleteConfirmDialog open={!!deleteOpId} onCancel={() => setDeleteOpId(null)} onConfirm={() => { if (deleteOpId) deleteOp.mutate(deleteOpId); setDeleteOpId(null); }} />
      <DeleteConfirmDialog open={!!deleteSchId} onCancel={() => setDeleteSchId(null)} onConfirm={() => { if (deleteSchId) deleteSch.mutate(deleteSchId); setDeleteSchId(null); }} />
      <DeleteConfirmDialog open={!!deleteInvId} onCancel={() => setDeleteInvId(null)} onConfirm={() => { if (deleteInvId) deleteInv.mutate(deleteInvId); setDeleteInvId(null); }} />
    </AppLayout>
  );
}

function LoadingState() {
  return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
}

function EmptyState({ icon, msg, onAdd }: { icon: React.ReactNode; msg: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <div className="text-center space-y-2">
        <div className="mx-auto text-muted-foreground/40 flex items-center justify-center">{icon}</div>
        <p>{msg}</p>
        {onAdd && <Button variant="outline" onClick={onAdd}>Adicionar primeiro</Button>}
      </div>
    </div>
  );
}

function ActionMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteConfirmDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
