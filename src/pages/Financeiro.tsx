import AppLayout from "@/components/layout/AppLayout";
import { DollarSign } from "lucide-react";

export default function Financeiro() {
  return (
    <AppLayout title="Financeiro" subtitle="Controle financeiro">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
