import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import StatsCard from "@/components/cards/StatsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Target, FileText, DollarSign, TrendingUp, Package, CheckCircle, Clock, HeadphonesIcon, Zap, Handshake, AlertTriangle } from "lucide-react";
import { useClients } from "@/hooks/use-clients";
import { useLeads } from "@/hooks/use-leads";
import { useProposals } from "@/hooks/use-proposals";
import { useFinancialTransactions, useOperationalExpenses } from "@/hooks/use-financeiro";
import { useComodatos } from "@/hooks/use-comodatos";
import { useMaintenanceSchedule } from "@/hooks/use-financeiro";
import { useSupportTickets } from "@/hooks/use-support";
import { useProducts } from "@/hooks/use-products";
import { useMemo } from "react";
import RevenueExpenseChart from "@/components/charts/RevenueExpenseChart";
import ProfitEvolutionChart from "@/components/charts/ProfitEvolutionChart";
import LeadsPipelineChart from "@/components/charts/LeadsPipelineChart";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import ConsultantDashboard from "@/components/dashboard/ConsultantDashboard";
import StartVisitDialog from "@/components/ekkoa/StartVisitDialog";
import type { Schedule } from "@/hooks/use-schedules";

export default function Dashboard() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const [visitSchedule, setVisitSchedule] = useState<Schedule | null>(null);

  // Role-specific dashboards
  if (role === "consultor_tecnico") {
    return (
      <AppLayout title="Dashboard" subtitle="Sua agenda e compromissos">
        <ConsultantDashboard onStartVisit={(s) => setVisitSchedule(s)} />
        <StartVisitDialog
          open={!!visitSchedule}
          onOpenChange={(open) => !open && setVisitSchedule(null)}
          schedule={visitSchedule}
        />
      </AppLayout>
    );
  }

  // Default dashboard for admin/gestor/vendedor etc.
  return <AdminDashboard />;
}

function AdminDashboard() {
  const { data: clients } = useClients();
  const { data: leads } = useLeads();
  const { data: proposals } = useProposals();
  const { data: transactions } = useFinancialTransactions();
  const { data: expenses } = useOperationalExpenses();
  const { data: comodatos } = useComodatos();
  const { data: workOrders } = useMaintenanceSchedule();
  const { permissions } = usePermissions();
  const { data: tickets } = useSupportTickets();
  const { data: products } = useProducts();

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const totalClients = clients?.length ?? 0;
    const activeLeads = leads?.filter(l => !["fechado_ganho", "fechado_perdido"].includes(l.stage))?.length ?? 0;
    const openProposals = proposals?.filter(p => p.status === "rascunho" || p.status === "enviada")?.length ?? 0;

    const monthRevenue = transactions
      ?.filter(t => t.transaction_type === "receita" && t.created_at >= monthStart)
      ?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;

    const monthExpenses = expenses
      ?.filter(e => e.created_at >= monthStart)
      ?.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0;

    const activeComodatos = comodatos?.filter(c => c.status === "ATIVO") ?? [];
    const activeInstallations = activeComodatos.length;
    const loanMrr = activeComodatos.reduce((sum, c) => sum + Number(c.valor_mensal ?? 0), 0);
    const openOrders = workOrders?.filter(o => !["concluida", "cancelada"].includes(o.status)) ?? [];
    const in2Days = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    const expiringTests = openOrders.filter(o => o.tipo_os === "teste" && o.scheduled_date <= in2Days).length;
    const openTickets = tickets?.filter(t => t.status !== "fechado" && t.status !== "resolvido")?.length ?? 0;
    const totalProducts = products?.length ?? 0;
    const activeOperations = openOrders.length;

    const wonLeads = leads?.filter(l => l.stage === "fechado_ganho")?.length ?? 0;
    const totalLeadsCount = leads?.length ?? 1;
    const conversionRate = totalLeadsCount > 0 ? Math.round((wonLeads / totalLeadsCount) * 100) : 0;

    const paidTransactions = transactions?.filter(t => t.status === "pago") ?? [];
    const avgTicket = paidTransactions.length > 0
      ? paidTransactions.reduce((sum, t) => sum + Number(t.amount), 0) / paidTransactions.length
      : 0;

    return {
      totalClients, activeLeads, openProposals, monthRevenue, monthExpenses,
      activeInstallations, loanMrr, expiringTests, openTickets, totalProducts,
      activeOperations, conversionRate, avgTicket,
    };
  }, [clients, leads, proposals, transactions, expenses, comodatos, workOrders, tickets, products]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <AppLayout title="Dashboard" subtitle="Visão geral do sistema">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Total de Clientes" value={stats.totalClients} icon={Users} variant="primary" />
          <StatsCard title="Leads Ativos" value={stats.activeLeads} icon={Target} variant="accent" />
          <StatsCard title="Propostas Abertas" value={stats.openProposals} icon={FileText} variant="warning" />
          <StatsCard title="Receita do Mês" value={fmt(stats.monthRevenue)} icon={DollarSign} variant="success" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Despesas do Mês" value={fmt(stats.monthExpenses)} icon={DollarSign} variant="warning" />
          <StatsCard title="Comodatos Ativos" value={stats.activeInstallations} icon={Handshake} variant="primary" />
          <StatsCard title="Testes vencendo (2 dias)" value={stats.expiringTests} icon={AlertTriangle} variant="accent" />
          <StatsCard title="Tickets Abertos" value={stats.openTickets} icon={HeadphonesIcon} variant="secondary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RevenueExpenseChart transactions={transactions} expenses={expenses} />
          <ProfitEvolutionChart transactions={transactions} expenses={expenses} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LeadsPipelineChart leads={leads} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" />
                Tarefas Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                Nenhuma tarefa pendente.
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard title="Produtos" value={stats.totalProducts} icon={Package} variant="secondary" />
          <StatsCard title="Ordens de serviço abertas" value={stats.activeOperations} icon={CheckCircle} variant="primary" />
          {permissions.canAccessFinanceiro && <StatsCard title="Receita mensal de comodatos" value={fmt(stats.loanMrr)} icon={Zap} variant="success" />}
          <StatsCard title="Conversão" value={`${stats.conversionRate}%`} icon={TrendingUp} variant="accent" />
          <StatsCard title="Ticket Médio" value={fmt(stats.avgTicket)} icon={DollarSign} variant="success" />
        </div>
      </div>
    </AppLayout>
  );
}
