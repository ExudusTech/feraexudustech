import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { PackageOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MaterialSeparadoButton } from "@/components/agenda/MaterialPronto";
import { OPERACAO_LABEL, itensTexto, type OperacaoMaterial } from "@/lib/prontidao";

/** "Separar para <data>": material of upcoming visits not yet separated. `onlyMine` limits to the user's visits. */
export default function SepararMaterial({ onlyMine }: { onlyMine?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data = [] } = useQuery({
    queryKey: ["separar-material", user?.organization_id, onlyMine ? user?.id : "all"], enabled: !!user?.organization_id,
    queryFn: async () => {
      let q = (supabase as any).from("schedules").select("id, scheduled_date, start_time, title, operacao_material, itens, assigned_to, clients(name), leads(empresa_nome, company)")
        .eq("organization_id", user!.organization_id).eq("exige_material", true).eq("material_status", "pendente")
        .in("status", ["agendado", "confirmado"]).gte("scheduled_date", today).order("scheduled_date").order("start_time").limit(100);
      if (onlyMine) q = q.eq("assigned_to", user!.id);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });
  if (!data.length) return null;
  const byDate = new Map<string, any[]>();
  for (const s of data) byDate.set(s.scheduled_date, [...(byDate.get(s.scheduled_date) ?? []), s]);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PackageOpen className="h-4 w-4" />Separar material ({data.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {[...byDate].map(([d, list]) => (
          <div key={d} className="space-y-2">
            <p className="text-sm font-medium">Separar para {d.split("-").reverse().join("/")}</p>
            {list.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm border-b last:border-0 pb-2">
                <span className="flex-1 min-w-[12rem]"><strong>{s.clients?.name || s.leads?.empresa_nome || s.leads?.company || s.title}</strong>
                  <span className="text-muted-foreground"> · {OPERACAO_LABEL[s.operacao_material as OperacaoMaterial]} · {String(s.start_time ?? "").slice(0, 5)}</span>
                  <span className="block">{itensTexto(s.itens)}</span></span>
                <MaterialSeparadoButton scheduleId={s.id} separado={false} onDone={() => { qc.invalidateQueries({ queryKey: ["separar-material"] }); qc.invalidateQueries({ queryKey: ["schedules"] }); }} />
              </div>))}
          </div>))}
      </CardContent>
    </Card>
  );
}
