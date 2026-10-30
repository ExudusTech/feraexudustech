import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { planImageMatches, uploadProductImage, type ImageMatchPlan } from "@/lib/product-images";
import type { Product } from "@/hooks/use-products";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; products: Product[] }

export default function ImportImagesDialog({ open, onOpenChange, products }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [plan, setPlan] = useState<ImageMatchPlan<File> | null>(null);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: number; replaced: number; failed: string[] } | null>(null);

  const reset = () => { setPlan(null); setReplace(false); setProgress(null); setResult(null); };
  const close = (o: boolean) => { if (progress !== null && !result) return; if (!o) reset(); onOpenChange(o); };

  const pick = (files: FileList | null) => {
    if (!files) return;
    setResult(null);
    setPlan(planImageMatches(Array.from(files), products));
  };

  const run = async () => {
    if (!plan || !user?.organization_id) return;
    const jobs = [...plan.novos.map((j) => ({ ...j, replaced: false })), ...(replace ? plan.substituir.map((j) => ({ ...j, replaced: true })) : [])];
    let ok = 0, replaced = 0; const failed: string[] = [];
    setProgress(0);
    for (let i = 0; i < jobs.length; i++) {
      const { file, product } = jobs[i];
      try {
        const path = await uploadProductImage(user.organization_id, product, file);
        const { error } = await supabase.from("products").update({ image_url: path }).eq("id", product.id);
        if (error) throw error;
        if (jobs[i].replaced) replaced++; else ok++;
      } catch { failed.push(file.name); }
      setProgress(Math.round(((i + 1) / jobs.length) * 100));
    }
    setResult({ ok, replaced, failed });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product-image-urls"] });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar imagens em lote</DialogTitle>
          <DialogDescription>O nome de cada arquivo (sem extensão) deve ser o SKU do produto, ex.: NC-DIV-036.jpg.</DialogDescription>
        </DialogHeader>
        {!result && (
          <div className="space-y-4">
            <Input type="file" multiple accept=".jpg,.jpeg,.png,.webp" aria-label="Arquivos de imagem" onChange={(e) => pick(e.target.files)} disabled={progress !== null} />
            {plan && (
              <div className="space-y-2 text-sm">
                <p><strong>{plan.novos.length}</strong> imagens serão associadas a produtos sem imagem.</p>
                {plan.substituir.length > 0 && (
                  <label className="flex items-start gap-2 min-h-11">
                    <Checkbox checked={replace} onCheckedChange={(v) => setReplace(!!v)} />
                    <span>Substituir a imagem existente de <strong>{plan.substituir.length}</strong> produtos</span>
                  </label>
                )}
                {plan.semSku.length > 0 && (
                  <div>
                    <p><strong>{plan.semSku.length}</strong> arquivos sem SKU correspondente (serão ignorados):</p>
                    <p className="text-muted-foreground max-h-24 overflow-auto">{plan.semSku.map((f) => f.name).join(", ")}</p>
                  </div>
                )}
              </div>
            )}
            {progress !== null && <Progress value={progress} />}
          </div>
        )}
        {result && plan && (
          <div className="space-y-2 text-sm">
            <p><strong>{result.ok}</strong> imagens associadas.</p>
            {result.replaced > 0 && <p><strong>{result.replaced}</strong> imagens substituídas.</p>}
            {!replace && plan.substituir.length > 0 && <p>{plan.substituir.length} produtos mantiveram a imagem atual.</p>}
            {plan.semSku.length > 0 && (
              <div><p>Arquivos sem SKU correspondente ({plan.semSku.length}):</p>
                <p className="text-muted-foreground max-h-24 overflow-auto">{plan.semSku.map((f) => f.name).join(", ")}</p></div>
            )}
            {result.failed.length > 0 && <p className="text-destructive">Falharam: {result.failed.join(", ")}</p>}
          </div>
        )}
        <DialogFooter>
          {result ? <Button onClick={() => close(false)}>Fechar</Button> : (
            <Button onClick={run} disabled={!plan || progress !== null || (plan.novos.length === 0 && !(replace && plan.substituir.length))}>
              Importar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
