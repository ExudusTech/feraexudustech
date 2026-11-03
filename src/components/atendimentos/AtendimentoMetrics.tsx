import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAtendimentos, RESULTADO_LABEL, STATUS_LABEL } from "@/hooks/use-atendimentos";
import { useHumanService } from "@/hooks/use-human-service";
import { useOrganizationUsers } from "@/hooks/use-users";
import { useSchedules } from "@/hooks/use-schedules";
import { calcularMetricas, type FiltroAtendimento, type FiltroDim } from "@/lib/atendimento-metrics";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { formatEspera } from "./PainelAgora";

const PERIODS: Record<string, number> = { "7": 7, "30": 30, "90": 90 };
const ALL = "__all__";

function Breakdown({ title, data, labels, onPick }: { title: string; data: Record<string, number>; labels?: Record<string, string>; onPick?: (valor: string, label: string) => void }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>{entries.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
        <ul className="space-y-1 text-sm">{entries.map(([k, v]) => <li key={k}>{!onPick ? <div className="flex justify-between px-1 py-1"><span>{labels?.[k] ?? k}</span><span className="tabular-nums font-medium">{v}</span></div> : <button type="button" onClick={() => onPick(k, labels?.[k] ?? k)} className="w-full flex justify-between rounded px-1 py-1.5 min-h-9 hover:bg-muted/60 text-left"><span>{labels?.[k] ?? k}</span><span className="tabular-nums font-medium">{v}</span></button>}</li>)}</ul>
      )}</CardContent></Card>
  );
}

export default function AtendimentoMetrics({ onDrill }: { onDrill?: (f: FiltroAtendimento) => void }) {
  const [days, setDays] = useState("30");
  const [owner, setOwner] = useState(ALL);
  const desde = useMemo(() => new Date(Date.now() - PERIODS[days] * 86_400_000).toISOString(), [days]);
  const { data = [] } = useAtendimentos({ desde });
  const { data: users = [] } = useOrganizationUsers();
  const { data: schedules = [] } = useSchedules();
  const svc = useHumanService();
  const items = owner === ALL ? data : data.filter((a) => a.responsavel_id === owner || a.assumido_por === owner);
  const m = useMemo(() => calcularMetricas(items, svc, schedules as any), [items, svc, schedules]);
  const drill = (dim: FiltroDim, title: string) => !onDrill ? undefined : (valor: string, label: string) =>
    onDrill({ dim, valor, label: `${title}: ${label}`, desde, owner: owner === ALL ? undefined : owner });
  const t = (v: number | null) => (v == null ? "—" : formatEspera(v));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={days} onValueChange={setDays}><SelectTrigger className="w-40" aria-label="Período"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem></SelectContent></Select>
        <Select value={owner} onValueChange={setOwner}><SelectTrigger className="w-52" aria-label="Responsável"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Todos os responsáveis</SelectItem>{users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>)}</SelectContent></Select>
        {onDrill && <Button variant="outline" className="min-h-10" onClick={() => drill("atraso", "Filtro")?.("", "Em atraso agora")}><AlertTriangle className="h-4 w-4 mr-1" />Em atraso agora</Button>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["Atendimentos", String(m.total)], ["Assumidos em até 10 min", `${m.respondidosAte10Pct}%`],
          ["Até assumir (média / mediana)", `${t(m.assumirMedio)} / ${t(m.assumirMediano)}`], ["Até resolver (média / mediana)", `${t(m.resolverMedio)} / ${t(m.resolverMediano)}`]]
          .map(([label, value]) => (
            <Card key={label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>
          ))}
      </div>
      <p className="text-xs text-muted-foreground">Tempos contados só em horário de atendimento. {m.comAgendamentoDepois} atendimento(s) tiveram visita agendada para o mesmo lead depois.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Breakdown title="Por status" onPick={drill("status", "Status")} data={m.porStatus} labels={STATUS_LABEL} />
        <Breakdown title="Por gravidade" onPick={drill("gravidade", "Gravidade")} data={m.porGravidade} labels={{ verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" }} />
        <Breakdown title="Por resultado" onPick={drill("resultado", "Resultado")} data={m.porResultado} labels={RESULTADO_LABEL} />
        <Breakdown title="Por motivo" onPick={drill("motivo", "Motivo")} data={m.porMotivo} labels={{ transferencia: "Transferência", matriz: "Matriz" }} />
        <Breakdown title="Por canal" onPick={drill("canal", "Canal")} data={m.porCanal} labels={{ WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", MESSENGER: "Messenger", WIDGET: "Site" }} />
      </div>
    </div>
  );
}
