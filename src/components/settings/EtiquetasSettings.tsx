import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, QrCode } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { faixaErro, FAIXA_MAX, formatEtiqueta, layoutEtiquetas, proximoInicio } from "@/lib/etiquetas";
import { gerarPdfEtiquetas } from "@/lib/etiquetas-pdf";

const num = (v: string) => (v === "" ? NaN : Number(v));

/** Settings → Etiquetas (manager): PDF of numbered QR labels for the print shop; each generated range is recorded and never repeated. */
export default function EtiquetasSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["etiqueta-faixas", user?.organization_id], enabled: !!user?.organization_id,
    queryFn: async () => {
      const sb = supabase as any;
      const [f, o] = await Promise.all([
        sb.from("etiqueta_faixas").select("id, inicio, fim, largura_mm, altura_mm, created_at").eq("organization_id", user!.organization_id).order("inicio", { ascending: false }),
        sb.from("organizations").select("name, trading_name").eq("id", user!.organization_id).maybeSingle(),
      ]);
      return { faixas: (f.data ?? []) as any[], marca: String(o.data?.trading_name || o.data?.name || "NitsClean") };
    },
  });
  const faixas = data?.faixas ?? [];
  const [ini, setIni] = useState(""); const [fim, setFim] = useState("");
  const [w, setW] = useState("50"); const [h, setH] = useState("30");
  const [prog, setProg] = useState<number | null>(null);
  useEffect(() => {
    if (!data || ini) return;
    const p = proximoInicio(faixas); setIni(String(p)); setFim(String(p + 999));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const erro = faixaErro(num(ini), num(fim), faixas) ?? (num(w) < 30 || num(w) > 100 || num(h) < 20 || num(h) > 80 || isNaN(num(w)) || isNaN(num(h)) ? "Tamanho entre 30–100 × 20–80 mm" : null);
  const lay = !isNaN(num(w)) && !isNaN(num(h)) && num(w) >= 30 && num(h) >= 20 ? layoutEtiquetas(num(w), num(h)) : null;
  const baixar = async (i: number, f: number, lw: number, lh: number) => {
    setProg(0);
    try {
      const blob = await gerarPdfEtiquetas({ inicio: i, fim: f, largura: lw, altura: lh, marca: data?.marca ?? "NitsClean", onProgresso: setProg });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `etiquetas-${formatEtiqueta(i)}-${formatEtiqueta(f)}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    } finally { setProg(null); }
  };
  const gerar = async () => {
    if (erro) return;
    const { error } = await (supabase as any).rpc("registrar_faixa_etiquetas", { _inicio: num(ini), _fim: num(fim), _largura: num(w), _altura: num(h) });
    if (error) { toast({ title: "Atenção", description: error.message?.length < 120 ? error.message : "Não foi possível registrar a faixa", variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["etiqueta-faixas"] });
    await baixar(num(ini), num(fim), num(w), num(h));
    const p = num(fim) + 1; setIni(String(p)); setFim(String(p + 999));
    toast({ title: "Faixa registrada", description: "Esses números não serão gerados de novo." });
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />Etiquetas numeradas (QR)</CardTitle>
        <CardDescription>PDF para a gráfica: um QR por aparelho com número sequencial. O número só é ligado ao aparelho quando é escaneado na separação ou na instalação.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div><Label>Do número</Label><Input inputMode="numeric" value={ini} onChange={(e) => setIni(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          <div><Label>Até</Label><Input inputMode="numeric" value={fim} onChange={(e) => setFim(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          <div><Label>Largura (mm)</Label><Input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
          <div><Label>Altura (mm)</Label><Input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
        </div>
        <p className="text-xs text-muted-foreground">
          {!erro && `${num(fim) - num(ini) + 1} etiquetas (${formatEtiqueta(num(ini))} a ${formatEtiqueta(num(fim))})`}
          {lay && ` · ${lay.porPagina} por folha A4 (${lay.colunas}×${lay.linhas}) com marcas de corte`}{` · máximo ${FAIXA_MAX} por vez`}</p>
        {erro && <p className="text-sm text-warning">{erro}</p>}
        <Button className="min-h-11" disabled={!!erro || prog !== null} onClick={gerar}>
          {prog !== null ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Gerando {Math.round(prog * 100)}%</> : <><Download className="h-4 w-4 mr-2" />Gerar PDF e registrar faixa</>}</Button>
        <div className="space-y-1">
          <p className="text-sm font-medium">Faixas já geradas</p>
          {!faixas.length && <p className="text-xs text-muted-foreground">Nenhuma ainda.</p>}
          {faixas.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 text-sm border-b last:border-0 py-1">
              <span className="flex-1 min-w-[10rem] font-mono">{formatEtiqueta(f.inicio)}–{formatEtiqueta(f.fim)}</span>
              <span className="text-xs text-muted-foreground">{Number(f.largura_mm)}×{Number(f.altura_mm)} mm · {new Date(f.created_at).toLocaleDateString("pt-BR")}</span>
              <Button size="sm" variant="ghost" className="min-h-9" disabled={prog !== null} onClick={() => baixar(f.inicio, f.fim, Number(f.largura_mm), Number(f.altura_mm))}>Baixar de novo</Button>
            </div>))}
        </div>
      </CardContent>
    </Card>
  );
}
