import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Target } from "lucide-react";
import { useLeadStages } from "@/components/settings/LeadStagesSettings";
import { funilPorEtapa, type PipelineLead } from "@/lib/lead-pipeline";

interface Props {
  leads: PipelineLead[] | undefined;
}

const chartConfig = {
  quantidade: { label: "Leads", color: "hsl(0, 72%, 51%)" },
};

const curto = (v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v);

export default function LeadsPipelineChart({ leads }: Props) {
  const { data: stages = [], isLoading } = useLeadStages();
  const data = useMemo(() => (isLoading ? [] : funilPorEtapa(stages, leads ?? [])), [stages, leads, isLoading]);
  const altura = Math.max(280, data.length * 32);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5 text-primary" />
          Funil de Leads
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full aspect-auto" style={{ height: altura }}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} width={110} interval={0} tickFormatter={curto} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="quantidade" fill="var(--color-quantidade)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
