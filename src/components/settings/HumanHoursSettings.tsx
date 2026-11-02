import { useEffect, useMemo, useState } from "react";
import { useOrganization, useUpdateOrganization } from "@/hooks/use-organizations";
import { usePermissions } from "@/hooks/use-permissions";
import { useHumanService } from "@/hooks/use-human-service";
import { estaEmHorario, normalizeHumanHours, proximoHorarioUtil } from "@/lib/business-hours";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Clock, CalendarOff } from "lucide-react";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function HumanHoursSettings() {
  const { data: org } = useOrganization();
  const update = useUpdateOrganization();
  const { isAdmin } = usePermissions();
  const { closed, city, holidays } = useHumanService();
  const o = (org ?? {}) as Record<string, any>;
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("18:00");
  const [urgent, setUrgent] = useState(false);
  const [facultativo, setFacultativo] = useState(true);
  const [amarelo, setAmarelo] = useState("15");
  const [vermelho, setVermelho] = useState("60");

  useEffect(() => {
    if (!org) return;
    const cfg = normalizeHumanHours(o.human_hours, o.human_timezone);
    setDays(cfg.days); setStart(cfg.start); setEnd(cfg.end);
    setUrgent(o.human_urgent_bypass === true); setFacultativo(o.ponto_facultativo_util !== false);
    setAmarelo(String(o.atendimento_alerta_amarelo_min ?? 15)); setVermelho(String(o.atendimento_alerta_vermelho_min ?? 60));
  }, [org]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = normalizeHumanHours({ days, start, end }, o.human_timezone);
  const preview = useMemo(() => {
    const now = new Date();
    if (estaEmHorario(now, draft, closed, city)) return "Já passei sua solicitação para nossa equipe, que vai te responder por aqui em breve.";
    return `Nossa equipe de atendimento retoma ${proximoHorarioUtil(now, draft, closed, city).labelComArtigo}. Já deixei sua solicitação registrada e ela será a primeira a ser encaminhada nesse horário. 😊`;
  }, [draft.days.join(), draft.start, draft.end, closed, city]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = holidays.filter((h) => h.date >= today).slice(0, 12);
  const a = Math.max(1, parseInt(amarelo, 10) || 15);
  const v = Math.max(a + 1, parseInt(vermelho, 10) || 60);

  const save = () => {
    if (!org) return;
    update.mutate({ id: org.id, human_hours: { days, start, end }, human_urgent_bypass: urgent, ponto_facultativo_util: facultativo,
      atendimento_alerta_amarelo_min: a, atendimento_alerta_vermelho_min: v } as any);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Horário de atendimento humano</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">A Flora atende 24h. Transferências, Matriz e cobranças de retorno seguem este horário; fora dele o aviso à equipe espera a próxima abertura.</p>
          <div className="space-y-2">
            <Label>Dias</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((label, d) => (
                <Button key={d} type="button" size="sm" variant={days.includes(d) ? "default" : "outline"} disabled={!isAdmin}
                  className="min-h-11 min-w-12" aria-pressed={days.includes(d)}
                  onClick={() => setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort())}>{label}</Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="space-y-1.5"><Label htmlFor="hh-start">Início</Label><Input id="hh-start" type="time" value={start} disabled={!isAdmin} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="hh-end">Fim</Label><Input id="hh-end" type="time" value={end} disabled={!isAdmin} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="flex items-start justify-between gap-4 max-w-xl">
            <div><Label htmlFor="hh-urgent">Urgência alta avisa na hora, mesmo fora do horário</Label><p className="text-xs text-muted-foreground">Desligado: urgência alta também espera a abertura.</p></div>
            <Switch id="hh-urgent" checked={urgent} onCheckedChange={setUrgent} disabled={!isAdmin} />
          </div>
          <div className="flex items-start justify-between gap-4 max-w-xl">
            <div><Label htmlFor="hh-fac">Ponto facultativo é dia útil</Label><p className="text-xs text-muted-foreground">Vale quando os feriados passarem a vir do Google Agenda.</p></div>
            <Switch id="hh-fac" checked={facultativo} onCheckedChange={setFacultativo} disabled={!isAdmin} />
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="space-y-1.5"><Label htmlFor="hh-y">Amarelo após (min)</Label><Input id="hh-y" inputMode="numeric" value={amarelo} disabled={!isAdmin} onChange={(e) => setAmarelo(e.target.value.replace(/\D/g, ""))} /></div>
            <div className="space-y-1.5"><Label htmlFor="hh-r">Vermelho após (min)</Label><Input id="hh-r" inputMode="numeric" value={vermelho} disabled={!isAdmin} onChange={(e) => setVermelho(e.target.value.replace(/\D/g, ""))} /></div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="text-muted-foreground mb-1">Se alguém pedir atendimento agora, a Flora responde:</p>
            <p>“{preview}”</p>
          </div>
          {isAdmin && <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Salvando..." : "Salvar horário"}</Button>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5 text-primary" />Próximos feriados</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Por enquanto vêm do calendário atual do sistema. Passarão a vir do Google Agenda da Flora quando a conexão for feita.</p>
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum feriado futuro cadastrado.</p> : (
            <ul className="divide-y divide-border text-sm">
              {upcoming.map((h) => (
                <li key={`${h.date}-${h.name}`} className="py-2 flex justify-between gap-3">
                  <span>{h.name}{h.city ? ` — ${h.city}` : ""}</span>
                  <span className="text-muted-foreground tabular-nums">{new Date(`${h.date}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
