import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { baseAction } from "@/lib/base-instalada";
import { toast } from "@/hooks/use-toast";

/** "Levar na próxima visita": open replacement occurrences for the consultant, grouped by client. */
export default function LevarProximaVisita() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["ocorrencias", "minhas", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from("maintenance_schedule").select("id, item_descricao, quantidade, urgente, status, client_id, clients(name), comodatos(localizacao_interna)")
        .eq("assigned_to", user!.id).eq("tipo_os", "substituicao").in("status", ["agendada", "em_andamento"]).order("created_at");
      return (data ?? []) as any[];
    },
  });
  if (!data.length) return null;
  const groups = new Map<string, any[]>();
  data.forEach((o) => groups.set(o.clients?.name ?? "Cliente", [...(groups.get(o.clients?.name ?? "Cliente") ?? []), o]));
  const separar = async (id: string, status: string) => {
    try { await baseAction({ action: "ocorrencia_status", id, status }); qc.invalidateQueries({ queryKey: ["ocorrencias"] }); }
    catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); }
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4" />Levar na próxima visita</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {[...groups].map(([cliente, list]) => (
          <div key={cliente} className="space-y-1">
            <p className="text-sm font-semibold">{cliente}</p>
            {list.map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{o.quantidade}x {o.item_descricao}{o.comodatos?.localizacao_interna && <span className="text-muted-foreground"> · {o.comodatos.localizacao_interna}</span>}</span>
                {o.urgente && <Badge variant="destructive">Urgente</Badge>}
                <Button size="sm" variant={o.status === "em_andamento" ? "default" : "outline"} onClick={() => separar(o.id, o.status === "em_andamento" ? "aberta" : "separada")}>
                  {o.status === "em_andamento" ? "Separado ✓" : "Separar"}</Button>
              </div>))}
          </div>))}
      </CardContent>
    </Card>
  );
}
