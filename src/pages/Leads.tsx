import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Target } from "lucide-react";

export default function Leads() {
  return (
    <AppLayout
      title="Leads"
      subtitle="Pipeline de oportunidades"
      actions={<Button><Plus className="h-4 w-4 mr-2" />Novo Lead</Button>}
    >
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <Target className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Módulo de Leads será construído em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
