import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { useSchedules } from "@/hooks/use-schedules";

/** Today's route/visits, shown under the "Agora" panel. */
export default function AgendaHoje() {
  const { data = [] } = useSchedules();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const items = data.filter((s) => s.scheduled_date === today && s.status !== "cancelado")
    .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" />Agenda de hoje
        <Link to="/agenda" className="ml-auto text-sm font-normal text-primary hover:underline">Abrir agenda</Link></CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma visita hoje.</p> : (
          <ul className="divide-y divide-border">
            {items.map((s) => (
              <li key={s.id}><Link to={`/agenda?agendamento=${s.id}`} className="flex gap-3 py-2 min-h-11 items-center hover:text-primary">
                <span className="tabular-nums text-sm w-12 text-muted-foreground">{s.start_time?.slice(0, 5) ?? "—"}</span>
                <span className="text-sm truncate">{s.title}</span>
              </Link></li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
