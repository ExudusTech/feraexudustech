import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { baseAction } from "@/lib/base-instalada";
import { toast } from "@/hooks/use-toast";

/** Inventory view of open replacement work orders: "separar equipamento X para cliente Y". The work order is the reservation. */
export default function SepararEquipamentos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["ocorrencias", "inventario", user?.organization_id], enabled: !!user?.organization_id,
    queryFn: async () => {
      const { data } = await (supabase as any).from("maintenance_schedule").select("id, item_descricao, quantidade, urgente, status, aprovacao_status, clients(name), comodatos(localizacao_interna)")
        .eq("organization_id", user!.organization_id).eq("tipo_os", "substituicao").in("status", ["agendada", "em_andamento"]).order("created_at");
      return (data ?? []) as any[];
    },
  });
  if (!data.length) return null;
  const marcar = async (id: string, status: string) => {
    try { await baseAction({ action: "ocorrencia_status", id, status }); qc.invalidateQueries({ queryKey: ["ocorrencias"] }); }
    catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); }
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4" />Separar equipamento ({data.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {data.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm border-b last:border-0 pb-2">
            <span className="flex-1 min-w-[12rem]">Separar <strong>{o.quantidade}x {o.item_descricao}</strong> para <strong>{o.clients?.name ?? "cliente"}</strong>
              {o.comodatos?.localizacao_interna && <span className="text-muted-foreground"> · {o.comodatos.localizacao_interna}</span>}</span>
            {o.urgente && <Badge variant="destructive">Urgente</Badge>}
            {o.status === "em_andamento" ? <Badge>Separado</Badge>
              : <Button size="sm" variant="outline" className="min-h-9" onClick={() => marcar(o.id, "separada")}>Marcar separado</Button>}
          </div>))}
      </CardContent>
    </Card>
  );
}
