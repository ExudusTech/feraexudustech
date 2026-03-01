import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, ArrowUpDown, Receipt, Wrench, CreditCard } from "lucide-react";

import {
  useFinancialTransactions, useDeleteFinancialTransaction, type FinancialTransaction,
  useOperationalExpenses, useDeleteOperationalExpense, type OperationalExpense,
  useMaintenanceSchedule, useDeleteMaintenance, type MaintenanceItem,
  usePaymentMethods, useDeletePaymentMethod, type PaymentMethod,
} from "@/hooks/use-financeiro";

import TransactionFormDialog from "@/components/financeiro/TransactionFormDialog";
import ExpenseFormDialog from "@/components/financeiro/ExpenseFormDialog";
import MaintenanceFormDialog from "@/components/financeiro/MaintenanceFormDialog";
import PaymentMethodFormDialog from "@/components/financeiro/PaymentMethodFormDialog";

type TabKey = "transacoes" | "despesas" | "manutencao" | "metodos";

const TAB_CONFIG: Record<TabKey, { label: string; icon: React.ElementType; newLabel: string }> = {
  transacoes: { label: "Transações", icon: ArrowUpDown, newLabel: "Nova Transação" },
  despesas: { label: "Despesas", icon: Receipt, newLabel: "Nova Despesa" },
  manutencao: { label: "Manutenção", icon: Wrench, newLabel: "Nova Manutenção" },
  metodos: { label: "Métodos Pgto.", icon: CreditCard, newLabel: "Novo Método" },
};

const BRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const STATUS_V: Record<string, "destructive" | "default" | "secondary"> = { pago: "default", pendente: "secondary", atrasado: "destructive", cancelado: "destructive", concluida: "default", agendada: "secondary" };

