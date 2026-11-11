import { ProntidaoBadge } from "@/components/agenda/MaterialPronto";
import { temPendenciaColeta } from "@/lib/coleta";
import { OcorrenciaTag } from "@/components/agenda/ColetaOcorrencia";
import { addDays, format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSchedules } from "@/hooks/use-schedules";
import { useOrganizationUsers } from "@/hooks/use-users";
import VisitExecutionDialog from "@/components/agenda/VisitExecutionDialog";
import { RESULT_LABEL, STATUS_LABEL, lateMinutes } from "@/lib/visit-exec";
import EmergencyRequests from "@/components/dashboard/EmergencyRequests";
import { fieldMetrics, matchesFilter, type OpsFilter } from "@/lib/field-ops";

const spDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Manager view of today's field visits: live status per consultant, check-in map, alerts and week metrics. */
export default function FieldOpsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: schedules = [] } = useSchedules();
  const { data: users = [] } = useOrganizationUsers();
  const [filter, setFilter] = useState<OpsFilter | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = spDate(now);
  const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const weekStart = d.toISOString().slice(0, 10);

  const { data: checkins = [] } = useQuery({
    queryKey: ["field-checkins", user?.organization_id, weekStart], enabled: !!user?.organization_id,
    queryFn: async () => {
      if (!user?.organization_id) return [];
      const { data } = await (supabase as any).from("schedule_checkins").select("schedule_id, checkin_em, latitude, longitude, distancia_m, fora_do_raio, sem_permissao, geolocation_error, destino_sem_coordenadas, user_id")
        .eq("organization_id", user.organization_id).gte("checkin_em", `${weekStart}T00:00:00-03:00`);
      return (data ?? []) as any[];
    },
  });
  useEffect(() => {
    if (!user?.organization_id) return;
    const ch = supabase.channel(`campo-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules", filter: `organization_id=eq.${user.organization_id}` },
        () => qc.invalidateQueries({ queryKey: ["schedules"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_checkins", filter: `organization_id=eq.${user.organization_id}` },
        () => qc.invalidateQueries({ queryKey: ["field-checkins"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.organization_id, qc]);

  const m = useMemo(() => fieldMetrics(schedules, checkins, now, today, weekStart), [schedules, checkins, now, today, weekStart]);
  const names = new Map(users.map((u) => [u.user_id, u.name]));
  const todayList = schedules.filter((s) => s.scheduled_date === today && s.status !== "cancelado")
    .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
  const byConsultant = new Map<string, typeof todayList>();
  for (const s of todayList) { const k = s.assigned_to ?? ""; byConsultant.set(k, [...(byConsultant.get(k) ?? []), s]); }
  const filtered = filter ? schedules.filter((s) => (filter === "atrasadas" || filter === "fora_do_local" ? s.scheduled_date === today : s.scheduled_date >= weekStart && s.scheduled_date <= today)
    && matchesFilter(s, filter, { atrasadas: m.atrasadas, foraDoLocal: m.foraDoLocal, semCoordenadas: m.semCoordenadas })) : [];
  const tomorrow = format(addDays(new Date(`${today}T12:00:00`), 1), "yyyy-MM-dd");
  const prontidaoPend = schedules.filter((s) => (s.scheduled_date === today || s.scheduled_date === tomorrow) && ["agendado", "confirmado"].includes(s.status) && s.prontidao && s.prontidao !== "pronto");
  const infoPend = schedules.filter((s: any) => temPendenciaColeta(s));
  const lista = filter === ("prontidao" as OpsFilter) ? prontidaoPend : filter === ("info_pendente" as OpsFilter) ? infoPend : filtered;
  const points = checkins.filter((c) => typeof c.latitude === "number" && todayList.some((s) => s.id === c.schedule_id));
  const current = schedules.find((s) => s.id === selected) ?? null;

  const Metric = ({ label, value, f, tone }: { label: string; value: number | string; f?: OpsFilter; tone?: "alert" }) => (
    <button disabled={!f} onClick={() => f && setFilter(filter === f ? null : f)}
      className={`rounded-xl border p-3 text-left min-h-16 ${filter === f ? "border-primary" : ""} ${f ? "hover:bg-accent" : ""}`}>
      <div className={`text-2xl font-bold ${tone === "alert" && Number(value) > 0 ? "text-destructive" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  );
  const Row = ({ s }: { s: (typeof schedules)[number] }) => {
    const late = lateMinutes(now, s);
    const fora = m.foraDoLocal.includes(s.id);
    return (
      <li><button onClick={() => setSelected(s.id)} className="w-full flex items-center gap-3 py-2 min-h-11 text-left hover:text-primary">
        <span className="tabular-nums text-sm w-12 text-muted-foreground">{s.start_time?.slice(0, 5) ?? "—"}</span>
        <span className="flex-1 truncate text-sm">{s.title}</span>
        {late >= 15 && <Badge variant="destructive">Atrasada {late} min</Badge>}
        {fora && <Badge variant="destructive">Fora do local</Badge>}
        {["agendado", "confirmado"].includes(s.status) && <ProntidaoBadge prontidao={s.prontidao} compact />} <OcorrenciaTag s={s as any} />
        <Badge variant={s.status === "concluido" ? "secondary" : "outline"}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
      </button></li>
    );
  };

  return (
    <div className="space-y-4">
      <EmergencyRequests />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Metric label="Realizadas na semana" value={m.realizadas} f="realizadas" />
        <Metric label="Não realizadas" value={m.naoRealizadas} f="nao_realizadas" />
        <Metric label="Duração média (min)" value={m.duracaoMedia} />
        <Metric label="Atrasadas sem check-in" value={m.atrasadas.length} f="atrasadas" tone="alert" />
        <Metric label="Check-in fora do local" value={m.foraDoLocal.length} f="fora_do_local" tone="alert" />
        <Metric label="Prontidão pendente (hoje/amanhã)" value={prontidaoPend.length} f={"prontidao" as OpsFilter} tone="alert" />
        <Metric label="Realizadas — informações pendentes" value={infoPend.length} f={"info_pendente" as OpsFilter} tone="alert" />
        <Metric label="Local do cliente sem coordenadas" value={m.semCoordenadas.length} f="sem_coordenadas" tone="alert" />
        {Object.entries(m.resultados).map(([k, v]) => <Metric key={k} label={RESULT_LABEL[k] ?? k} value={v} f={`resultado:${k}`} />)}
      </div>
      {filter && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center">Lista filtrada
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setFilter(null)}>Limpar filtro</Button></CardTitle></CardHeader>
          <CardContent>{lista.length ? <ul className="divide-y divide-border">{lista.map((s) => <Row key={s.id} s={s} />)}</ul>
            : <p className="text-sm text-muted-foreground">Nada aqui.</p>}</CardContent></Card>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Visitas de hoje por consultor</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {todayList.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma visita hoje.</p>}
            {[...byConsultant.entries()].map(([uid, list]) => (
              <div key={uid}><h4 className="text-sm font-semibold">{names.get(uid) ?? "Sem responsável"}
                <span className="text-muted-foreground font-normal"> · {list.filter((s) => s.status === "concluido").length}/{list.length}</span></h4>
                <ul className="divide-y divide-border">{list.map((s) => <Row key={s.id} s={s} />)}</ul></div>
            ))}
          </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Mapa dos check-ins de hoje</CardTitle></CardHeader>
          <CardContent>
            <div className="h-80 rounded-lg overflow-hidden">
              <MapContainer center={[-22.88, -42.02]} zoom={9} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {points.map((c) => (
                  <CircleMarker key={c.schedule_id} center={[c.latitude, c.longitude]} radius={9}
                    pathOptions={{ color: c.fora_do_raio ? "hsl(var(--destructive))" : c.destino_sem_coordenadas ? "hsl(var(--warning))" : "hsl(var(--primary))" }} eventHandlers={{ click: () => setSelected(c.schedule_id) }}>
                    <Tooltip>{names.get(c.user_id) ?? ""} · {todayList.find((s) => s.id === c.schedule_id)?.title}{c.distancia_m != null ? ` · ${formatDistancia(c.distancia_m)}` : c.destino_sem_coordenadas ? " · local do cliente sem coordenadas" : ""}</Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </CardContent></Card>
      </div>
      <VisitExecutionDialog open={!!current} onOpenChange={(o) => !o && setSelected(null)} schedule={current} />
    </div>
  );
}
