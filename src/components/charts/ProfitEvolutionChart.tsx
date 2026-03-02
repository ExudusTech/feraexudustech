import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";
import type { FinancialTransaction, OperationalExpense } from "@/hooks/use-financeiro";

interface Props {
  transactions: FinancialTransaction[] | undefined;
  expenses: OperationalExpense[] | undefined;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const chartConfig = {
  lucro: { label: "Lucro", color: "hsl(142, 55%, 42%)" },
};

export default function ProfitEvolutionChart({ transactions, expenses }: Props) {
  const data = useMemo(() => {
    const now = new Date();
    const months: { name: string; lucro: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();

      const rev = transactions
        ?.filter(t => t.transaction_type === "receita" && t.created_at >= start && t.created_at < end)
        ?.reduce((s, t) => s + Number(t.amount), 0) ?? 0;

      const exp = (expenses
        ?.filter(e => e.created_at >= start && e.created_at < end)
        ?.reduce((s, e) => s + Number(e.amount), 0) ?? 0) +
        (transactions
          ?.filter(t => t.transaction_type === "despesa" && t.created_at >= start && t.created_at < end)
          ?.reduce((s, t) => s + Number(t.amount), 0) ?? 0);

      months.push({ name: `${MONTHS[month]}/${String(year).slice(2)}`, lucro: rev - exp });
    }
    return months;
  }, [transactions, expenses]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-[hsl(var(--success))]" />
          Evolução do Lucro
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="lucroGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-lucro)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-lucro)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />} />
            <Area type="monotone" dataKey="lucro" stroke="var(--color-lucro)" fill="url(#lucroGrad)" strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
