import AppLayout from "@/components/layout/AppLayout";
import { MapPin } from "lucide-react";

export default function AreasCobertura() {
  return (
    <AppLayout title="Áreas de Cobertura" subtitle="Gestão regional">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
