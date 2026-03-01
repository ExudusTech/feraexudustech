import AppLayout from "@/components/layout/AppLayout";
import StatsCard from "@/components/cards/StatsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Target, FileText, DollarSign, TrendingUp, Package, CheckCircle, Clock } from "lucide-react";

export default function Dashboard() {
  return (
    <AppLayout title="Dashboard" subtitle="Visão geral do sistema">
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total de Clientes"
            value="0"
            icon={Users}
            variant="primary"
            trend={{ value: 0, label: "este mês" }}
          />
          <StatsCard
            title="Leads Ativos"
            value="0"
            icon={Target}
            variant="accent"
            trend={{ value: 0, label: "esta semana" }}
          />
          <StatsCard
            title="Propostas Abertas"
            value="0"
            icon={FileText}
            variant="warning"
          />
          <StatsCard
            title="Receita do Mês"
            value="R$ 0"
            icon={DollarSign}
            variant="success"
            trend={{ value: 0, label: "vs. último mês" }}
          />
        </div>

        {/* Additional cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                Atividades Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Nenhuma atividade registrada ainda.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-accent" />
                Tarefas Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Nenhuma tarefa pendente.
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Produtos" value="0" icon={Package} variant="secondary" />
          <StatsCard title="Operações" value="0" icon={CheckCircle} variant="primary" />
          <StatsCard title="Conversão" value="0%" icon={TrendingUp} variant="accent" />
          <StatsCard title="Ticket Médio" value="R$ 0" icon={DollarSign} variant="success" />
        </div>
      </div>
    </AppLayout>
  );
}
