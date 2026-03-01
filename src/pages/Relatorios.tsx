import { useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText, Download, Users, DollarSign, Briefcase, Search } from "lucide-react";
import { useClients } from "@/hooks/use-clients";
import { useFinancialTransactions, useOperationalExpenses } from "@/hooks/use-financeiro";
import { useOperations } from "@/hooks/use-operations";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { format } from "date-fns";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; }
}

export default function Relatorios() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const { data: clients = [] } = useClients();
  const { data: transactions = [] } = useFinancialTransactions();
  const { data: expenses = [] } = useOperationalExpenses();
  const { data: operations = [] } = useOperations();

  // --- Clients ---
  const filteredClients = useMemo(() => {
    let list = clients;
    if (search) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== "todos") list = list.filter(c => c.status === statusFilter);
    return list;
  }, [clients, search, statusFilter]);

  const exportClients = (type: "excel" | "pdf") => {
    const rows = filteredClients.map(c => ({
      Nome: c.name, Email: c.email || "", Telefone: c.phone || "", Empresa: c.company || "",
      Cidade: c.city || "", Estado: c.state || "", Status: c.status, "Criado em": formatDate(c.created_at),
    }));
    if (type === "excel") return exportToExcel(rows, "relatorio-clientes");
    exportToPDF("Relatório de Clientes", Object.keys(rows[0] || {}), rows.map(r => Object.values(r)) as any, "relatorio-clientes");
  };

  // --- Financeiro ---
  const allFinancial = useMemo(() => {
    const txs = transactions.map(t => ({ ...t, _source: "Transação" as const }));
    const exps = expenses.map(e => ({
      id: e.id, title: e.title, description: e.description, amount: e.amount,
      category: e.category, status: e.status, due_date: e.due_date,
      payment_date: e.payment_date ? String(e.payment_date) : null,
      created_at: e.created_at, transaction_type: "despesa", _source: "Despesa Operacional" as const,
    }));
    let list = [...txs, ...exps];
    if (search) list = list.filter(i => i.title.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== "todos") list = list.filter(i => i.status === statusFilter);
    return list;
  }, [transactions, expenses, search, statusFilter]);

  const financialSummary = useMemo(() => {
    const receitas = allFinancial.filter(f => f.transaction_type === "receita").reduce((s, f) => s + f.amount, 0);
    const despesas = allFinancial.filter(f => f.transaction_type !== "receita").reduce((s, f) => s + f.amount, 0);
    return { receitas, despesas, saldo: receitas - despesas };
  }, [allFinancial]);

  const exportFinancial = (type: "excel" | "pdf") => {
    const rows = allFinancial.map(f => ({
      Título: f.title, Tipo: f.transaction_type, Categoria: f.category || "", Valor: f.amount,
      Status: f.status, Vencimento: formatDate(f.due_date || null), Pagamento: formatDate(f.payment_date || null),
      Origem: f._source,
    }));
    if (type === "excel") return exportToExcel(rows, "relatorio-financeiro");
    exportToPDF("Relatório Financeiro", Object.keys(rows[0] || {}), rows.map(r => Object.values(r)) as any, "relatorio-financeiro");
  };

  // --- Operações ---
  const filteredOps = useMemo(() => {
    let list = operations;
    if (search) list = list.filter(o => o.title.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== "todos") list = list.filter(o => o.status === statusFilter);
    return list;
  }, [operations, search, statusFilter]);

  const exportOperations = (type: "excel" | "pdf") => {
    const rows = filteredOps.map(o => ({
      Título: o.title, Status: o.status, Prioridade: o.priority, Local: o.location || "",
      Início: formatDate(o.start_date), Fim: formatDate(o.end_date), "Criado em": formatDate(o.created_at),
    }));
    if (type === "excel") return exportToExcel(rows, "relatorio-operacoes");
    exportToPDF("Relatório de Operações", Object.keys(rows[0] || {}), rows.map(r => Object.values(r)) as any, "relatorio-operacoes");
  };

  return (
    <AppLayout title="Relatórios" subtitle="Análises e exportação de dados">
      <Tabs defaultValue="clientes" onValueChange={() => { setSearch(""); setStatusFilter("todos"); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="clientes"><Users className="h-4 w-4 mr-1" /> Clientes</TabsTrigger>
          <TabsTrigger value="financeiro"><DollarSign className="h-4 w-4 mr-1" /> Financeiro</TabsTrigger>
          <TabsTrigger value="operacoes"><Briefcase className="h-4 w-4 mr-1" /> Operações</TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* CLIENTES */}
        <TabsContent value="clientes">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">{filteredClients.length} cliente(s) encontrado(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportClients("excel")} disabled={!filteredClients.length}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportClients("pdf")} disabled={!filteredClients.length}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Telefone</TableHead>
                    <TableHead>Empresa</TableHead><TableHead>Cidade</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>
                  ) : filteredClients.slice(0, 50).map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                      <TableCell>{c.phone || "—"}</TableCell>
                      <TableCell>{c.company || "—"}</TableCell>
                      <TableCell>{c.city || "—"}</TableCell>
                      <TableCell>{c.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FINANCEIRO */}
        <TabsContent value="financeiro">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Receitas</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-emerald-600">{formatCurrency(financialSummary.receitas)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Despesas</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-red-500">{formatCurrency(financialSummary.despesas)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saldo</CardTitle></CardHeader>
              <CardContent><p className={`text-2xl font-bold ${financialSummary.saldo >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(financialSummary.saldo)}</p></CardContent></Card>
          </div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">{allFinancial.length} registro(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportFinancial("excel")} disabled={!allFinancial.length}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportFinancial("pdf")} disabled={!allFinancial.length}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead><TableHead>Tipo</TableHead><TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead>Vencimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allFinancial.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
                  ) : allFinancial.slice(0, 50).map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.title}</TableCell>
                      <TableCell>{f.transaction_type}</TableCell>
                      <TableCell>{f.category || "—"}</TableCell>
                      <TableCell className={`text-right font-medium ${f.transaction_type === "receita" ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(f.amount)}</TableCell>
                      <TableCell>{f.status}</TableCell>
                      <TableCell>{formatDate(f.due_date || null)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OPERAÇÕES */}
        <TabsContent value="operacoes">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">{filteredOps.length} operação(ões)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportOperations("excel")} disabled={!filteredOps.length}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportOperations("pdf")} disabled={!filteredOps.length}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead><TableHead>Status</TableHead><TableHead>Prioridade</TableHead>
                    <TableHead>Local</TableHead><TableHead>Início</TableHead><TableHead>Fim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOps.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma operação encontrada</TableCell></TableRow>
                  ) : filteredOps.slice(0, 50).map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.title}</TableCell>
                      <TableCell>{o.status}</TableCell>
                      <TableCell>{o.priority}</TableCell>
                      <TableCell>{o.location || "—"}</TableCell>
                      <TableCell>{formatDate(o.start_date)}</TableCell>
                      <TableCell>{formatDate(o.end_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
