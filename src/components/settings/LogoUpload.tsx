import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateOrganization } from "@/hooks/use-organizations";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2 } from "lucide-react";

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" };

/** Returns an error message, or null when the file is an accepted logo. */
export function validateLogoFile(file: { type: string; size: number }): string | null {
  if (!LOGO_TYPES[file.type]) return "Use PNG, JPG ou SVG.";
  if (file.size > LOGO_MAX_BYTES) return "O logo deve ter até 2 MB.";
  return null;
}

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

interface Props { orgId: string; logoUrl: string | null; canEdit: boolean }

export default function LogoUpload({ orgId, logoUrl, canEdit }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const updateOrg = useUpdateOrganization();

  const onFile = async (file?: File) => {
    if (!file) return;
    const err = validateLogoFile(file);
    if (err) { toast({ title: "Arquivo inválido", description: err, variant: "destructive" }); return; }
    setBusy(true);
    try {
      const path = `${orgId}/logo-${Date.now()}.${LOGO_TYPES[file.type]}`;
      const { error } = await supabase.storage.from("org-logos").upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data, error: signErr } = await supabase.storage.from("org-logos").createSignedUrl(path, TEN_YEARS);
      if (signErr || !data) throw signErr;
      await updateOrg.mutateAsync({ id: orgId, logo_url: data.signedUrl } as any);
      toast({ title: "Logo atualizado" });
    } catch {
      toast({ title: "Não foi possível enviar o logo", variant: "destructive" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <Label>Logo da organização</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[{ label: "Fundo claro", cls: "bg-white" }, { label: "Fundo escuro (placa clara)", cls: "bg-black" }].map((v) => (
          <div key={v.label} className={`rounded-lg border border-border p-4 h-28 flex flex-col items-center justify-center ${v.cls}`}>
            {logoUrl ? (
              <div className={v.cls === "bg-black" ? "rounded-xl bg-white p-2" : ""}>
                <img src={logoUrl} alt="Logo" className="max-h-16 max-w-[180px] object-contain" />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Sem logo (usa a marca padrão)</span>
            )}
            <span className="mt-2 text-[11px] text-muted-foreground">{v.label}</span>
          </div>
        ))}
      </div>
      {canEdit && (
        <>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy} className="min-h-11">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Enviar logo (PNG, JPG ou SVG até 2 MB)
          </Button>
        </>
      )}
    </div>
  );
}
