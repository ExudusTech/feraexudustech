import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/use-products";
import { baseAction, uploadVisitPhoto } from "@/lib/base-instalada";
import { ACAO_ETIQUETA_LABEL, formatEtiqueta, type AcaoEtiqueta } from "@/lib/etiquetas";
import EtiquetaScanner from "@/components/etiquetas/EtiquetaScanner";

interface Info { numero: number; aparelho: { id: string; status: string; status_label: string; local: string | null; aparelho: string | null; cliente: string | null; deste_local: boolean; product_id: string | null } | null; acoes: AcaoEtiqueta[]; aviso: string | null }
interface Props { scheduleId: string; orgId: string; clientId?: string | null; leadId?: string | null; numeroInicial?: number | null; onChanged?: () => void; onAvaliar?: (comodatoId: string) => void }

function Foto({ label, busy, onFile }: { label: string; busy: boolean; onFile: (f: File) => void }) {
  return (
    <Button asChild variant="outline" className="min-h-11" disabled={busy}>
      <label className="cursor-pointer"><Camera className="h-4 w-4" />{label}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} /></label>
    </Button>
  );
}

/** "Escanear etiqueta" inside an open occurrence: the scan resolves the action for that device (install, evaluate, move, remove, replace). */
export default function EtiquetaNaVisita({ scheduleId, orgId, clientId, leadId, numeroInicial, onChanged, onAvaliar }: Props) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const dispensers = products.filter((p) => p.is_dispenser && p.is_active);
  const [scan, setScan] = useState<"principal" | "novo" | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [acao, setAcao] = useState<AcaoEtiqueta | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<{ local: string; previsto: string; produto: string; foto?: string; motivo: string; novo?: number; vincular: string }>({ local: "", previsto: "", produto: "", motivo: "", vincular: "" });
  const { data: pontos = [], refetch } = useQuery({
    queryKey: ["etiqueta-pontos", scheduleId], enabled: !!(clientId || leadId),
    queryFn: async () => {
      const { data } = await (supabase as any).from("comodatos").select("id, localizacao_interna, status, etiqueta_numero, product_id, quantidade").eq(clientId ? "client_id" : "lead_id", clientId ?? leadId).order("created_at");
      return (data ?? []) as any[];
    },
  });
  const previstos = pontos.filter((p) => p.status === "PREVISTO");
  const semNumero = pontos.filter((p) => ["ATIVO", "EM_TESTE"].includes(p.status) && !p.etiqueta_numero);
  const nomeProd = (id?: string | null) => products.find((p) => p.id === id)?.name;

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) {
    toast({ title: "Atenção", description: e instanceof Error ? e.message : "Tente de novo.", variant: "destructive" }); } finally { setBusy(false); } };
  const consultar = (n: number) => run(async () => {
    setScan(null); setAcao(null); setF({ local: "", previsto: "", produto: "", motivo: "", vincular: "" });
    setInfo(await baseAction<Info>({ action: "etiqueta_info", numero: n, schedule_id: scheduleId }));
  });
  useEffect(() => { if (numeroInicial) consultar(numeroInicial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [numeroInicial]);
  const pronto = (msg: string) => {
    toast({ title: msg }); setInfo(null); setAcao(null); refetch(); onChanged?.();
    qc.invalidateQueries({ queryKey: ["checklist", scheduleId] }); qc.invalidateQueries({ queryKey: ["aparelho"] }); qc.invalidateQueries({ queryKey: ["estoque"] });
  };
  const foto = (file: File) => run(async () => { const path = await uploadVisitPhoto(orgId, scheduleId, file); setF((x) => ({ ...x, foto: path })); });
  const ap = info?.aparelho;
  const executar = () => run(async () => {
    if (!info) return;
    const n = info.numero;
    if (acao === "instalar") {
      await baseAction({ action: "etiqueta_instalar", schedule_id: scheduleId, numero: n, comodato_id: f.previsto || undefined, localizacao_interna: f.local, foto_path: f.foto, product_id: f.produto || undefined });
      pronto(`Aparelho nº ${formatEtiqueta(n)} instalado`);
    } else if (acao === "vincular") {
      await baseAction({ action: "etiqueta_vincular", schedule_id: scheduleId, numero: n, comodato_id: f.vincular });
      pronto(`Etiqueta nº ${formatEtiqueta(n)} ligada ao aparelho`);
    } else if (acao === "trocar_ponto" && ap) {
      await baseAction({ action: "etiqueta_trocar_ponto", schedule_id: scheduleId, comodato_id: ap.id, localizacao_interna: f.local, foto_path: f.foto });
      pronto("Aparelho trocado de ponto");
    } else if (acao === "retirar" && ap) {
      await baseAction({ action: "etiqueta_retirar", schedule_id: scheduleId, comodato_id: ap.id, motivo: f.motivo });
      pronto("Aparelho retirado: voltou ao estoque");
    } else if (acao === "substituir" && ap) {
      await baseAction({ action: "etiqueta_substituir", schedule_id: scheduleId, comodato_id: ap.id, numero: f.novo, foto_path: f.foto, product_id: f.produto || undefined });
      pronto(`Substituído pelo aparelho nº ${formatEtiqueta(f.novo!)}`);
    }
  });
  const okRapido = () => run(async () => {
    if (!ap) return;
    await baseAction({ action: "avaliar", schedule_id: scheduleId, comodato_id: ap.id, estado: "verde", manutencoes: [] });
    pronto(`Aparelho nº ${formatEtiqueta(info!.numero)}: OK`);
  });
  const falta = acao === "instalar" ? (!f.foto ? "Tire a foto do aparelho instalado" : !(f.local.trim() || f.previsto) ? "Informe o local ou escolha o ponto previsto"
      : !(f.produto || ap?.product_id || previstos.find((p) => p.id === f.previsto)?.product_id) ? "Escolha o aparelho" : null)
    : acao === "vincular" ? (!f.vincular ? "Escolha o aparelho" : null)
    : acao === "trocar_ponto" ? (f.local.trim().length < 2 ? "Informe o novo local" : null)
    : acao === "retirar" ? (f.motivo.trim().length < 3 ? "Informe o motivo" : null)
    : acao === "substituir" ? (!f.novo ? "Escaneie a etiqueta do aparelho novo" : !f.foto ? "Tire a foto do aparelho novo" : null) : null;

  return (
    <div className="space-y-2">
      {!info && <Button type="button" variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => setScan("principal")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}Escanear etiqueta</Button>}
      {info && (
        <div className="rounded-md border p-2 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 text-sm">
              <p className="font-semibold">Etiqueta nº {formatEtiqueta(info.numero)}</p>
              {ap ? <p className="text-muted-foreground">{ap.aparelho ?? "Aparelho"}{ap.local ? ` · ${ap.local}` : ""}{ap.cliente && !ap.deste_local ? ` · ${ap.cliente}` : ""}</p>
                : <p className="text-muted-foreground">Etiqueta livre: ainda não pertence a nenhum aparelho.</p>}
            </div>
            {ap && <Badge variant="outline">{ap.status_label}</Badge>}
            <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={() => { setInfo(null); setAcao(null); }}><X className="h-4 w-4" /></Button>
          </div>
          {info.aviso && <p className="text-xs text-warning">{info.aviso}</p>}
          {!acao && <div className="grid gap-2 sm:grid-cols-2">
            {info.acoes.includes("avaliar") && ap && <>
              <Button type="button" className="min-h-11" disabled={busy} onClick={okRapido}>🟢 OK (um toque)</Button>
              <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => { onAvaliar?.(ap.id); setInfo(null); }}>🟡/🔴 Avaliar com foto</Button></>}
            {info.acoes.filter((a) => a !== "avaliar").map((a) => (
              <Button key={a} type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => {
                setAcao(a); setF((x) => ({ ...x, local: a === "instalar" ? ap?.local ?? "" : "", produto: ap?.product_id ?? "" }));
                if (a === "substituir") setScan("novo");
              }}>{ACAO_ETIQUETA_LABEL[a]}</Button>))}
          </div>}
          {acao === "instalar" && <div className="space-y-2">
            {previstos.length > 0 && <Select value={f.previsto || "novo"} onValueChange={(v) => {
              const p = previstos.find((x) => x.id === v); setF({ ...f, previsto: v === "novo" ? "" : v, local: p?.localizacao_interna ?? f.local, produto: f.produto || p?.product_id || "" });
            }}>
              <SelectTrigger aria-label="Ponto"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="novo">Novo ponto</SelectItem>
                {previstos.map((p) => <SelectItem key={p.id} value={p.id}>Previsto: {p.localizacao_interna || "Ponto"}{p.quantidade !== "1" ? ` (${p.quantidade}x)` : ""}</SelectItem>)}</SelectContent>
            </Select>}
            <Input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} placeholder="Local interno (ex.: Banheiro feminino)" maxLength={120} />
            {!ap?.product_id && <Select value={f.produto} onValueChange={(v) => setF({ ...f, produto: v })}>
              <SelectTrigger aria-label="Aparelho"><SelectValue placeholder="Aparelho / dispenser" /></SelectTrigger>
              <SelectContent>{dispensers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>}
            <Foto label={f.foto ? "Foto ✓" : "Foto do aparelho instalado"} busy={busy} onFile={foto} />
          </div>}
          {acao === "vincular" && <div className="space-y-1">
            {!semNumero.length && <p className="text-xs text-muted-foreground">Nenhum aparelho instalado sem número neste cliente.</p>}
            {semNumero.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm min-h-11 rounded border px-2">
                <input type="radio" name={`vinc-${scheduleId}`} checked={f.vincular === p.id} onChange={() => setF({ ...f, vincular: p.id })} />
                {p.localizacao_interna || "Ponto"} — {nomeProd(p.product_id) ?? "Aparelho"}{p.quantidade !== "1" ? ` (${p.quantidade}x: separa 1)` : ""}</label>))}
          </div>}
          {acao === "trocar_ponto" && <div className="space-y-2">
            <Label>Novo local (hoje: {ap?.local ?? "—"})</Label>
            <Input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} placeholder="Novo local interno" maxLength={120} />
            <Foto label={f.foto ? "Foto ✓" : "Foto (opcional)"} busy={busy} onFile={foto} />
          </div>}
          {acao === "retirar" && <Input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Motivo da retirada" maxLength={200} />}
          {acao === "substituir" && <div className="space-y-2">
            <p className="text-sm">{f.novo ? <>Aparelho novo: <strong>nº {formatEtiqueta(f.novo)}</strong></> : "Escaneie a etiqueta do aparelho novo."}</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setScan("novo")}><QrCode className="h-4 w-4" />{f.novo ? "Escanear de novo" : "Escanear aparelho novo"}</Button>
            <Select value={f.produto} onValueChange={(v) => setF({ ...f, produto: v })}>
              <SelectTrigger aria-label="Modelo do aparelho novo"><SelectValue placeholder="Mesmo modelo" /></SelectTrigger>
              <SelectContent>{dispensers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Foto label={f.foto ? "Foto ✓" : "Foto do aparelho novo"} busy={busy} onFile={foto} />
            <p className="text-xs text-muted-foreground">O antigo sai do ponto e volta ao estoque quando a nota de devolução assinada chegar.</p>
          </div>}
          {acao && <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11 flex-1" disabled={busy || !!falta} onClick={executar}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar</Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setAcao(null)}>Voltar</Button>
          </div>}
          {acao && falta && <p className="text-xs text-warning">{falta}</p>}
        </div>
      )}
      <EtiquetaScanner open={!!scan} onOpenChange={(o) => !o && setScan(null)} titulo={scan === "novo" ? "Etiqueta do aparelho novo" : "Escanear etiqueta"}
        onNumero={(n) => { if (scan === "novo") { setF((x) => ({ ...x, novo: n })); setScan(null); } else consultar(n); }} />
    </div>
  );
}
