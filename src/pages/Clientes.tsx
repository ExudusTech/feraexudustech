import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";

export default function Clientes() {
  return (
    <AppLayout
      title="Clientes"
      subtitle="Gerencie sua base de clientes"
      actions={<Button><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>}
    >
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Módulo de Clientes será construído em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
