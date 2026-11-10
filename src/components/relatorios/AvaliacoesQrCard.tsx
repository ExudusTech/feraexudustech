import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { qrNps } from "@/lib/qr";
import { formatEtiqueta } from "@/lib/etiquetas";
import { cn } from "@/lib/utils";

/** Relatórios → Avaliações do QR (manager only): average score and NPS by client, point and period. Team scans are left out. */
export default function AvaliacoesQrCard() {
  const { user } = useAuth();
  const [dias, setDias] = useState("90");
  const { data = [] } = useQuery({
    queryKey: ["qr-avaliacoes", user?.organization_id, dias], enabled: !!user?.organization_id,
    queryFn: async () => ((await (supabase as any).from("qr_avaliacoes").select("id, nota, comentario, sentimento, tipo_avaliador, ponto, etiqueta_numero, created_at, client_id, clients(name)")
      .eq("organization_id", user!.organization_id).neq("tipo_avaliador", "EQUIPE").gte("created_at", new Date(Date.now() - Number(dias) * 86_400_000).toISOString())
      .order("created_at", { ascending: false }).limit(2000)).data ?? []) as any[],
  });
  const geral = qrNps(data.map((a) => a.nota));
  const agrupar = (key: (a: any) => string) => {
    const m = new Map<string, number[]>();
    for (const a of data) m.set(key(a), [...(m.get(key(a)) ?? []), a.nota]);
    return [...m].map(([k, notas]) => ({ k, ...qrNps(notas) })).sort((a, b) => (a.media ?? 0) - (b.media ?? 0));
  };
  const porCliente = useMemo(() => agrupar((a) => a.clients?.name ?? "Sem cliente"), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const porPonto = useMemo(() => agrupar((a) => `${a.clients?.name ?? "—"} · ${a.ponto ?? "Ponto"}${a.etiqueta_numero ? ` (nº ${formatEtiqueta(a.etiqueta_numero)})` : ""}`), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const baixas = data.filter((a) => a.nota <= 6 || a.sentimento === "negativo").slice(0, 8);
  const Linha = ({ r }: { r: ReturnType<typeof agrupar>[number] }) => (
    <div className="flex items-center gap-2 text-sm border-b last:border-0 py-1">
      <span className="flex-1 min-w-0 break-words">{r.k}</span>
      <span className={cn("font-semibold", (r.media ?? 10) <= 6 && "text-destructive")}>{r.media}</span>
      <span className="text-xs text-muted-foreground w-24 text-right">NPS {r.nps} · {r.n}</span>
    </div>);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2 flex-1"><Star className="h-4 w-4" />Avaliações do QR</CardTitle>
        <Select value={dias} onValueChange={setDias}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>{["30", "90", "180", "365"].map((d) => <SelectItem key={d} value={d}>Últimos {d} dias</SelectItem>)}</SelectContent></Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.length ? <p className="text-sm text-muted-foreground">Nenhuma avaliação no período. As notas chegam quando alguém escaneia o QR e responde à Flora.</p> : <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["Nota média", geral.media], ["NPS", geral.nps], ["Avaliações", geral.n]].map(([k, v]) => (
              <div key={k as string} className="rounded border p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="text-xl font-bold">{v}</p></div>))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="text-sm font-medium mb-1">Por cliente (pior primeiro)</p>{porCliente.slice(0, 10).map((r) => <Linha key={r.k} r={r} />)}</div>
            <div><p className="text-sm font-medium mb-1">Por ponto (pior primeiro)</p>{porPonto.slice(0, 10).map((r) => <Linha key={r.k} r={r} />)}</div>
          </div>
          {baixas.length > 0 && <div><p className="text-sm font-medium mb-1">Notas baixas recentes</p>{baixas.map((a) => (
            <p key={a.id} className="text-sm border-b last:border-0 py-1"><Badge variant="destructive" className="mr-2">{a.nota}</Badge>{a.clients?.name ?? "—"} · {a.ponto ?? "Ponto"}
              <span className="text-xs text-muted-foreground"> · {new Date(a.created_at).toLocaleDateString("pt-BR")}{a.comentario ? ` — ${a.comentario}` : ""}</span></p>))}</div>}
          <p className="text-xs text-muted-foreground">NPS = % de notas 9–10 menos % de notas 0–6. Escaneamentos da equipe não contam.</p>
        </>}
      </CardContent>
    </Card>
  );
}
