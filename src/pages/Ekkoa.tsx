import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Leaf, Users, Target, Calendar, Package } from "lucide-react";
import StatsCard from "@/components/cards/StatsCard";

export default function Ekkoa() {
  return (
    <AppLayout title="Ekkoa" subtitle="Gestão de operações Ekkoa">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Leads Ekkoa" value="0" icon={Target} variant="accent" />
          <StatsCard title="Clientes Ekkoa" value="0" icon={Users} variant="primary" />
          <StatsCard title="Operações Ativas" value="0" icon={Leaf} variant="success" />
          <StatsCard title="Agendamentos" value="0" icon={Calendar} variant="warning" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Operações Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Módulo Ekkoa será construído na próxima etapa.
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inventário</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                <Package className="h-8 w-8 text-muted-foreground/40 mr-2" />
                Em breve
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
