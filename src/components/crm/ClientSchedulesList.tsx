import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import VisitExecutionDialog from "@/components/agenda/VisitExecutionDialog";
import { useSchedules } from "@/hooks/use-schedules";
import { serviceKind } from "@/lib/service-kind";
import { RESULT_LABEL, STATUS_LABEL } from "@/lib/visit-exec";

/** Client visits = agenda schedules linked to a client (single visit model, with Lote 10 check-in/evidence). */
export default function ClientSchedulesList({ clientName, search }: { clientName: (id: string | null) => string; search: string }) {
  const { data: schedules = [] } = useSchedules();
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => schedules.filter((s) => s.client_id && (!search || `${clientName(s.client_id)} ${s.title}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)), [schedules, search, clientName]);
  const current = schedules.find((s) => s.id === sel) ?? null;
  if (!rows.length) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground"><div className="text-center space-y-2">
      <CalendarCheck className="h-12 w-12 mx-auto text-muted-foreground/40" /><p>Nenhuma visita de cliente na agenda.</p>
      <Button variant="outline" asChild><Link to="/agenda">Agendar na Agenda</Link></Button></div></div>);
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Resultado</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((s) => (
          <TableRow key={s.id} className="cursor-pointer" onClick={() => setSel(s.id)}>
            <TableCell className="font-medium">{clientName(s.client_id)}</TableCell>
            <TableCell>{s.scheduled_date.split("-").reverse().join("/")} {s.start_time?.slice(0, 5)}</TableCell>
            <TableCell><Badge variant="secondary">{serviceKind(s.schedule_type, s.schedule_subtype)}</Badge></TableCell>
            <TableCell>{STATUS_LABEL[s.status] ?? s.status}</TableCell>
            <TableCell>{s.resultado ? RESULT_LABEL[s.resultado] ?? s.resultado : "—"}</TableCell>
          </TableRow>))}</TableBody>
      </Table>
      <VisitExecutionDialog schedule={current} open={!!current} onOpenChange={(o) => !o && setSel(null)} clientName={current ? clientName(current.client_id) : undefined} />
    </div>
  );
}
