import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAtendimentos, RESULTADO_LABEL, STATUS_LABEL } from "@/hooks/use-atendimentos";
import { useHumanService } from "@/hooks/use-human-service";
import { useOrganizationUsers } from "@/hooks/use-users";
import { useSchedules } from "@/hooks/use-schedules";
import { calcularMetricas } from "@/lib/atendimento-metrics";
import { formatEspera } from "./PainelAgora";

const PERIODS: Record<string, number> = { "7": 7, "30": 30, "90": 90 };
const ALL = "__all__";

function Breakdown({ title, data, labels }: { title: string; data: Record<string, number>; labels?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>{entries.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
        <ul className="space-y-1 text-sm">{entries.map(([k, v]) => <li key={k} className="flex justify-between"><span>{labels?.[k] ?? k}</span><span className="tabular-nums font-medium">{v}</span></li>)}</ul>
      )}</CardContent></Card>
  );
}

export default function AtendimentoMetrics() {
  const [days, setDays] = useState("30");
  const [owner, setOwner] = useState(ALL);
  const desde = useMemo(() => new Date(Date.now() - PERIODS[days] * 86_400_000).toISOString(), [days]);
  const { data = [] } = useAtendimentos({ desde });
  const { data: users = [] } = useOrganizationUsers();
  const { data: schedules = [] } = useSchedules();
  const svc = useHumanService();
  const items = owner === ALL ? data : data.filter((a) => a.responsavel_id === owner || a.assumido_por === owner);
  const m = useMemo(() => calcularMetricas(items, svc, schedules as any), [items, svc, schedules]);
  const t = (v: number | null) => (v == null ? "—" : formatEspera(v));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={days} onValueChange={setDays}><SelectTrigger className="w-40" aria-label="Período"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem></SelectContent></Select>
        <Select value={owner} onValueChange={setOwner}><SelectTrigger className="w-52" aria-label="Responsável"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Todos os responsáveis</SelectItem>{users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>)}</SelectContent></Select>
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
        <Breakdown title="Por status" data={m.porStatus} labels={STATUS_LABEL} />
        <Breakdown title="Por gravidade" data={m.porGravidade} labels={{ verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" }} />
        <Breakdown title="Por resultado" data={m.porResultado} labels={RESULTADO_LABEL} />
        <Breakdown title="Por motivo" data={m.porMotivo} labels={{ transferencia: "Transferência", matriz: "Matriz" }} />
        <Breakdown title="Por canal" data={m.porCanal} labels={{ WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", MESSENGER: "Messenger", WIDGET: "Site" }} />
      </div>
    </div>
  );
}
