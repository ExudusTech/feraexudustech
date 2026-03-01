import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOperations, useUpdateOperation, STATUS_CONFIG, type Operation, type OperationStatus } from "@/hooks/use-operations";
import { Loader2 } from "lucide-react";

const KANBAN_COLUMNS: OperationStatus[] = ["pendente", "em_andamento", "concluida", "cancelada"];

interface Props {
  onEdit: (op: Operation) => void;
}

export default function OperationsKanban({ onEdit }: Props) {
  const { data: operations = [], isLoading } = useOperations();
  const update = useUpdateOperation();

  const handleDrop = (e: React.DragEvent, status: OperationStatus) => {
    e.preventDefault();
    const opId = e.dataTransfer.getData("text/plain");
    if (opId) {
      update.mutate({ id: opId, status });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="grid grid-cols-4 gap-4 h-[calc(100vh-280px)]">
      {KANBAN_COLUMNS.map((status) => {
        const config = STATUS_CONFIG[status];
        const items = operations.filter((o) => o.status === status);

        return (
          <div
            key={status}
            className="flex flex-col rounded-lg border bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className="flex items-center gap-2 p-3 border-b">
              <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
              <span className="font-medium text-sm">{config.label}</span>
              <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-2">
                {items.map((op) => (
                  <Card
                    key={op.id}
                    className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", op.id)}
                    onClick={() => onEdit(op)}
                  >
                    <p className="font-medium text-sm truncate">{op.title}</p>
                    {op.location && <p className="text-xs text-muted-foreground mt-1 truncate">{op.location}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={op.priority === "alta" || op.priority === "urgente" ? "destructive" : "secondary"} className="text-xs">
                        {op.priority}
                      </Badge>
                      {op.start_date && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(op.start_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">Nenhuma operação</p>
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}
