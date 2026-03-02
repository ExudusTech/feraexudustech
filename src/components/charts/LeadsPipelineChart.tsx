import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Target } from "lucide-react";

interface Props {
  leads: { id: string; stage: string }[] | undefined;
}

const STAGE_LABELS: Record<string, string> = {
  novo: "Novo",
  contato: "Contato",
  qualificado: "Qualificado",
  proposta: "Proposta",
  negociacao: "Negociação",
  fechado_ganho: "Ganho",
  fechado_perdido: "Perdido",
};

const chartConfig = {
  quantidade: { label: "Leads", color: "hsl(0, 72%, 51%)" },
};

export default function LeadsPipelineChart({ leads }: Props) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    leads?.forEach(l => {
      counts[l.stage] = (counts[l.stage] || 0) + 1;
    });

    return Object.entries(STAGE_LABELS).map(([key, label]) => ({
      name: label,
      quantidade: counts[key] || 0,
    }));
  }, [leads]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5 text-primary" />
          Funil de Leads
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} width={80} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="quantidade" fill="var(--color-quantidade)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
