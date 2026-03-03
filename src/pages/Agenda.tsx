import { useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, List, Search, MoreHorizontal, Pencil, Trash2, Loader2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useSchedules, useDeleteSchedule, type Schedule } from "@/hooks/use-schedules";
import { useOrganizationUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import ScheduleFormDialog from "@/components/ekkoa/ScheduleFormDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, addYears, subYears, isSameDay, isSameMonth, startOfYear, endOfYear, eachMonthOfInterval, eachWeekOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ViewMode = "minhas" | "criadas";
type CalendarView = "dia" | "semana" | "mes" | "ano";

export default function Agenda() {
  const { user } = useAuth();
  const { data: schedules = [], isLoading } = useSchedules();
  const { data: users = [] } = useOrganizationUsers();
  const deleteSchedule = useDeleteSchedule();

  const [viewMode, setViewMode] = useState<ViewMode>("minhas");
  const [displayMode, setDisplayMode] = useState<"lista" | "calendario">("lista");
  const [calendarView, setCalendarView] = useState<CalendarView>("mes");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterResponsavel, setFilterResponsavel] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Schedule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.user_id, u.name));
    return map;
  }, [users]);

  // Extract unique cities from locations
  const cities = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => {
      if (s.location) {
        // Try to extract city from location string
        const parts = s.location.split(",");
        if (parts.length >= 2) {
          const city = parts[parts.length - 2]?.trim();
          if (city) set.add(city);
        } else {
          set.add(s.location.trim());
        }
      }
    });
    return Array.from(set).sort();
  }, [schedules]);

  // Filter schedules by view mode
  const modeFiltered = useMemo(() => {
    if (!user) return [];
    if (viewMode === "minhas") {
      return schedules.filter((s) => s.assigned_to === user.id);
    }
    return schedules.filter((s) => s.created_by === user.id);
  }, [schedules, viewMode, user]);

  // Apply search and filters
  const filtered = useMemo(() => {
    return modeFiltered.filter((s) => {
      if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterResponsavel !== "all" && s.assigned_to !== filterResponsavel) return false;
      if (filterCity !== "all") {
        if (!s.location || !s.location.toLowerCase().includes(filterCity.toLowerCase())) return false;
      }
      return true;
    });
  }, [modeFiltered, search, filterStatus, filterResponsavel, filterCity]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      agendado: { label: "Agendado", variant: "default" },
      concluido: { label: "Concluído", variant: "secondary" },
      cancelado: { label: "Cancelado", variant: "destructive" },
      em_andamento: { label: "Em Andamento", variant: "outline" },
    };
    const cfg = map[status] || { label: status, variant: "outline" as const };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const navigateCalendar = (dir: "prev" | "next") => {
    const fn = dir === "prev"
      ? { dia: subDays, semana: subWeeks, mes: subMonths, ano: subYears }
      : { dia: addDays, semana: addWeeks, mes: addMonths, ano: addYears };
    setCurrentDate(fn[calendarView](currentDate, 1));
  };

  const calendarTitle = () => {
    switch (calendarView) {
      case "dia": return format(currentDate, "dd 'de' MMMM yyyy", { locale: ptBR });
      case "semana": {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 });
        const end = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(start, "dd/MM")} - ${format(end, "dd/MM/yyyy")}`;
      }
      case "mes": return format(currentDate, "MMMM yyyy", { locale: ptBR });
      case "ano": return format(currentDate, "yyyy");
    }
  };

  const getSchedulesForDate = (date: Date) =>
    filtered.filter((s) => isSameDay(parseISO(s.scheduled_date), date));

  // Calendar views
  const renderCalendarMonth = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });
    const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-muted">
          {weekDays.map((d) => (
            <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-b">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[100px]">
          {days.map((day) => {
            const daySchedules = getSchedulesForDate(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            return (
              <div key={day.toISOString()} className={cn(
                "border-b border-r p-1 overflow-hidden",
                !isCurrentMonth && "bg-muted/30 text-muted-foreground"
              )}>
                <div className="text-xs font-medium mb-1">{format(day, "d")}</div>
                <div className="space-y-0.5">
                  {daySchedules.slice(0, 2).map((s) => (
                    <div key={s.id} className="text-[10px] bg-primary/10 text-primary rounded px-1 py-0.5 truncate cursor-pointer" title={s.title}>
                      {s.start_time && <span className="font-medium">{s.start_time.slice(0, 5)} </span>}
                      {s.title}
                    </div>
                  ))}
                  {daySchedules.length > 2 && (
                    <div className="text-[10px] text-muted-foreground">+{daySchedules.length - 2} mais</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCalendarWeek = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate, { weekStartsOn: 1 }) });

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const daySchedules = getSchedulesForDate(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className="border-r min-h-[300px]">
                <div className={cn("p-2 text-center border-b text-sm font-medium", isToday && "bg-primary text-primary-foreground")}>
                  {format(day, "EEE dd/MM", { locale: ptBR })}
                </div>
                <div className="p-1 space-y-1">
                  {daySchedules.map((s) => (
                    <div key={s.id} className="text-xs bg-primary/10 text-primary rounded p-1.5">
                      <div className="font-medium">{s.start_time?.slice(0, 5) || "—"}</div>
                      <div className="truncate">{s.title}</div>
                      <div className="text-muted-foreground truncate">{userMap.get(s.assigned_to || "") || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCalendarDay = () => {
    const daySchedules = getSchedulesForDate(currentDate);
    return (
      <div className="border rounded-lg p-4 min-h-[400px]">
        <h3 className="text-lg font-medium mb-4">{format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</h3>
        {daySchedules.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum agendamento para este dia.</p>
        ) : (
          <div className="space-y-2">
            {daySchedules.map((s) => (
              <div key={s.id} className="flex items-start gap-3 p-3 border rounded-lg">
                <div className="text-sm font-medium text-primary min-w-[50px]">{s.start_time?.slice(0, 5) || "—"}</div>
                <div className="flex-1">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-sm text-muted-foreground">Responsável: {userMap.get(s.assigned_to || "") || "—"}</div>
                  {s.location && <div className="text-sm text-muted-foreground">Local: {s.location}</div>}
                </div>
                {getStatusBadge(s.status)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCalendarYear = () => {
    const yearStart = startOfYear(currentDate);
    const months = eachMonthOfInterval({ start: yearStart, end: endOfYear(currentDate) });
    return (
      <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
        {months.map((month) => {
          const mStart = startOfMonth(month);
          const mEnd = endOfMonth(month);
          const count = filtered.filter((s) => {
            const d = parseISO(s.scheduled_date);
            return d >= mStart && d <= mEnd;
          }).length;
          return (
            <button
              key={month.toISOString()}
              onClick={() => { setCurrentDate(month); setCalendarView("mes"); }}
              className="border rounded-lg p-4 text-center hover:bg-accent transition-colors"
            >
              <div className="font-medium capitalize">{format(month, "MMMM", { locale: ptBR })}</div>
              <div className="text-2xl font-bold text-primary mt-1">{count}</div>
              <div className="text-xs text-muted-foreground">agendamentos</div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Agenda</h1>
            <p className="text-muted-foreground">Gerencie seus agendamentos</p>
          </div>
          <Button onClick={() => { setEditItem(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Agendamento
          </Button>
        </div>

        {/* Toggle: Minhas agendas vs Criadas por mim */}
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="minhas">Minhas Agendas</TabsTrigger>
              <TabsTrigger value="criadas">Criadas por mim</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1 ml-auto border rounded-lg p-0.5">
            <Button variant={displayMode === "lista" ? "default" : "ghost"} size="sm" onClick={() => setDisplayMode("lista")}>
              <List className="h-4 w-4 mr-1" /> Lista
            </Button>
            <Button variant={displayMode === "calendario" ? "default" : "ghost"} size="sm" onClick={() => setDisplayMode("calendario")}>
              <Calendar className="h-4 w-4 mr-1" /> Calendário
            </Button>
          </div>
        </div>

        {/* Filters (list mode) */}
        {displayMode === "lista" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-60" />
            </div>
            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Cidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Cidades</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Responsáveis</SelectItem>
                {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Calendar navigation */}
        {displayMode === "calendario" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigateCalendar("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-medium capitalize min-w-[200px] text-center">{calendarTitle()}</span>
              <Button variant="outline" size="icon" onClick={() => navigateCalendar("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
            </div>
            <Tabs value={calendarView} onValueChange={(v) => setCalendarView(v as CalendarView)}>
              <TabsList>
                <TabsTrigger value="dia">Dia</TabsTrigger>
                <TabsTrigger value="semana">Semana</TabsTrigger>
                <TabsTrigger value="mes">Mês</TabsTrigger>
                <TabsTrigger value="ano">Ano</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : displayMode === "lista" ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum agendamento encontrado</TableCell></TableRow>
                ) : (
                  filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell>{format(parseISO(s.scheduled_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{s.start_time?.slice(0, 5) || "—"}</TableCell>
                      <TableCell>{getStatusBadge(s.status)}</TableCell>
                      <TableCell>{userMap.get(s.assigned_to || "") || "—"}</TableCell>
                      <TableCell className="max-w-[250px] truncate">{s.location || "—"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditItem(s); setDialogOpen(true); }}>
                              <Pencil className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(s.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <>
            {calendarView === "mes" && renderCalendarMonth()}
            {calendarView === "semana" && renderCalendarWeek()}
            {calendarView === "dia" && renderCalendarDay()}
            {calendarView === "ano" && renderCalendarYear()}
          </>
        )}
      </div>

      <ScheduleFormDialog open={dialogOpen} onOpenChange={setDialogOpen} schedule={editItem} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente excluir este agendamento?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteSchedule.mutate(deleteId); setDeleteId(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
