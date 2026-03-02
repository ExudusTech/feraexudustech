import { useMemo } from "react";
import StatsCard from "@/components/cards/StatsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, FileText, DollarSign, ClipboardCheck, MapPin, AlertTriangle, CheckCircle, Clock, TrendingUp, Package } from "lucide-react";
import type { EkkoaInstallation } from "@/hooks/use-ekkoa-installations";
import type { EkkoaContract } from "@/hooks/use-ekkoa-contracts";
import type { EkkoaBilling } from "@/hooks/use-ekkoa-billing";
import type { EkkoaTechnicalVisit } from "@/hooks/use-ekkoa-technical-visits";
import type { EkkoaEquipment } from "@/hooks/use-ekkoa-equipment";
import type { EkkoaCoverageArea } from "@/hooks/use-ekkoa-coverage-areas";
import type { Operation } from "@/hooks/use-operations";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--secondary))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

interface Props {
  installations: EkkoaInstallation[];
  contracts: EkkoaContract[];
  billing: EkkoaBilling[];
  technicalVisits: EkkoaTechnicalVisit[];
  equipment: EkkoaEquipment[];
  coverageAreas: EkkoaCoverageArea[];
  operations: Operation[];
}

export default function EkkoaDashboard({ installations, contracts, billing, technicalVisits, equipment, coverageAreas, operations }: Props) {
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const todayStr = now.toISOString().split("T")[0];

    // Installations
    const activeInstallations = installations.filter(i => ["em_andamento", "planejada"].includes(i.status)).length;
    const testingInstallations = installations.filter(i => i.status === "em_teste").length;
    const completedInstallations = installations.filter(i => i.status === "concluida").length;

    // Expiring tests
    const threeDays = new Date();
    threeDays.setDate(threeDays.getDate() + 3);
    const threeDaysStr = threeDays.toISOString().split("T")[0];
    const expiringTests = installations.filter(i =>
      i.status === "em_teste" && i.end_date && i.end_date <= threeDaysStr && i.end_date >= todayStr
    ).length;

    // Contracts
    const activeContracts = contracts.filter(c => c.status === "ativo").length;
    const totalContractValue = contracts.filter(c => c.status === "ativo").reduce((s, c) => s + Number(c.total_value), 0);
    const monthlyRecurring = contracts.filter(c => c.status === "ativo").reduce((s, c) => s + Number(c.monthly_value || 0), 0);

    // Billing
    const pendingBilling = billing.filter(b => b.status === "pendente").length;
    const overdueBilling = billing.filter(b => b.status === "atrasado" || (b.status === "pendente" && b.due_date && b.due_date < todayStr)).length;
    const monthRevenue = billing.filter(b => b.status === "pago" && b.payment_date && b.payment_date >= monthStart).reduce((s, b) => s + Number(b.amount), 0);
    const pendingAmount = billing.filter(b => b.status === "pendente").reduce((s, b) => s + Number(b.amount), 0);

    // Technical visits
    const scheduledVisits = technicalVisits.filter(v => v.status === "agendada").length;
    const completedVisitsMonth = technicalVisits.filter(v => v.status === "concluida" && v.created_at >= monthStart).length;

    // Equipment
    const availableEquipment = equipment.filter(e => e.status === "disponivel").length;
    const inUseEquipment = equipment.filter(e => e.status === "em_uso").length;

    // Coverage
    const activeCoverage = coverageAreas.filter(a => a.is_active).length;

    // Operations
    const pendingOps = operations.filter(o => o.status === "pendente").length;
    const urgentOps = operations.filter(o => o.priority === "urgente" && o.status !== "concluida" && o.status !== "cancelada").length;

    // Installation status distribution
    const installStatusMap: Record<string, number> = {};
    installations.forEach(i => { installStatusMap[i.status] = (installStatusMap[i.status] || 0) + 1; });
    const installStatusData = Object.entries(installStatusMap).map(([name, value]) => ({ name, value }));

    // Monthly billing (last 6 months)
    const billingByMonth: Record<string, { received: number; pending: number }> = {};
    for (let m = 5; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      billingByMonth[key] = { received: 0, pending: 0 };
    }
    billing.forEach(b => {
      const date = b.payment_date || b.due_date || b.created_at;
      if (!date) return;
      const d = new Date(date);
      const key = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      if (billingByMonth[key]) {
        if (b.status === "pago") billingByMonth[key].received += Number(b.amount);
        else billingByMonth[key].pending += Number(b.amount);
      }
    });
    const billingChartData = Object.entries(billingByMonth).map(([month, vals]) => ({ month, ...vals }));

    return {
      activeInstallations, testingInstallations, completedInstallations, expiringTests,
      activeContracts, totalContractValue, monthlyRecurring,
      pendingBilling, overdueBilling, monthRevenue, pendingAmount,
      scheduledVisits, completedVisitsMonth,
      availableEquipment, inUseEquipment,
      activeCoverage, pendingOps, urgentOps,
      installStatusData, billingChartData,
    };
  }, [installations, contracts, billing, technicalVisits, equipment, coverageAreas, operations]);

  const statusLabels: Record<string, string> = {
    planejada: "Planejada", em_andamento: "Em andamento", concluida: "Concluída",
    cancelada: "Cancelada", em_teste: "Em teste", teste_expirado: "Teste expirado",
  };

  return (
    <div className="space-y-6">
      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Instalações Ativas" value={stats.activeInstallations} icon={Zap} variant="primary" />
        <StatsCard title="Em Teste" value={stats.testingInstallations} icon={Clock} variant="accent"
          description={stats.expiringTests > 0 ? `${stats.expiringTests} expirando em breve` : undefined} />
        <StatsCard title="Contratos Ativos" value={stats.activeContracts} icon={FileText} variant="success" />
        <StatsCard title="Receita Mensal Recorrente" value={BRL(stats.monthlyRecurring)} icon={TrendingUp} variant="success" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Faturamento do Mês" value={BRL(stats.monthRevenue)} icon={DollarSign} variant="primary" />
        <StatsCard title="A Receber" value={BRL(stats.pendingAmount)} icon={DollarSign} variant="warning"
          description={stats.overdueBilling > 0 ? `${stats.overdueBilling} em atraso` : undefined} />
        <StatsCard title="Visitas Agendadas" value={stats.scheduledVisits} icon={ClipboardCheck} variant="accent" />
        <StatsCard title="Áreas de Cobertura" value={stats.activeCoverage} icon={MapPin} variant="secondary" />
      </div>

      {/* Alerts */}
      {(stats.expiringTests > 0 || stats.urgentOps > 0 || stats.overdueBilling > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.expiringTests > 0 && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-medium">{stats.expiringTests} teste(s) expirando</p>
                  <p className="text-xs text-muted-foreground">Necessário coletar feedback</p>
                </div>
              </CardContent>
            </Card>
          )}
          {stats.urgentOps > 0 && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-medium">{stats.urgentOps} operação(ões) urgente(s)</p>
                  <p className="text-xs text-muted-foreground">Pendente de resolução</p>
                </div>
              </CardContent>
            </Card>
          )}
          {stats.overdueBilling > 0 && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-medium">{stats.overdueBilling} fatura(s) em atraso</p>
                  <p className="text-xs text-muted-foreground">Ação de cobrança necessária</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Installation Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-primary" />
              Status das Instalações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.installStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={stats.installStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                    paddingAngle={3} dataKey="value" nameKey="name"
                    label={({ name, value }) => `${statusLabels[name] || name}: ${value}`}>
                    {stats.installStatusData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [value, statusLabels[name] || name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                Nenhuma instalação cadastrada.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-primary" />
              Faturamento (6 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.billingChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => BRL(v)} />
                <Bar dataKey="received" name="Recebido" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name="Pendente" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Equipamentos Disponíveis" value={stats.availableEquipment} icon={Package} variant="secondary"
          description={`${stats.inUseEquipment} em uso`} />
        <StatsCard title="Instalações Concluídas" value={stats.completedInstallations} icon={CheckCircle} variant="success" />
        <StatsCard title="Visitas no Mês" value={stats.completedVisitsMonth} icon={ClipboardCheck} variant="primary" />
        <StatsCard title="Valor Total Contratos" value={BRL(stats.totalContractValue)} icon={FileText} variant="accent" />
      </div>
    </div>
  );
}
