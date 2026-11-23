import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { LIMITE_TAREFAS_PAINEL, tarefasDoPainel, type TarefaPainelRow } from "@/lib/tarefas-painel";

const fmtData = (d: string) => d.split("-").reverse().join("/");
const fmtPrazo = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Dashboard "Tarefas Pendentes": open billing tasks for whoever can open /tarefas; everyone else keeps the plain card. */
export default function TarefasPendentesCard() {
  const { user } = useAuth();
  const { canAccessRoute } = usePermissions();
  const pode = canAccessRoute("/tarefas");
  const { data = [] } = useQuery({
    queryKey: ["tarefas-faturamento", user?.organization_id, "painel"], enabled: pode && !!user?.organization_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("tarefas_faturamento").select("id, numero, empresa_nome, tipo_nota, acao, data_visita, prazo")
        .eq("organization_id", user!.organization_id).eq("status", "aberta").order("prazo", { ascending: true }).limit(LIMITE_TAREFAS_PAINEL);
      if (error) throw error;
      return (data ?? []) as TarefaPainelRow[];
    },
  });
  const itens = pode ? tarefasDoPainel(data, new Date()) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          <span className="flex-1">Tarefas Pendentes</span>
          {pode && <Link to="/tarefas" className="text-sm font-normal text-primary hover:underline">Ver todas</Link>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!itens.length ? (
          <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
            Nenhuma tarefa pendente.
          </div>
        ) : (
          <ul className="space-y-2 min-h-[280px]">
            {itens.map((t) => (
              <li key={t.id}>
                <Link to="/tarefas" className={`block rounded-md border p-3 text-sm hover:bg-muted/50 ${t.atrasada ? "border-destructive/60" : "border-border"}`}>
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="shrink-0 font-semibold">#T-{t.numero}</span>
                    <span className="truncate">{t.empresa_nome ?? "Cliente"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground break-words">{t.rotulo}</div>
                  <div className="text-xs flex flex-wrap gap-x-2">
                    <span className="text-muted-foreground">Visita {fmtData(t.data_visita)}</span>
                    <span className={t.atrasada ? "text-destructive font-medium" : "text-muted-foreground"}>Prazo {fmtPrazo(t.prazo)}{t.atrasada ? " (vencido)" : ""}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
