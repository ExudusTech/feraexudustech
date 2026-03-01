import AppLayout from "@/components/layout/AppLayout";
import { FileText } from "lucide-react";

export default function Propostas() {
  return (
    <AppLayout title="Propostas" subtitle="Gestão de propostas comerciais">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
