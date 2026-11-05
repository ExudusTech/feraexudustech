import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/layout/AppLayout";
import PainelAgora from "@/components/atendimentos/PainelAgora";
import MobileAgendaList from "@/components/ekkoa/MobileAgendaList";
import { openVisitFromSession, rememberOpenVisit } from "@/lib/visit-draft";
import VisitExecutionDialog from "@/components/agenda/VisitExecutionDialog";
import { useSchedules, type Schedule } from "@/hooks/use-schedules";
import { useLeads } from "@/hooks/use-leads";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { temPendenciaColeta } from "@/lib/coleta";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";
import NovaManutencaoDialog from "@/components/agenda/NovaManutencaoDialog";
import LevarProximaVisita from "@/components/agenda/LevarProximaVisita";
import SepararMaterial from "@/components/inventario/SepararMaterial";
import { useOrganizationUsers } from "@/hooks/use-users";
import { format } from "date-fns";
import { isMine, pendentesAnteriores, porConsultor } from "@/lib/hoje";

/** Consultant's day: own visits in time order with Route/Call/WhatsApp and Start/Finish. */
export default function Hoje() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: schedules = [] } = useSchedules();
  const { data: leads = [] } = useLeads();
  const [selected, setSelectedRaw] = useState<string | null>(() => openVisitFromSession());
  const setSelected = (id: string | null) => { rememberOpenVisit(id); setSelectedRaw(id); };
  const [novaOpen, setNovaOpen] = useState(false);
  const { data: users = [] } = useOrganizationUsers();
  const gestor = (user?.roles ?? [user?.role ?? ""]).some((r) => ["admin", "gestor", "super_admin"].includes(r));
  const [escopo, setEscopo] = useState<"minhas" | "equipe">("minhas");
  const equipe = gestor && escopo === "equipe";
  const today = format(new Date(), "yyyy-MM-dd");
  const visiveis = useMemo(() => equipe ? schedules : schedules.filter((s) => isMine(s, user?.id)), [schedules, user?.id, equipe]);
  const pendentes = useMemo(() => pendentesAnteriores(visiveis, today), [visiveis, today]);
  const infoPendente = useMemo(() => visiveis.filter((s: any) => temPendenciaColeta(s)), [visiveis]);
  const grupos = useMemo(() => porConsultor(visiveis.filter((s) => s.scheduled_date === today && s.status !== "cancelado"),
    new Map(users.map((u: any) => [u.user_id, u.name]))), [visiveis, today, users]);
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
    <AppLayout title="Hoje" subtitle={equipe ? "Visitas da equipe hoje" : "Suas visitas do dia"}>
      <div className="space-y-4 max-w-xl">
        <PainelAgora compact />
        <Button className="w-full min-h-12" variant="outline" onClick={() => setNovaOpen(true)}><Wrench className="h-4 w-4" />Nova visita de manutenção</Button>
        <LevarProximaVisita />
        <SepararMaterial onlyMine={!equipe} />
        {gestor && <div className="grid grid-cols-2 gap-2" role="tablist">{(["minhas", "equipe"] as const).map((k) => (
          <Button key={k} role="tab" aria-selected={escopo === k} variant={escopo === k ? "default" : "outline"} className="min-h-11" onClick={() => setEscopo(k)}>
            {k === "minhas" ? "Minhas" : "Equipe"}</Button>))}</div>}
        {infoPendente.length > 0 && <section className="space-y-2" aria-label="Informações pendentes">
          <h2 className="font-semibold text-warning">Realizadas — informações pendentes ({infoPendente.length})</h2>
          {infoPendente.map((s: any) => (
            s.coleta_status === "confirmada" ? (
              <div key={s.id} className="rounded-lg border border-warning p-3 space-y-2">
                <p className="text-sm font-medium">#{s.ocorrencia_codigo} · {(s.lead_id ? leadInfo.get(s.lead_id)?.title : s.title) ?? s.title}</p>
                <p className="text-xs text-muted-foreground">Sem horário livre na rota: agende manualmente na Agenda.</p>
                {(s.coleta_pendencias ?? []).map((item: string) => (
                  <div key={item} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{item}</span>
                    <Button size="sm" variant="outline" className="min-h-10" onClick={async () => {
                      await supabase.functions.invoke("coleta-ocorrencia", { body: { id: s.id, action: "resolver_agendar", item } });
                      qc.invalidateQueries({ queryKey: ["schedules"] });
                    }}>Já agendei</Button>
                  </div>))}
              </div>
            ) : (
            <button key={s.id} type="button" onClick={() => setSelected(s.id)} className="w-full text-left rounded-lg border border-warning p-3 space-y-1">
              <p className="text-sm font-medium">#{s.ocorrencia_codigo} · {(s.lead_id ? leadInfo.get(s.lead_id)?.title : s.title) ?? s.title}</p>
              <p className="text-xs text-muted-foreground">Falta: {(s.coleta_pendencias ?? []).join(" / ") || "confirmar a coleta"}</p>
            </button>)))}
        </section>}
        {pendentes.length > 0 && <section className="space-y-2">
          <h2 className="font-semibold text-warning">Em andamento / pendentes ({pendentes.length})</h2>
          <p className="text-xs text-muted-foreground">Visitas de dias anteriores que ainda não foram encerradas.</p>
          <MobileAgendaList noDateFilter schedules={pendentes} leads={leadInfo} onOpen={(s) => setSelected(s.id)} onExecute={(s) => setSelected(s.id)} />
        </section>}
        {equipe ? (grupos.length === 0 ? <p className="text-muted-foreground py-6 text-center">Nenhuma visita da equipe hoje.</p> :
          grupos.map((g) => (<section key={g.id || "none"} className="space-y-2">
            <h2 className="font-semibold">{g.nome} <span className="text-muted-foreground font-normal">({g.itens.length})</span></h2>
            <MobileAgendaList todayOnly schedules={g.itens} leads={leadInfo} onOpen={(s) => setSelected(s.id)} onExecute={(s) => setSelected(s.id)} />
          </section>)))
          : <MobileAgendaList todayOnly schedules={visiveis} leads={leadInfo} onOpen={(s) => setSelected(s.id)} onExecute={(s) => setSelected(s.id)} />}
      </div>
      <VisitExecutionDialog open={!!current} onOpenChange={(o) => !o && setSelected(null)} schedule={current}
        clientName={current?.lead_id ? leadInfo.get(current.lead_id)?.title : (current as any)?.clients?.name ?? current?.title} />
      <NovaManutencaoDialog open={novaOpen} onOpenChange={setNovaOpen} onCreated={async (id) => { await qc.refetchQueries({ queryKey: ["schedules"] }); setSelected(id); }} />
    </AppLayout>
  );
}
