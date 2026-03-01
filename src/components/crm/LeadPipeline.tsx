import { useState, useMemo } from "react";
import { useLeads, useUpdateLead, PIPELINE_STAGES, STAGE_CONFIG, type Lead, type LeadStage } from "@/hooks/use-leads";
import LeadCard from "./LeadCard";
import LeadFormDialog from "./LeadFormDialog";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export default function LeadPipeline() {
  const { data: leads = [], isLoading } = useLeads();
  const updateLead = useUpdateLead();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<LeadStage>("novo");
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<LeadStage, Lead[]> = {} as any;
    PIPELINE_STAGES.forEach((s) => (map[s] = []));
    leads.forEach((l) => map[l.stage]?.push(l));
    return map;
  }, [leads]);

  const handleDrop = (stage: LeadStage) => {
    if (!draggedLeadId) return;
    const lead = leads.find((l) => l.id === draggedLeadId);
    if (lead && lead.stage !== stage) {
      updateLead.mutate({ id: draggedLeadId, stage });
    }
    setDraggedLeadId(null);
  };

  const stageTotal = (stage: LeadStage) =>
    grouped[stage].reduce((sum, l) => sum + (l.value || 0), 0);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <>
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-max">
          {PIPELINE_STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const total = stageTotal(stage);
            const formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total);

            return (
              <div
                key={stage}
                className="w-72 flex-shrink-0 rounded-lg bg-muted/30 border"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(stage)}
              >
                <div className="p-3 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
                      <span className="font-medium text-sm">{config.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                        {grouped[stage].length}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => { setDefaultStage(stage); setSelectedLead(null); setDialogOpen(true); }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {total > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{formatted}</p>
                  )}
                </div>
                <div className="p-2 space-y-2 min-h-[120px]">
                  {grouped[stage].map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onClick={() => { setSelectedLead(lead); setDialogOpen(true); }}
                      draggable
                      onDragStart={() => setDraggedLeadId(lead.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <LeadFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={selectedLead}
        defaultStage={defaultStage}
      />
    </>
  );
}
