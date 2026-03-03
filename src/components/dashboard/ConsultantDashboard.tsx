import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, FlaskConical, Wrench, CheckCircle } from "lucide-react";
import { useSchedules, type Schedule } from "@/hooks/use-schedules";
import { useAuth } from "@/hooks/use-auth";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const EKKOA_TYPES = ["instalacao_teste", "pre_emissao_nf", "manutencao"];

interface Props {
  onStartVisit?: (schedule: Schedule) => void;
}

export default function ConsultantDashboard({ onStartVisit }: Props) {
  const { user } = useAuth();
  const { data: allSchedules = [] } = useSchedules();
  const [currentDate, setCurrentDate] = useState(new Date());

  // Filter schedules for current user
  const mySchedules = useMemo(
    () => allSchedules.filter((s) => s.assigned_to === user?.id),
    [allSchedules, user?.id]
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Group schedules by date
  const schedulesByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    mySchedules.forEach((s) => {
      if (!map[s.scheduled_date]) map[s.scheduled_date] = [];
      map[s.scheduled_date].push(s);
    });
    return map;
  }, [mySchedules]);

  // Today's schedules
  const todaySchedules = useMemo(
    () => mySchedules
      .filter((s) => s.scheduled_date === todayStr)
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")),
    [mySchedules, todayStr]
  );

  // Upcoming (next 7 days, excluding today)
  const upcoming = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 7);
    const endStr = end.toISOString().split("T")[0];
    return mySchedules
      .filter((s) => s.scheduled_date > todayStr && s.scheduled_date <= endStr && s.status !== "cancelado")
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.start_time || "").localeCompare(b.start_time || ""));
  }, [mySchedules, todayStr]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const isEkkoa = (s: Schedule) => EKKOA_TYPES.includes((s as any).schedule_type || "");

  const getScheduleColor = (s: Schedule) => {
    if (s.status === "concluido") return "bg-muted text-muted-foreground";
    if (s.status === "cancelado") return "bg-destructive/10 text-destructive";
    if (isEkkoa(s)) return "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30";
    return "bg-primary/10 text-primary border-primary/20";
  };

  const getDotColor = (schedules: Schedule[]) => {
    const hasEkkoa = schedules.some(isEkkoa);
    const hasOther = schedules.some((s) => !isEkkoa(s));
    if (hasEkkoa && hasOther) return "both";
    if (hasEkkoa) return "ekkoa";
    return "other";
  };

  // Stats
  const pendingCount = mySchedules.filter((s) => s.status === "agendado").length;
  const completedThisMonth = mySchedules.filter(
    (s) => s.status === "concluido" && s.scheduled_date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)
  ).length;

  // Calendar grid
  const cells: Array<{ day: number | null; dateStr: string }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: "" });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><CalendarDays className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{todaySchedules.length}</p>
              <p className="text-xs text-muted-foreground">Compromissos hoje</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><Clock className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
            <div>
              <p className="text-2xl font-bold">{completedThisMonth}</p>
              <p className="text-xs text-muted-foreground">Concluídas no mês</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                {MONTHS[month]} {year}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToday}>Hoje</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
            {/* Legend */}
            <div className="flex gap-3 mt-1">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-cyan-500" />Ekkoa</span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" />Outros</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
              {cells.map((cell, i) => {
                if (!cell.day) return <div key={`e-${i}`} className="h-16" />;
                const daySchedules = schedulesByDate[cell.dateStr] || [];
                const isToday = cell.dateStr === todayStr;
                const dotType = daySchedules.length > 0 ? getDotColor(daySchedules) : null;
                return (
                  <div
                    key={cell.dateStr}
                    className={`h-16 p-1 rounded text-xs border border-transparent hover:border-border transition-colors relative
                      ${isToday ? "bg-primary/5 ring-1 ring-primary/30" : ""}
                    `}
                  >
                    <span className={`text-[11px] ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>{cell.day}</span>
                    {daySchedules.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {daySchedules.slice(0, 2).map((s) => (
                          <div key={s.id} className={`text-[9px] px-1 py-0.5 rounded truncate border ${getScheduleColor(s)}`}>
                            {s.start_time?.slice(0, 5)} {s.title.length > 12 ? s.title.slice(0, 12) + "…" : s.title}
                          </div>
                        ))}
                        {daySchedules.length > 2 && (
                          <span className="text-[9px] text-muted-foreground">+{daySchedules.length - 2}</span>
                        )}
                      </div>
                    )}
                    {dotType && (
                      <div className="absolute top-1 right-1 flex gap-0.5">
                        {(dotType === "ekkoa" || dotType === "both") && <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />}
                        {(dotType === "other" || dotType === "both") && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Today's agenda */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Hoje — {today.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {todaySchedules.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum compromisso hoje</p>
              ) : (
                todaySchedules.map((s) => (
                  <ScheduleItem key={s.id} schedule={s} isEkkoa={isEkkoa(s)} onStartVisit={onStartVisit} />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Próximos 7 dias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcoming.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sem compromissos próximos</p>
              ) : (
                upcoming.slice(0, 5).map((s) => (
                  <ScheduleItem key={s.id} schedule={s} isEkkoa={isEkkoa(s)} showDate />
                ))
              )}
              {upcoming.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">+{upcoming.length - 5} mais</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ScheduleItem({ schedule, isEkkoa: isEk, showDate, onStartVisit }: {
  schedule: Schedule;
  isEkkoa: boolean;
  showDate?: boolean;
  onStartVisit?: (s: Schedule) => void;
}) {
  const canStart = schedule.status === "agendado" && (schedule as any).schedule_type === "instalacao_teste";
  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${isEk ? "border-cyan-500/20 bg-cyan-500/5" : "border-border"}`}>
      <div className={`mt-0.5 p-1 rounded ${isEk ? "bg-cyan-500/10" : "bg-primary/10"}`}>
        {isEk ? <FlaskConical className="h-3 w-3 text-cyan-600" /> : <Wrench className="h-3 w-3 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{schedule.title}</p>
        <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
          {showDate && <span>{new Date(schedule.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>}
          {schedule.start_time && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{schedule.start_time.slice(0, 5)}</span>}
          {schedule.location && <span className="flex items-center gap-0.5 truncate"><MapPin className="h-2.5 w-2.5" />{schedule.location.length > 20 ? schedule.location.slice(0, 20) + "…" : schedule.location}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Badge variant={schedule.status === "concluido" ? "default" : schedule.status === "cancelado" ? "destructive" : "secondary"} className="text-[9px] px-1.5 py-0">
          {schedule.status}
        </Badge>
        {canStart && onStartVisit && (
          <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={() => onStartVisit(schedule)}>
            Iniciar
          </Button>
        )}
      </div>
    </div>
  );
}
