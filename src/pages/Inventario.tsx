import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { usePermissions } from "@/hooks/use-permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InstalledBasePanel from "@/components/inventario/InstalledBasePanel";
import EstoquePanel from "@/components/inventario/EstoquePanel";

/** Inventory: installed base at clients and device stock (products.stock; the legacy inventory_items list is no longer shown). */
export default function Inventario() {
  const { canAccessRoute } = usePermissions();
  return (
    <AppLayout
      title="Inventário"
      subtitle="Base instalada nos clientes e aparelhos em estoque"
      actions={canAccessRoute("/equipamentos") ? <Button variant="outline" asChild><Link to="/equipamentos">Modelos de equipamento</Link></Button> : undefined}
    >
      <Tabs defaultValue="base">
        <TabsList className="mb-4"><TabsTrigger value="base">Base instalada</TabsTrigger><TabsTrigger value="estoque">Estoque</TabsTrigger></TabsList>
        <TabsContent value="base"><InstalledBasePanel /></TabsContent>
        <TabsContent value="estoque"><EstoquePanel /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
