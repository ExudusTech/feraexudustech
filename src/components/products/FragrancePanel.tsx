import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEkkoaFragranceLines, type EkkoaFragranceLine } from "@/hooks/use-ekkoa-fragrance-lines";
import EkkoaFragranceLineFormDialog from "@/components/ekkoa/EkkoaFragranceLineFormDialog";

/** Fragrances are a variant/attribute of aromatization products, shown inside Produtos. */
export default function FragrancePanel({ canEdit }: { canEdit: boolean }) {
  const { data = [] } = useEkkoaFragranceLines();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<EkkoaFragranceLine | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Fragrâncias (variantes de aromatização)</CardTitle>
        {canEdit && <Button size="sm" variant="outline" onClick={() => { setSelected(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nova fragrância</Button>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma fragrância cadastrada.</p> : (
          <div className="flex flex-wrap gap-2">{data.map((f) => (
            <Badge key={f.id} variant={f.is_active ? "secondary" : "outline"} className="gap-1 py-1">
              {f.name}{f.intensity ? ` · ${f.intensity}` : ""}
              {canEdit && <button type="button" aria-label={`Editar ${f.name}`} className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center" onClick={() => { setSelected(f); setOpen(true); }}><Pencil className="h-3 w-3" /></button>}
            </Badge>
          ))}</div>
        )}
      </CardContent>
      <EkkoaFragranceLineFormDialog open={open} onOpenChange={setOpen} fragrance={selected} />
    </Card>
  );
}
