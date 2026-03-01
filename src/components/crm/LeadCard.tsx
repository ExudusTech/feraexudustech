import { Lead } from "@/hooks/use-leads";
import { Card } from "@/components/ui/card";
import { GripVertical, DollarSign, Calendar, User } from "lucide-react";

interface Props {
  lead: Lead;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

export default function LeadCard({ lead, onClick, draggable, onDragStart }: Props) {
  const formattedValue = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(lead.value || 0);

  return (
    <Card
      className="p-3 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-primary/40 group"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 mt-0.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-medium text-sm truncate">{lead.title}</p>
          {lead.value > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              <span>{formattedValue}</span>
            </div>
          )}
          {lead.contact_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span className="truncate">{lead.contact_name}</span>
            </div>
          )}
          {lead.expected_close_date && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{new Date(lead.expected_close_date).toLocaleDateString("pt-BR")}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
