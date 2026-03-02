import { AlertTriangle, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { Operation } from "@/hooks/use-operations";

interface Props {
  operations: Operation[];
  onSelect: (op: Operation) => void;
}

export default function ExpiringTestsAlert({ operations, onSelect }: Props) {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const expiring = operations.filter((op) => {
    if (op.status !== "em_andamento" || !op.end_date) return false;
    const end = new Date(op.end_date);
    return end <= threeDaysFromNow && end >= now;
  });

  const expired = operations.filter((op) => {
    if (op.status !== "em_andamento" || !op.end_date) return false;
    return new Date(op.end_date) < now;
  });

  if (expiring.length === 0 && expired.length === 0) return null;

  return (
    <div className="space-y-2">
      {expired.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Testes Expirados ({expired.length})</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              {expired.map((op) => (
                <Badge
                  key={op.id}
                  variant="destructive"
                  className="cursor-pointer hover:opacity-80"
                  onClick={() => onSelect(op)}
                >
                  {op.title} — expirou em {new Date(op.end_date!).toLocaleDateString("pt-BR")}
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
      {expiring.length > 0 && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertTitle>Testes Expirando em Breve ({expiring.length})</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              {expiring.map((op) => {
                const daysLeft = Math.ceil((new Date(op.end_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <Badge
                    key={op.id}
                    variant="secondary"
                    className="cursor-pointer hover:opacity-80"
                    onClick={() => onSelect(op)}
                  >
                    {op.title} — {daysLeft} dia{daysLeft !== 1 ? "s" : ""} restante{daysLeft !== 1 ? "s" : ""}
                  </Badge>
                );
              })}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
