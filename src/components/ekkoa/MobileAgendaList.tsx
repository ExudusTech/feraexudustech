import { useMemo, useState } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MapPin, Phone, MessageCircle, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/hooks/use-schedules";
import { fromNotes, mapsLink, normalizePhoneBR, serviceKind } from "@/lib/service-kind";

interface LeadInfo { title: string; contact_phone?: string | null; maps_url?: string | null; whatsapp?: string | null }

interface Props {
  schedules: Schedule[];
  leads: Map<string, LeadInfo>;
  onOpen: (s: Schedule) => void;
}

/** Phone view: today/tomorrow visits sorted by time with large action buttons. */
export default function MobileAgendaList({ schedules, leads, onOpen }: Props) {
  const [day, setDay] = useState<"hoje" | "amanha">("hoje");
  const target = day === "hoje" ? new Date() : addDays(new Date(), 1);
  const items = useMemo(
    () => schedules
      .filter((s) => s.status !== "cancelado" && isSameDay(parseISO(s.scheduled_date), target))
      .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedules, day],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(["hoje", "amanha"] as const).map((d) => (
          <button key={d} role="tab" aria-selected={day === d} onClick={() => setDay(d)}
            className={cn("min-h-11 rounded-lg border text-base font-semibold", day === d ? "bg-primary text-primary-foreground border-primary" : "bg-card")}>
            {d === "hoje" ? "Hoje" : "Amanhã"}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground capitalize">{format(target, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
      {items.length === 0 && <p className="text-muted-foreground py-6 text-center">Nenhuma visita {day === "hoje" ? "hoje" : "amanhã"}.</p>}
      {items.map((s) => {
        const lead = s.lead_id ? leads.get(s.lead_id) : undefined;
        const phone = normalizePhoneBR(lead?.contact_phone || lead?.whatsapp || fromNotes(s.notes, "Telefone"));
        const map = lead?.maps_url || fromNotes(s.notes, "Mapa") || mapsLink(s.location);
        return (
          <article key={s.id} className="rounded-xl border bg-card p-4 space-y-3">
            <button onClick={() => onOpen(s)} className="w-full text-left space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xl font-bold text-primary">{s.start_time?.slice(0, 5) || "--:--"}</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  <Badge variant="secondary">{serviceKind(s.schedule_type, s.schedule_subtype)}</Badge>
                  {s.source === "flora" && <Badge variant="outline">Flora</Badge>}
                </div>
              </div>
              <p className="text-base font-semibold">{lead?.title || s.title}</p>
              {s.location && <p className="text-sm text-muted-foreground flex gap-1"><MapPin className="h-4 w-4 shrink-0 mt-0.5" />{s.location}</p>}
            </button>
            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="outline" className="min-h-12 flex-col gap-0.5 text-xs" disabled={!map}>
                {map ? <a href={map} target="_blank" rel="noopener noreferrer"><Navigation className="h-5 w-5" />Maps</a> : <span className="opacity-50"><Navigation className="h-5 w-5" />Maps</span>}
              </Button>
              <Button asChild variant="outline" className="min-h-12 flex-col gap-0.5 text-xs">
                {phone ? <a href={`tel:+${phone}`}><Phone className="h-5 w-5" />Ligar</a> : <span className="opacity-50"><Phone className="h-5 w-5" />Ligar</span>}
              </Button>
              <Button asChild variant="outline" className="min-h-12 flex-col gap-0.5 text-xs">
                {phone ? <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-5 w-5" />WhatsApp</a> : <span className="opacity-50"><MessageCircle className="h-5 w-5" />WhatsApp</span>}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
