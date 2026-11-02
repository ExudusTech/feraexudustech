import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Headset, MessageCircle, ExternalLink, Hand, CheckCircle2 } from "lucide-react";
import { useAtendimentos, useAtendimentoAction, type Atendimento } from "@/hooks/use-atendimentos";
import { useHumanService } from "@/hooks/use-human-service";
import { esperaMinutos, nivel, ordenarAgora } from "@/lib/atendimento-metrics";
import ResolveDialog from "./ResolveDialog";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";

export const NIVEL_STYLE: Record<string, string> = {
  verde: "bg-success/15 text-success border-success/30",
  amarelo: "bg-warning/15 text-warning border-warning/30",
  vermelho: "bg-destructive/15 text-destructive border-destructive/30",
};

export function formatEspera(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** "Agora": open service requests, most urgent first, with quick actions. */
export default function PainelAgora(props: { compact?: boolean }) {
  const { canAccessRoute } = usePermissions();
  return canAccessRoute("/atendimentos") ? <Painel {...props} /> : null;
}

function Painel({ compact = false }: { compact?: boolean }) {
  const { data = [] } = useAtendimentos({ abertos: true });
  const svc = useHumanService();
  const action = useAtendimentoAction();
  const [resolving, setResolving] = useState<Atendimento | null>(null);
  const items = useMemo(() => ordenarAgora(data, svc), [data, svc]);
  if (compact && items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Headset className="h-5 w-5 text-primary" />Agora
          <Badge variant="secondary">{items.length}</Badge>
          <Link to="/atendimentos" className="ml-auto text-sm font-normal text-primary hover:underline">Ver todos</Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum atendimento em aberto.</p> : (
          <ul className="space-y-2">
            {items.slice(0, compact ? 5 : 20).map((a) => {
              const lvl = nivel(a, svc); const min = esperaMinutos(a, svc);
              const wa = a.whatsapp?.replace(/\D/g, "");
              return (
                <li key={a.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", NIVEL_STYLE[lvl])}>{formatEspera(min)}</span>
                    <span className="font-medium">{a.empresa || a.contato_nome || "Cliente"}</span>
                    {a.empresa && a.contato_nome && <span className="text-sm text-muted-foreground">— {a.contato_nome}</span>}
                    {a.tipo === "matriz" && <Badge variant="outline">Matriz</Badge>}
                    {a.urgencia === "alta" && <Badge variant="destructive">Urgente</Badge>}
                    {a.status === "em_atendimento" && <Badge variant="secondary">Em atendimento</Badge>}
                    {a.cobrancas > 0 && <Badge variant="outline">Cobrou {a.cobrancas}x</Badge>}
                  </div>
                  {a.resumo && <p className="text-sm text-muted-foreground line-clamp-2">{a.resumo}</p>}
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline" className="min-h-11"><Link to={`/atendimentos?id=${a.id}`}><ExternalLink className="h-4 w-4 mr-1" />Abrir conversa</Link></Button>
                    {wa && <Button asChild size="sm" variant="outline" className="min-h-11"><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a></Button>}
                    {a.status === "aberto" && <Button size="sm" className="min-h-11" disabled={action.isPending} onClick={() => action.mutate({ id: a.id, action: "assumir" })}><Hand className="h-4 w-4 mr-1" />Assumir</Button>}
                    <Button size="sm" variant="secondary" className="min-h-11" onClick={() => setResolving(a)}><CheckCircle2 className="h-4 w-4 mr-1" />Resolver</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <ResolveDialog atendimento={resolving} onClose={() => setResolving(null)} />
    </Card>
  );
}
