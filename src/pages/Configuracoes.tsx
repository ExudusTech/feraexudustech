import AppLayout from "@/components/layout/AppLayout";
import { Settings } from "lucide-react";

export default function Configuracoes() {
  return (
    <AppLayout title="Configurações" subtitle="Ajustes do sistema">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <Settings className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
