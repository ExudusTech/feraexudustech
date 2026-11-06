import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateOrganization } from "@/hooks/use-organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { GRUPOS_LOGO, GRUPO_LOGO_LABEL, parseLogos, type GrupoLogo, type LogoProposta } from "@/lib/proposta-logos";

const TIPOS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
const MAX = 2 * 1024 * 1024;

/** Brand logos for "Parcerias com marcas líderes" in the proposal PDF: upload, brand, group, order. */
export default function PropostaLogos({ orgId, config, canEdit }: { orgId: string; config: Record<string, unknown>; canEdit: boolean }) {
  const update = useUpdateOrganization();
  const [logos, setLogos] = useState<LogoProposta[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [grupoNovo, setGrupoNovo] = useState<GrupoLogo>("destaque");
  const [marcaNova, setMarcaNova] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const trocar = useRef<string | null>(null);

  useEffect(() => { setLogos(parseLogos(config.logos, orgId).sort((a, b) => GRUPOS_LOGO.indexOf(a.grupo) - GRUPOS_LOGO.indexOf(b.grupo) || a.ordem - b.ordem)); }, [config.logos, orgId]);
  useEffect(() => {
    const falta = logos.filter((l) => !urls[l.path]);
    if (!falta.length) return;
    supabase.storage.from("org-logos").createSignedUrls(falta.map((l) => l.path), 3600).then(({ data }) => {
      if (data) setUrls((u) => ({ ...u, ...Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl])) }));
    });
  }, [logos, urls]);

  const salvar = async (lista: LogoProposta[]) => {
    const norm = GRUPOS_LOGO.flatMap((g) => lista.filter((l) => l.grupo === g).map((l, i) => ({ ...l, ordem: i + 1 })));
    setLogos(norm);
    await update.mutateAsync({ id: orgId, proposta_config: { ...config, logos: norm } } as any);
  };

  const enviar = async (file?: File) => {
    if (!file) return;
    if (!TIPOS[file.type]) { toast({ title: "Use PNG ou JPG (de preferência PNG com fundo transparente)", variant: "destructive" }); return; }
    if (file.size > MAX) { toast({ title: "O logo deve ter até 2 MB", variant: "destructive" }); return; }
    const alvo = trocar.current; trocar.current = null;
    if (!alvo && !marcaNova.trim()) { toast({ title: "Informe a marca antes de enviar", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const path = `${orgId}/proposta/${crypto.randomUUID()}.${TIPOS[file.type]}`;
      const { error } = await supabase.storage.from("org-logos").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const antigo = alvo ? logos.find((l) => l.id === alvo) : null;
      const lista = antigo ? logos.map((l) => l.id === alvo ? { ...l, path } : l)
        : [...logos, { id: crypto.randomUUID(), path, marca: marcaNova.trim(), grupo: grupoNovo, ordem: 999 }];
      await salvar(lista);
      if (antigo) await supabase.storage.from("org-logos").remove([antigo.path]);
      setMarcaNova(""); toast({ title: antigo ? "Logo trocado" : "Logo adicionado" });
    } catch { toast({ title: "Não foi possível enviar o logo", variant: "destructive" }); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  const remover = async (l: LogoProposta) => {
    setBusy(true);
    try { await salvar(logos.filter((x) => x.id !== l.id)); await supabase.storage.from("org-logos").remove([l.path]); }
    finally { setBusy(false); }
  };
  const mover = (l: LogoProposta, dir: -1 | 1) => {
    const doGrupo = logos.filter((x) => x.grupo === l.grupo); const i = doGrupo.findIndex((x) => x.id === l.id); const j = i + dir;
    if (j < 0 || j >= doGrupo.length) return;
    [doGrupo[i], doGrupo[j]] = [doGrupo[j], doGrupo[i]];
    salvar([...logos.filter((x) => x.grupo !== l.grupo), ...doGrupo]);
  };
  const editar = (l: LogoProposta, patch: Partial<LogoProposta>) => salvar(logos.map((x) => x.id === l.id ? { ...x, ...patch, ordem: patch.grupo && patch.grupo !== x.grupo ? 999 : x.ordem } : x));

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <Label>Logos das marcas (Parcerias com marcas líderes)</Label>
        <p className="text-xs text-muted-foreground">PNG ou JPG com fundo transparente. No PDF aparecem só os logos: Destaque maiores, depois Parceiros e Marcas de produto. Sem logos, o PDF mostra os nomes das marcas. Marcas inativas nunca aparecem.</p>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => enviar(e.target.files?.[0])} />
      {canEdit && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Marca (ex.: Suzano)" value={marcaNova} maxLength={80} onChange={(e) => setMarcaNova(e.target.value)} />
          <select aria-label="Grupo do logo" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={grupoNovo} onChange={(e) => setGrupoNovo(e.target.value as GrupoLogo)}>
            {GRUPOS_LOGO.map((g) => <option key={g} value={g}>{GRUPO_LOGO_LABEL[g]}</option>)}
          </select>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { trocar.current = null; input.current?.click(); }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Enviar logo</Button>
        </div>
      )}
      {GRUPOS_LOGO.map((g) => {
        const lista = logos.filter((l) => l.grupo === g);
        if (!lista.length) return null;
        return (
          <div key={g} className="space-y-2">
            <p className="text-sm font-medium">{GRUPO_LOGO_LABEL[g]}</p>
            {lista.map((l, i) => (
              <div key={l.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border p-2">
                <div className="h-14 w-full sm:w-28 shrink-0 rounded bg-white flex items-center justify-center p-1">
                  {urls[l.path] ? <img src={urls[l.path]} alt={l.marca} className="max-h-12 max-w-full object-contain" /> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <Input aria-label="Marca" defaultValue={l.marca} disabled={!canEdit} maxLength={80} onBlur={(e) => e.target.value.trim() !== l.marca && editar(l, { marca: e.target.value.trim() })} />
                <select aria-label="Grupo" disabled={!canEdit} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={l.grupo} onChange={(e) => editar(l, { grupo: e.target.value as GrupoLogo })}>
                  {GRUPOS_LOGO.map((x) => <option key={x} value={x}>{GRUPO_LOGO_LABEL[x]}</option>)}
                </select>
                {canEdit && (
                  <div className="flex gap-1 justify-end">
                    <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => mover(l, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Descer" disabled={i === lista.length - 1} onClick={() => mover(l, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Trocar arquivo" disabled={busy} onClick={() => { trocar.current = l.id; input.current?.click(); }}><RefreshCw className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Remover" disabled={busy} onClick={() => remover(l)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
