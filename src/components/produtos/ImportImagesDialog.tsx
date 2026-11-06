import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, FolderOpen, ImagePlus, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  ALLOWED_IMAGE_EXT, BLOCKING_WARNINGS, WARNING_LABEL, buildImagePreview, fileExt, removeProductImage, uploadProductImage,
  type ImagePreviewItem,
} from "@/lib/product-images";
import type { Product } from "@/hooks/use-products";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; products: Product[] }
interface Loaded { file: File; url: string; width: number; height: number; ok: boolean }

const isImageName = (n: string) => ALLOWED_IMAGE_EXT.includes(fileExt(n));

/** Reads natural dimensions; the object URL doubles as the card thumbnail. */
function loadImage(file: File): Promise<Loaded> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ file, url, width: img.naturalWidth, height: img.naturalHeight, ok: img.naturalWidth > 0 });
    img.onerror = () => resolve({ file, url, width: 0, height: 0, ok: false });
    img.src = url;
  });
}

/** Desktop drag-and-drop: walks dropped folders recursively. */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? []).map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return Array.from(dt.files ?? []);
  const out: File[] = [];
  const walk = async (entry: any): Promise<void> => {
    if (entry.isFile) { out.push(await new Promise<File>((res, rej) => entry.file(res, rej))); return; }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

export default function ImportImagesDialog({ open, onOpenChange, products }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [reading, setReading] = useState(false);
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: number; replaced: number; envio: number; failed: string[] } | null>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);

  const revoke = () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); urlsRef.current = []; };
  useEffect(() => revoke, []);
  useEffect(() => { folderRef.current?.setAttribute("webkitdirectory", ""); }, [open]);

  const reset = () => { revoke(); setLoaded([]); setReplace(new Set()); setProgress(null); setResult(null); };
  const busy = progress !== null && !result;
  const close = (o: boolean) => { if (busy) return; if (!o) reset(); onOpenChange(o); };

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => isImageName(f.name) || f.type.startsWith("image/"));
    if (!imgs.length) return;
    setResult(null); setProgress(null); setReading(true);
    try {
      const next = await Promise.all(imgs.map(loadImage));
      urlsRef.current.push(...next.map((n) => n.url));
      setLoaded((prev) => [...prev, ...next]);
    } finally { setReading(false); }
  };

  const byFile = new Map(loaded.map((l) => [l.file, l]));
  const items: ImagePreviewItem<File>[] = buildImagePreview(loaded.map((l) => l.file), products, (f) => {
    const l = byFile.get(f); return l?.ok ? { width: l.width, height: l.height } : null;
  });
  const included = (it: ImagePreviewItem<File>) =>
    !!it.product && !it.warnings.some((w) => BLOCKING_WARNINGS.includes(w)) && (!it.product.image_url || replace.has(it.product.id));
  const jobs = items.filter(included);
  const toggleReplace = (id: string, v: boolean) => setReplace((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });

  const run = async () => {
    if (!jobs.length || !user?.organization_id) return;
    let ok = 0, replaced = 0, envio = 0; const failed: string[] = [];
    setProgress(0);
    for (let i = 0; i < jobs.length; i++) {
      const it = jobs[i]; const product = it.product!;
      try {
        const path = await uploadProductImage(user.organization_id, product, it.file);
        const { error } = await supabase.from("products")
          .update({ image_url: path, pode_enviar_foto_cliente: it.podeEnviar }).eq("id", product.id);
        if (error) throw error;
        if (product.image_url && product.image_url !== path) await removeProductImage(product.image_url).catch(() => undefined);
        if (product.image_url) replaced++; else ok++;
        if (it.podeEnviar) envio++;
      } catch { failed.push(it.file.name); }
      setProgress(Math.round(((i + 1) / jobs.length) * 100));
    }
    setResult({ ok, replaced, envio, failed });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product-image-urls"] });
  };

  const ignorados = items.length - jobs.length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar imagens em lote</DialogTitle>
          <DialogDescription>O nome de cada arquivo (sem extensão) é o código do produto, ex.: NC-EKK-030.png ou 3833.jpg.</DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-4 min-w-0">
            <div
              className={`rounded-lg border-2 border-dashed p-4 text-center text-sm ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => { e.preventDefault(); setDragOver(false); if (!busy) addFiles(await filesFromDrop(e.dataTransfer)); }}
            >
              <p className="hidden md:block text-muted-foreground mb-3">Arraste aqui os arquivos ou a pasta inteira</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button type="button" variant="outline" className="min-h-11" disabled={busy} asChild>
                  <label className="cursor-pointer"><ImagePlus className="h-4 w-4 mr-2" />Selecionar imagens
                    <input type="file" multiple accept=".jpg,.jpeg,.png,image/png,image/jpeg" className="sr-only" aria-label="Arquivos de imagem"
                      onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                  </label>
                </Button>
                <Button type="button" variant="outline" className="hidden md:inline-flex min-h-11" disabled={busy} asChild>
                  <label className="cursor-pointer"><FolderOpen className="h-4 w-4 mr-2" />Selecionar pasta
                    <input ref={folderRef} type="file" multiple className="sr-only" aria-label="Pasta de imagens"
                      onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                  </label>
                </Button>
              </div>
              {reading && <p className="mt-3 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lendo imagens…</p>}
            </div>

            {items.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <p><strong>{jobs.length}</strong> de {items.length} serão gravadas{ignorados > 0 ? ` · ${ignorados} ficam de fora` : ""}</p>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={reset}>Limpar</Button>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2" aria-label="Prévia das imagens">
                  {items.map((it, i) => {
                    const l = byFile.get(it.file);
                    const on = included(it);
                    return (
                      <li key={i} className={`flex gap-3 rounded-lg border p-3 min-w-0 ${on ? "border-border" : "border-border opacity-70"}`}>
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
                          {l?.ok ? <img src={l.url} alt={it.codigo} className="h-full w-full object-contain" /> : <AlertTriangle className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1 text-sm">
                          <p className="font-mono font-semibold break-all">{it.codigo}</p>
                          <p className="text-muted-foreground break-words">{it.product?.name ?? "—"}</p>
                          {it.width && <p className="text-xs text-muted-foreground">{it.width} × {it.height} px</p>}
                          <div className="flex flex-wrap gap-1">
                            {it.warnings.filter((w) => w !== "ja_tem_imagem").map((w) => (
                              <Badge key={w} variant={BLOCKING_WARNINGS.includes(w) ? "destructive" : "outline"} className="whitespace-normal text-left">
                                <AlertTriangle className="h-3 w-3 mr-1 shrink-0" />{WARNING_LABEL[w]}
                              </Badge>
                            ))}
                            {on && it.podeEnviar && <Badge variant="secondary"><Send className="h-3 w-3 mr-1" />Pode enviar ao cliente</Badge>}
                            {on && !it.warnings.length && <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Pronta</Badge>}
                          </div>
                          {it.warnings.includes("ja_tem_imagem") && !it.warnings.includes("repetido") && it.product && (
                            <label className="flex items-center gap-2 min-h-11">
                              <Checkbox checked={replace.has(it.product.id)} disabled={busy} onCheckedChange={(v) => toggleReplace(it.product!.id, !!v)} />
                              <span>{WARNING_LABEL.ja_tem_imagem}</span>
                            </label>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {progress !== null && <Progress value={progress} />}
          </div>
        )}

        {result && (
          <div className="space-y-2 text-sm">
            <p><strong>{result.ok}</strong> imagens gravadas{result.replaced > 0 ? ` e ${result.replaced} substituídas` : ""}.</p>
            <p><strong>{result.envio}</strong> liberadas para envio ao cliente (800 px ou mais); as demais ficam só para uso interno.</p>
            {result.failed.length > 0 && <p className="text-destructive break-words">Falharam: {result.failed.join(", ")}</p>}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 bg-background pt-2">
          {result ? <Button className="min-h-11" onClick={() => close(false)}>Fechar</Button> : (
            <Button className="min-h-11" onClick={run} disabled={!jobs.length || busy || reading}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Confirmar e gravar {jobs.length || ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
