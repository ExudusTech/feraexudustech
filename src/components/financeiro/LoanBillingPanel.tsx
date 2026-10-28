import { useState } from "react";
import { Plus, Pencil, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEkkoaBilling, type EkkoaBilling } from "@/hooks/use-ekkoa-billing";
import EkkoaBillingFormDialog from "@/components/ekkoa/EkkoaBillingFormDialog";

const BRL = (v: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

/** Billing of loaned equipment (any manufacturer); lives in Financeiro, visible only to finance roles. */
export default function LoanBillingPanel({ search }: { search: string }) {
  const { data = [], isLoading } = useEkkoaBilling();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<EkkoaBilling | null>(null);
  const s = search.toLowerCase();
  const rows = data.filter((b) => [b.title, b.invoice_number, b.status].some((f) => f?.toLowerCase().includes(s)));
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={() => { setSelected(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo faturamento</Button></div>
      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground"><Receipt className="h-12 w-12" />Nenhum faturamento de comodato.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Título</TableHead><TableHead>Nota</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
          <TableBody>{rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.title}</TableCell>
              <TableCell>{b.invoice_number ?? "—"}</TableCell>
              <TableCell>{b.due_date ? new Date(b.due_date).toLocaleDateString("pt-BR") : "—"}</TableCell>
              <TableCell>{BRL(b.amount)}</TableCell>
              <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
              <TableCell><Button variant="ghost" size="icon" aria-label={`Editar ${b.title}`} onClick={() => { setSelected(b); setOpen(true); }}><Pencil className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></div>
      )}
      <EkkoaBillingFormDialog open={open} onOpenChange={setOpen} billing={selected} />
    </div>
  );
}
