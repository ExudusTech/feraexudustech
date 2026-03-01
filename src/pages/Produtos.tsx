import AppLayout from "@/components/layout/AppLayout";
import { Package } from "lucide-react";

export default function Produtos() {
  return (
    <AppLayout title="Produtos" subtitle="Catálogo de produtos">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p>Em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
