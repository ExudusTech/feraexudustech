import AppLayout from "@/components/layout/AppLayout";
import { BarChart3 } from "lucide-react";

export default function Relatorios() {
  return (
    <AppLayout title="Relatórios" subtitle="Análises e relatórios">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