export default function Financeiro() {
  const [tab, setTab] = useState<TabKey>("transacoes");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: TabKey; id: string } | null>(null);

  const { data: transactions = [], isLoading: txLoading } = useFinancialTransactions();
  const deleteTx = useDeleteFinancialTransaction();
  const [txDialog, setTxDialog] = useState(false);
  const [selectedTx, setSelectedTx] = useState<FinancialTransaction | null>(null);

  const { data: expenses = [], isLoading: expLoading } = useOperationalExpenses();
  const deleteExp = useDeleteOperationalExpense();
  const [expDialog, setExpDialog] = useState(false);
  const [selectedExp, setSelectedExp] = useState<OperationalExpense | null>(null);

  const { data: maintenance = [], isLoading: mntLoading } = useMaintenanceSchedule();
  const deleteMnt = useDeleteMaintenance();
  const [mntDialog, setMntDialog] = useState(false);
  const [selectedMnt, setSelectedMnt] = useState<MaintenanceItem | null>(null);

  const { data: methods = [], isLoading: mtdLoading } = usePaymentMethods();
  const deleteMtd = useDeletePaymentMethod();
  const [mtdDialog, setMtdDialog] = useState(false);
  const [selectedMtd, setSelectedMtd] = useState<PaymentMethod | null>(null);

  const s = search.toLowerCase();

  const handleNew = () => {
    const actions: Record<TabKey, () => void> = {
      transacoes: () => { setSelectedTx(null); setTxDialog(true); },
      despesas: () => { setSelectedExp(null); setExpDialog(true); },
      manutencao: () => { setSelectedMnt(null); setMntDialog(true); },
      metodos: () => { setSelectedMtd(null); setMtdDialog(true); },
    };
    actions[tab]();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const d: Record<TabKey, (id: string) => void> = {
      transacoes: (id) => deleteTx.mutate(id),
      despesas: (id) => deleteExp.mutate(id),
      manutencao: (id) => deleteMnt.mutate(id),
      metodos: (id) => deleteMtd.mutate(id),
    };
    d[deleteTarget.type](deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <AppLayout
      title="Financeiro"
      subtitle="Transações, despesas e manutenção"
      actions={<Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />{TAB_CONFIG[tab].newLabel}</Button>}
    >
      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setSearch(""); }} className="space-y-4">
        <TabsList>
          {(Object.keys(TAB_CONFIG) as TabKey[]).map((key) => {
            const { label, icon: Icon } = TAB_CONFIG[key];
            return <TabsTrigger key={key} value={key} className="gap-2"><Icon className="h-4 w-4" />{label}</TabsTrigger>;
          })}
        </TabsList>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Transações */}
        <TabsContent value="transacoes">
          <DataTable loading={txLoading} data={transactions.filter((t) => [t.title, t.category, t.reference_number].some((f) => f?.toLowerCase().includes(s)))} icon={<ArrowUpDown className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Título</TableHead><TableHead>Tipo</TableHead><TableHead>Categoria</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {transactions.filter((t) => [t.title, t.category, t.reference_number].some((f) => f?.toLowerCase().includes(s))).map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => { setSelectedTx(t); setTxDialog(true); }}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell><Badge variant={t.transaction_type === "receita" ? "default" : "destructive"}>{t.transaction_type}</Badge></TableCell>
                    <TableCell>{t.category || "—"}</TableCell>
                    <TableCell className={t.transaction_type === "receita" ? "text-emerald-600" : "text-red-600"}>{BRL(t.amount)}</TableCell>
                    <TableCell>{t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell><Badge variant={STATUS_V[t.status] || "secondary"}>{t.status}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedTx(t); setTxDialog(true); }} onDelete={() => setDeleteTarget({ type: "transacoes", id: t.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Despesas */}
        <TabsContent value="despesas">
          <DataTable loading={expLoading} data={expenses.filter((e) => [e.title, e.vendor, e.category].some((f) => f?.toLowerCase().includes(s)))} icon={<Receipt className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Título</TableHead><TableHead>Categoria</TableHead><TableHead>Fornecedor</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead>Recorrência</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {expenses.filter((e) => [e.title, e.vendor, e.category].some((f) => f?.toLowerCase().includes(s))).map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => { setSelectedExp(e); setExpDialog(true); }}>
                    <TableCell className="font-medium">{e.title}</TableCell>
                    <TableCell><Badge variant="secondary">{e.category}</Badge></TableCell>
                    <TableCell>{e.vendor || "—"}</TableCell>
                    <TableCell className="text-red-600">{BRL(e.amount)}</TableCell>
                    <TableCell>{new Date(e.expense_date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{e.recurrence}</TableCell>
                    <TableCell><Badge variant={STATUS_V[e.status] || "secondary"}>{e.status}</Badge></TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedExp(e); setExpDialog(true); }} onDelete={() => setDeleteTarget({ type: "despesas", id: e.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Manutenção */}
        <TabsContent value="manutencao">
          <DataTable loading={mntLoading} data={maintenance.filter((m) => [m.title, m.maintenance_type].some((f) => f?.toLowerCase().includes(s)))} icon={<Wrench className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Título</TableHead><TableHead>Tipo</TableHead><TableHead>Data</TableHead><TableHead>Horário</TableHead><TableHead>Custo Est.</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {maintenance.filter((m) => [m.title, m.maintenance_type].some((f) => f?.toLowerCase().includes(s))).map((m) => (
                  <TableRow key={m.id} className="cursor-pointer" onClick={() => { setSelectedMnt(m); setMntDialog(true); }}>
                    <TableCell className="font-medium">{m.title}</TableCell>
                    <TableCell><Badge variant="secondary">{m.maintenance_type}</Badge></TableCell>
                    <TableCell>{new Date(m.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{m.start_time ? `${m.start_time.slice(0, 5)}${m.end_time ? ` - ${m.end_time.slice(0, 5)}` : ""}` : "—"}</TableCell>
                    <TableCell>{m.estimated_cost ? BRL(m.estimated_cost) : "—"}</TableCell>
                    <TableCell><Badge variant={STATUS_V[m.status] || "secondary"}>{m.status}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedMnt(m); setMntDialog(true); }} onDelete={() => setDeleteTarget({ type: "manutencao", id: m.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Métodos de Pagamento */}
        <TabsContent value="metodos">
          <DataTable loading={mtdLoading} data={methods.filter((m) => [m.name, m.method_type].some((f) => f?.toLowerCase().includes(s)))} icon={<CreditCard className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {methods.filter((m) => [m.name, m.method_type].some((f) => f?.toLowerCase().includes(s))).map((m) => (
                  <TableRow key={m.id} className="cursor-pointer" onClick={() => { setSelectedMtd(m); setMtdDialog(true); }}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell><Badge variant="secondary">{m.method_type}</Badge></TableCell>
                    <TableCell><Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedMtd(m); setMtdDialog(true); }} onDelete={() => setDeleteTarget({ type: "metodos", id: m.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>
      </Tabs>

      <TransactionFormDialog open={txDialog} onOpenChange={setTxDialog} transaction={selectedTx} />
      <ExpenseFormDialog open={expDialog} onOpenChange={setExpDialog} expense={selectedExp} />
      <MaintenanceFormDialog open={mntDialog} onOpenChange={setMntDialog} item={selectedMnt} />
      <PaymentMethodFormDialog open={mtdDialog} onOpenChange={setMtdDialog} method={selectedMtd} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function DataTable({ loading, data, icon, search, onAdd, children }: {
  loading: boolean; data: unknown[]; icon: React.ReactNode; search: string; onAdd: () => void; children: React.ReactNode;
}) {
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (data.length === 0) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <div className="text-center space-y-2">
        <div className="mx-auto text-muted-foreground/40 flex items-center justify-center">{icon}</div>
        <p>{search ? "Nenhum resultado encontrado." : "Nenhum registro cadastrado."}</p>
        {!search && <Button variant="outline" onClick={onAdd}>Adicionar primeiro</Button>}
      </div>
    </div>
  );
  return <div className="rounded-lg border bg-card">{children}</div>;
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
