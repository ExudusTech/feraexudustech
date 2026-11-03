import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/layout/AppLayout";
import PainelAgora from "@/components/atendimentos/PainelAgora";
import MobileAgendaList from "@/components/ekkoa/MobileAgendaList";
import VisitExecutionDialog from "@/components/agenda/VisitExecutionDialog";
import { useSchedules, type Schedule } from "@/hooks/use-schedules";
import { useLeads } from "@/hooks/use-leads";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";
import NovaManutencaoDialog from "@/components/agenda/NovaManutencaoDialog";
import LevarProximaVisita from "@/components/agenda/LevarProximaVisita";

/** Consultant's day: own visits in time order with Route/Call/WhatsApp and Start/Finish. */
export default function Hoje() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: schedules = [] } = useSchedules();
  const { data: leads = [] } = useLeads();
  const [selected, setSelected] = useState<string | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const mine = useMemo(() => schedules.filter((s) => s.assigned_to === user?.id || (!s.assigned_to && s.created_by === user?.id)), [schedules, user?.id]);
  const leadInfo = useMemo(() => {
    const map = new Map<string, { title: string; contact_phone?: string | null; maps_url?: string | null; whatsapp?: string | null }>();
    leads.forEach((l: any) => map.set(l.id, { title: l.empresa_nome || l.company || l.title, contact_phone: l.contact_phone, maps_url: l.maps_url, whatsapp: l.pessoa?.whatsapp }));
    return map;
  }, [leads]);
  useEffect(() => {
    if (!user?.organization_id) return;
    const ch = supabase.channel(`hoje-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules", filter: `organization_id=eq.${user.organization_id}` },
        () => qc.invalidateQueries({ queryKey: ["schedules"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.organization_id, qc]);
  const current: Schedule | null = schedules.find((s) => s.id === selected) ?? null;
  return (
    <AppLayout title="Hoje" subtitle="Suas visitas do dia">
      <div className="space-y-4 max-w-xl">
        <PainelAgora compact />
        <Button className="w-full min-h-12" variant="outline" onClick={() => setNovaOpen(true)}><Wrench className="h-4 w-4" />Nova visita de manutenção</Button>
        <LevarProximaVisita />
        <MobileAgendaList todayOnly schedules={mine} leads={leadInfo} onOpen={(s) => setSelected(s.id)} onExecute={(s) => setSelected(s.id)} />
      </div>
      <VisitExecutionDialog open={!!current} onOpenChange={(o) => !o && setSelected(null)} schedule={current}
        clientName={current?.lead_id ? leadInfo.get(current.lead_id)?.title : (current as any)?.clients?.name ?? current?.title} />
      <NovaManutencaoDialog open={novaOpen} onOpenChange={setNovaOpen} onCreated={async (id) => { await qc.refetchQueries({ queryKey: ["schedules"] }); setSelected(id); }} />
    </AppLayout>
  );
}
