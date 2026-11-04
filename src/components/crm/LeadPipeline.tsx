import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useLeads, useUpdateLead, type Lead } from "@/hooks/use-leads";
import { useLeadStages } from "@/components/settings/LeadStagesSettings";
import { buildColumns, TIPO_DOT, type PipelineColumn } from "@/lib/lead-pipeline";
import { useIsMobile } from "@/hooks/use-mobile";
import LeadCard from "./LeadCard";
import LeadFormDialog from "./LeadFormDialog";
import ConvertLeadDialog from "./ConvertLeadDialog";
import { isConversionStageTipo } from "@/lib/empresa-contatos";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export default function LeadPipeline() {
  const { data: leads = [], isLoading } = useLeads();
  const { data: stages = [], isLoading: loadingStages } = useLeadStages();
  const updateLead = useUpdateLead();
  const isMobile = useIsMobile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);

  const [searchParams] = useSearchParams();
  const linkedId = searchParams.get("lead");
  const openedId = useRef<string | null>(null);
  useEffect(() => {
    const lead = leads.find(item => item.id === linkedId);
    if (!lead || openedId.current === linkedId) return;
    openedId.current = linkedId;
    setSelectedLead(lead); setDialogOpen(true);
  }, [leads, linkedId]);

  const columns = useMemo(() => buildColumns(stages, leads), [stages, leads]);
  const activeStages = columns.filter(c => c.stage).map(c => c.stage!);

  const moveTo = (leadId: string, stageId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.stage_id === stageId) return;
    updateLead.mutate({ id: leadId, stage_id: stageId });
    const st = stages.find((s) => s.id === stageId);
    if (isConversionStageTipo(st?.tipo) && !lead.client_id) setConvertLead(lead);
  };
  const convertDialog = <ConvertLeadDialog leadId={convertLead?.id ?? null} nome={convertLead?.title} onOpenChange={(o) => !o && setConvertLead(null)} />;
  const open = (lead: Lead | null) => { setSelectedLead(lead); setDialogOpen(true); };

  if (isLoading || loadingStages) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const header = (col: PipelineColumn<Lead>, first: boolean) => {
    const total = col.leads.reduce((s, l) => s + (l.value || 0), 0);
    return (
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${col.stage ? TIPO_DOT[col.stage.tipo] ?? "bg-primary" : "bg-muted-foreground"}`}
              style={col.stage?.cor ? { backgroundColor: col.stage.cor } : undefined} />
            <h3 className="font-medium text-sm">{col.stage?.nome ?? "Sem etapa ativa"}</h3>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5" aria-label={`${col.leads.length} leads`}>{col.leads.length}</span>
          </div>
          {first && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Novo lead" onClick={() => open(null)}><Plus className="h-3.5 w-3.5" /></Button>}
        </div>
        {total > 0 && <p className="text-xs text-muted-foreground mt-1">{brl(total)}</p>}
      </div>
    );
  };

  const notFound = linkedId && !leads.some(item => item.id === linkedId) &&
    <p role="alert" className="mb-4 text-muted-foreground">Lead não encontrado ou sem permissão de acesso.</p>;

  if (isMobile) {
    return (
      <>
        {notFound}
        <div className="space-y-4">
          {columns.map((col, i) => (
            <section key={col.stage?.id ?? "orfaos"} className="rounded-lg bg-muted/30 border">
              {header(col, i === 0)}
              <div className="p-2 space-y-2">
                {col.leads.map(lead => (
                  <div key={lead.id} className="space-y-1">
                    <LeadCard lead={lead} onClick={() => open(lead)} />
                    <Select value={col.stage?.id ?? ""} onValueChange={(v) => moveTo(lead.id, v)}>
                      <SelectTrigger className="h-8 text-xs" aria-label={`Mover ${lead.title}`}><SelectValue placeholder="Mover para…" /></SelectTrigger>
                      <SelectContent>{activeStages.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
                {col.leads.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Nenhum lead</p>}
              </div>
            </section>
          ))}
        </div>
        <LeadFormDialog open={dialogOpen} onOpenChange={setDialogOpen} lead={selectedLead} />
        {convertDialog}
      </>
    );
  }

  return (
    <>
      {notFound}
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-max">
          {columns.map((col, i) => (
            <div key={col.stage?.id ?? "orfaos"} className="w-72 flex-shrink-0 rounded-lg bg-muted/30 border"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (draggedLeadId && col.stage) moveTo(draggedLeadId, col.stage.id); setDraggedLeadId(null); }}>
              {header(col, i === 0)}
              <div className="p-2 space-y-2 min-h-[120px]">
                {col.leads.map(lead => (
                  <LeadCard key={lead.id} lead={lead} onClick={() => open(lead)} draggable onDragStart={() => setDraggedLeadId(lead.id)} />
                ))}
                {col.leads.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Nenhum lead</p>}
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <LeadFormDialog open={dialogOpen} onOpenChange={setDialogOpen} lead={selectedLead} />
      {convertDialog}
    </>
  );
}
