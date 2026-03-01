import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import LeadPipeline from "@/components/crm/LeadPipeline";
import { useState } from "react";
import LeadFormDialog from "@/components/crm/LeadFormDialog";

export default function Leads() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <AppLayout
      title="Leads"
      subtitle="Pipeline de oportunidades"
      actions={<Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo Lead</Button>}
    >
      <LeadPipeline />
      <LeadFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </AppLayout>
  );
}
