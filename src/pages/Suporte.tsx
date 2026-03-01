import AppLayout from "@/components/layout/AppLayout";
import { HelpCircle } from "lucide-react";

export default function Suporte() {
  return (
    <AppLayout title="Suporte" subtitle="Tickets de suporte">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
