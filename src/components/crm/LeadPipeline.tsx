import { useState, useMemo } from "react";
import {
  useLeads, useUpdateLead,
  MACRO_PIPELINE, MACRO_STAGES, STAGE_CONFIG,
  getMacroStage, getDefaultStageForMacro,
  type Lead, type LeadStage, type MacroStage,
} from "@/hooks/use-leads";
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

  // Group leads by macro stage
  const grouped = useMemo(() => {
    const map: Record<MacroStage, Lead[]> = { novo: [], qualificacao: [], ganho: [], perda: [] };
    leads.forEach((l) => {
      const macro = getMacroStage(l.stage);
      map[macro]?.push(l);
    });
    return map;
  }, [leads]);

  const handleDrop = (macro: MacroStage) => {
    if (!draggedLeadId) return;
    const lead = leads.find((l) => l.id === draggedLeadId);
    if (lead) {
      const currentMacro = getMacroStage(lead.stage);
      if (currentMacro !== macro) {
        const newStage = getDefaultStageForMacro(macro);
        updateLead.mutate({ id: draggedLeadId, stage: newStage });
      }
    }
    setDraggedLeadId(null);
  };

  const macroTotal = (macro: MacroStage) =>
    grouped[macro].reduce((sum, l) => sum + (l.value || 0), 0);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <>
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-max">
          {MACRO_STAGES.map((macro) => {
            const config = MACRO_PIPELINE[macro];
            const total = macroTotal(macro);
            const formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total);
            const columnLeads = grouped[macro];

            // Group leads by sub-stage within this macro column
            const subGroups = config.stages
              .map((stage) => ({
                stage,
                stageConfig: STAGE_CONFIG[stage],
                leads: columnLeads.filter((l) => l.stage === stage),
              }))
              .filter((sg) => sg.leads.length > 0 || config.stages.length > 1);

            return (
              <div
                key={macro}
                className="w-80 flex-shrink-0 rounded-lg bg-muted/30 border"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(macro)}
              >
                {/* Macro header */}
                <div className="p-3 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
                      <span className="font-medium text-sm">{config.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                        {columnLeads.length}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        setDefaultStage(getDefaultStageForMacro(macro));
                        setSelectedLead(null);
                        setDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {total > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{formatted}</p>
                  )}
                </div>

                {/* Cards grouped by sub-stage */}
                <div className="p-2 space-y-1 min-h-[120px]">
                  {config.stages.length > 1 ? (
                    // Show sub-stage sections
                    config.stages.map((stage) => {
                      const stageLeads = columnLeads.filter((l) => l.stage === stage);
                      if (stageLeads.length === 0) return null;
                      const sc = STAGE_CONFIG[stage];
                      return (
                        <div key={stage} className="mb-2">
                          <div className="flex items-center gap-1.5 px-1 py-1">
                            <div className={`h-1.5 w-1.5 rounded-full ${sc.color}`} />
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                              {sc.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">({stageLeads.length})</span>
                          </div>
                          <div className="space-y-2">
                            {stageLeads.map((lead) => (
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
                    })
                  ) : (
                    // Single stage — no sub-headers
                    columnLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        onClick={() => { setSelectedLead(lead); setDialogOpen(true); }}
                        draggable
                        onDragStart={() => setDraggedLeadId(lead.id)}
                      />
                    ))
                  )}
                  {columnLeads.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Nenhum lead</p>
                  )}
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
