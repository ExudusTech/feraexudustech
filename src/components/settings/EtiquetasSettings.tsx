import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, QrCode } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizationUsers } from "@/hooks/use-users";
import { toast } from "@/hooks/use-toast";
import { FAIXA_MAX, formatEtiqueta, layoutEtiquetas, usoDoLote } from "@/lib/etiquetas";
import { gerarPdfEtiquetas } from "@/lib/etiquetas-pdf";

const num = (v: string) => (v === "" ? NaN : Number(v));

/** Settings → Etiquetas (manager): Fera controls the numbering. "Liberar novo lote" takes the next N numbers, generates the print PDF and records the lot. */
export default function EtiquetasSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: users = [] } = useOrganizationUsers();
  const { data } = useQuery({
    queryKey: ["etiqueta-faixas", user?.organization_id], enabled: !!user?.organization_id,
    queryFn: async () => {
      const sb = supabase as any;
      const [f, o, u] = await Promise.all([
        sb.from("etiqueta_faixas").select("id, inicio, fim, largura_mm, altura_mm, created_at, gerado_por, status, impresso_em").eq("organization_id", user!.organization_id).order("inicio", { ascending: false }),
        sb.from("organizations").select("name, trading_name").eq("id", user!.organization_id).maybeSingle(),
        sb.from("comodatos").select("etiqueta_numero").eq("organization_id", user!.organization_id).not("etiqueta_numero", "is", null).lt("etiqueta_numero", 900001).limit(20000),
      ]);
      return { lotes: (f.data ?? []) as any[], marca: String(o.data?.trading_name || o.data?.name || "NitsClean"), usados: ((u.data ?? []) as any[]).map((r) => r.etiqueta_numero as number) };
    },
  });
  const [qtd, setQtd] = useState("500"); const [w, setW] = useState("50"); const [h, setH] = useState("30");
  const [prog, setProg] = useState<number | null>(null);
  const nome = (id?: string | null) => (users as any[]).find((x) => x.user_id === id)?.name ?? "—";
  const erro = !(num(qtd) >= 1 && num(qtd) <= FAIXA_MAX) ? `Libere de 1 a ${FAIXA_MAX} etiquetas` : num(w) < 30 || num(w) > 100 || num(h) < 20 || num(h) > 80 || isNaN(num(w)) || isNaN(num(h)) ? "Tamanho entre 30–100 × 20–80 mm" : null;
  const lay = !erro ? layoutEtiquetas(num(w), num(h)) : null;
  const baixar = async (i: number, f: number, lw: number, lh: number) => {
    setProg(0);
    try {
      const blob = await gerarPdfEtiquetas({ inicio: i, fim: f, largura: lw, altura: lh, marca: data?.marca ?? "NitsClean", onProgresso: setProg });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `etiquetas-${formatEtiqueta(i)}-${formatEtiqueta(f)}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    } finally { setProg(null); }
  };
  const liberar = async () => {
    if (erro) return;
    const { data: r, error } = await (supabase as any).rpc("liberar_lote_etiquetas", { _quantidade: num(qtd), _largura: num(w), _altura: num(h) });
    if (error) { toast({ title: "Atenção", description: error.message?.length < 120 ? error.message : "Não foi possível liberar o lote", variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["etiqueta-faixas"] });
    toast({ title: `Lote ${formatEtiqueta(r.inicio)}–${formatEtiqueta(r.fim)} liberado`, description: "Esses números nunca serão gerados de novo." });
    await baixar(r.inicio, r.fim, num(w), num(h));
  };
  const impresso = async (id: string) => {
    const { error } = await (supabase as any).rpc("marcar_lote_impresso", { _id: id });
    if (error) toast({ title: "Atenção", description: "Não foi possível marcar como impresso", variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["etiqueta-faixas"] });
  };
  const lotes = data?.lotes ?? [];
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />Etiquetas numeradas (QR)</CardTitle>
        <CardDescription>O Fera controla a numeração: cada lote pega os próximos números, gera o PDF para a gráfica e nunca repete. O número só é ligado ao aparelho quando é escaneado na separação ou na instalação.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-3 sm:max-w-md">
          <div><Label>Quantidade</Label><Input inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
          <div><Label>Largura (mm)</Label><Input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
          <div><Label>Altura (mm)</Label><Input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
        </div>
        <p className="text-xs text-muted-foreground">{lay ? `${lay.porPagina} por folha A4 (${lay.colunas}×${lay.linhas}) com marcas de corte` : erro}</p>
        <Button className="min-h-11" disabled={!!erro || prog !== null} onClick={liberar}>
          {prog !== null ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Gerando {Math.round(prog * 100)}%</> : <><Download className="h-4 w-4 mr-2" />Liberar novo lote</>}</Button>
        <div className="space-y-2">
          <p className="text-sm font-medium">Lotes</p>
          {!lotes.length && <p className="text-xs text-muted-foreground">Nenhum lote liberado ainda.</p>}
          {lotes.map((l) => {
            const u = usoDoLote(l, data?.usados ?? []);
            return (
              <div key={l.id} className="rounded-md border p-2 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{formatEtiqueta(l.inicio)}–{formatEtiqueta(l.fim)}</span>
                  <Badge variant={l.status === "impresso" ? "default" : "outline"}>{l.status === "impresso" ? "Impresso" : "Liberado"}</Badge>
                  <span className="text-xs text-muted-foreground">{u.usados} usados · {u.disponiveis} disponíveis de {u.total}</span>
                </div>
                <p className="text-xs text-muted-foreground">Liberado por {nome(l.gerado_por)} em {new Date(l.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {Number(l.largura_mm)}×{Number(l.altura_mm)} mm
                  {l.impresso_em ? ` · impresso em ${new Date(l.impresso_em).toLocaleDateString("pt-BR")}` : ""}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="min-h-9" disabled={prog !== null} onClick={() => baixar(l.inicio, l.fim, Number(l.largura_mm), Number(l.altura_mm))}><Download className="h-3 w-3 mr-1" />Baixar PDF</Button>
                  {l.status !== "impresso" && <Button size="sm" variant="ghost" className="min-h-9" onClick={() => impresso(l.id)}><CheckCircle2 className="h-3 w-3 mr-1" />Marcar impresso</Button>}
                </div>
              </div>);
          })}
        </div>
      </CardContent>
    </Card>
  );
}
