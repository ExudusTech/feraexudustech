import { useEffect, useRef, useState } from "react";
import { QrCode, Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseEtiqueta } from "@/lib/etiquetas";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onNumero: (n: number) => void; titulo?: string; descricao?: string }

/** Phone camera QR reader: native BarcodeDetector when available, jsQR (loaded on demand) otherwise, plus typing the number. */
export default function EtiquetaScanner({ open, onOpenChange, onNumero, titulo = "Escanear etiqueta", descricao }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [camera, setCamera] = useState(true);

  useEffect(() => {
    if (!open) return;
    setAviso(null); setManual(""); setCamera(true);
    let parar = false; let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch { setCamera(false); setAviso("Não foi possível abrir a câmera. Digite o número da etiqueta."); return; }
      if (parar || !video.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      const Det = (window as any).BarcodeDetector;
      let detector: any = null;
      if (Det) { try { const f: string[] | undefined = await Det.getSupportedFormats?.(); if (!f || f.includes("qr_code")) detector = new Det({ formats: ["qr_code"] }); } catch { detector = null; } }
      const jsqr = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const ler = async () => {
        if (parar) return;
        const v = video.current;
        if (v && v.readyState >= 2 && v.videoWidth) {
          let texto: string | null = null;
          try {
            if (detector) texto = (await detector.detect(v))?.[0]?.rawValue ?? null;
            else if (jsqr && ctx) {
              const w = 480; const h = Math.round((v.videoHeight * w) / v.videoWidth);
              canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
              texto = jsqr(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch { texto = null; }
          if (texto) {
            const n = parseEtiqueta(texto);
            if (n) { parar = true; navigator.vibrate?.(80); onNumero(n); return; }
            setAviso("Este QR não é uma etiqueta do sistema.");
          }
        }
        setTimeout(ler, 180);
      };
      ler();
    })();
    return () => { parar = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const n = parseEtiqueta(manual);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />{titulo}</DialogTitle>
          <DialogDescription>{descricao ?? "Aponte a câmera para o QR da etiqueta ou digite o número impresso."}</DialogDescription></DialogHeader>
        {camera && <div className="relative overflow-hidden rounded-lg border bg-muted aspect-square">
          <video ref={video} className="h-full w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-primary" />
        </div>}
        {aviso && <p className="text-sm text-warning">{aviso}</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (n) onNumero(n); }}>
          <div className="relative flex-1"><Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" inputMode="numeric" placeholder="Nº da etiqueta (ex.: 000123)" aria-label="Número da etiqueta" value={manual}
              onChange={(e) => setManual(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          <Button type="submit" className="min-h-11" disabled={!n}>Usar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
