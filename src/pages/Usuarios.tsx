import AppLayout from "@/components/layout/AppLayout";
import { UserCog } from "lucide-react";

export default function Usuarios() {
  return (
    <AppLayout title="Usuários" subtitle="Gestão de usuários">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <UserCog className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
