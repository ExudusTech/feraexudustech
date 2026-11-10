import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { qrEscolherCampanha, qrRenderizar, qrRef, QR_VARIAVEIS, type QrCampanha } from "@/lib/qr";
import { SEGMENTOS } from "@/lib/prontidao";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
type Form = { id?: string; nome: string; texto: string; inicio: string; fim: string; dias: number[]; hora_inicio: string; hora_fim: string; segmentos: string[]; prioridade: string; padrao: boolean; ativo: boolean };
const vazio: Form = { nome: "", texto: "{saudacao}! Que bom te ver no {estabelecimento} 😊 Quer dar uma nota de 0 a 10 para o ambiente?", inicio: "", fim: "", dias: [], hora_inicio: "", hora_fim: "", segmentos: [], prioridade: "10", padrao: false, ativo: true };
const EXEMPLO = { estabelecimento: "Pousada Mar Azul", segmento: "Hotel/Pousada", produto_do_aparelho: "Dispenser de sabonete" };

/** Settings → Campanhas do QR (manager): pre-filled WhatsApp message of the public QR, chosen by date range, weekdays, hours, segment and priority. */
export default function QrCampanhasSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: campanhas = [] } = useQuery({
    queryKey: ["qr-campanhas", user?.organization_id], enabled: !!user?.organization_id,
    queryFn: async () => ((await (supabase as any).from("qr_campanhas").select("*").eq("organization_id", user!.organization_id).order("padrao", { ascending: false }).order("prioridade", { ascending: false })).data ?? []) as any[],
  });
  const [f, setF] = useState<Form | null>(null);
  const agora = new Date();
  const vigente = qrEscolherCampanha(campanhas as QrCampanha[], agora, EXEMPLO);
  const salvar = async () => {
    if (!f || !user?.organization_id) return;
    const row = { nome: f.nome.trim(), texto: f.texto.trim(), inicio: f.inicio || null, fim: f.fim || null, dias_semana: f.dias.length ? f.dias : null,
      hora_inicio: f.hora_inicio || null, hora_fim: f.hora_fim || null, segmentos: f.segmentos.length ? f.segmentos : null, prioridade: Math.min(100, Number(f.prioridade) || 0), padrao: f.padrao, ativo: f.ativo };
    const sb = supabase as any;
    if (f.padrao) await sb.from("qr_campanhas").update({ padrao: false }).eq("organization_id", user.organization_id).eq("padrao", true).neq("id", f.id ?? "00000000-0000-0000-0000-000000000000");
    const { error } = f.id ? await sb.from("qr_campanhas").update(row).eq("id", f.id) : await sb.from("qr_campanhas").insert({ ...row, organization_id: user.organization_id, created_by: user.id });
    if (error) { toast({ title: "Não foi possível salvar", description: "Confira nome (2+ letras), texto (5+ letras) e datas.", variant: "destructive" }); return; }
    setF(null); qc.invalidateQueries({ queryKey: ["qr-campanhas"] }); toast({ title: "Campanha salva" });
  };
  const excluir = async (id: string) => { await (supabase as any).from("qr_campanhas").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["qr-campanhas"] }); };
  const abrir = (c?: any) => setF(c ? { id: c.id, nome: c.nome, texto: c.texto, inicio: c.inicio ?? "", fim: c.fim ?? "", dias: c.dias_semana ?? [], hora_inicio: (c.hora_inicio ?? "").slice(0, 5),
    hora_fim: (c.hora_fim ?? "").slice(0, 5), segmentos: c.segmentos ?? [], prioridade: String(c.prioridade ?? 0), padrao: c.padrao, ativo: c.ativo } : { ...vazio });
  const quando = (c: any) => [c.inicio || c.fim ? `${c.inicio ? c.inicio.split("-").reverse().join("/") : "…"} a ${c.fim ? c.fim.split("-").reverse().join("/") : "…"}` : null,
    c.dias_semana?.length ? c.dias_semana.map((d: number) => DIAS[d]).join(", ") : null, c.hora_inicio || c.hora_fim ? `${(c.hora_inicio ?? "").slice(0, 5) || "…"}–${(c.hora_fim ?? "").slice(0, 5) || "…"}` : null,
    c.segmentos?.length ? c.segmentos.join(", ") : null].filter(Boolean).join(" · ") || "sempre";
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />Campanhas do QR</CardTitle>
        <CardDescription>Mensagem que já vem escrita no WhatsApp quando alguém escaneia o QR de um aparelho. Vale a campanha específica de maior prioridade no momento; sem nenhuma, vale a padrão. No fim vai sempre um código curto (ex.: ref Q7K2M) que a Flora traduz para o aparelho — nunca o número da etiqueta.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border p-2 text-sm bg-muted/40"><p className="text-xs text-muted-foreground">Agora, num aparelho de exemplo (Pousada Mar Azul), a mensagem seria — campanha “{vigente.nome}”:</p>
          <p className="whitespace-pre-line">{qrRenderizar(vigente.texto, EXEMPLO, agora)}{"\n\n"}ref {qrRef(123)}</p></div>
        {campanhas.map((c) => (
          <div key={c.id} className="rounded-md border p-2 text-sm flex flex-wrap items-start gap-2">
            <div className="flex-1 min-w-[12rem]">
              <p className="font-medium">{c.nome} {c.padrao && <Badge className="ml-1">Padrão</Badge>} {!c.ativo && <Badge variant="outline" className="ml-1">Inativa</Badge>}</p>
              <p className="text-xs text-muted-foreground">{quando(c)} · prioridade {c.prioridade}</p>
              <p className="text-xs break-words">{c.texto}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label={`Editar ${c.nome}`} onClick={() => abrir(c)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label={`Excluir ${c.nome}`} onClick={() => excluir(c.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>))}
        <Button variant="outline" className="min-h-11" onClick={() => abrir()}><Plus className="h-4 w-4 mr-2" />Nova campanha</Button>
      </CardContent>
      <Dialog open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{f?.id ? "Editar campanha" : "Nova campanha"}</DialogTitle><DialogDescription>Variáveis: {QR_VARIAVEIS.map((v) => `{${v}}`).join(" ")}</DialogDescription></DialogHeader>
          {f && <div className="space-y-3">
            <div><Label>Nome</Label><Input value={f.nome} maxLength={80} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Domingo de praia" /></div>
            <div><Label>Texto</Label><Textarea value={f.texto} maxLength={500} onChange={(e) => setF({ ...f, texto: e.target.value })} />
              <div className="flex flex-wrap gap-1 mt-1">{QR_VARIAVEIS.map((v) => <Button key={v} type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setF({ ...f, texto: `${f.texto} {${v}}` })}>{`{${v}}`}</Button>)}</div>
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">Prévia: {qrRenderizar(f.texto, EXEMPLO, agora)}</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Início (opcional)</Label><Input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></div>
              <div><Label>Fim (opcional)</Label><Input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></div>
              <div><Label>Das (opcional)</Label><Input type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} /></div>
              <div><Label>Até</Label><Input type="time" value={f.hora_fim} onChange={(e) => setF({ ...f, hora_fim: e.target.value })} /></div>
            </div>
            <div><Label>Dias (vazio = todos)</Label><div className="flex flex-wrap gap-2 mt-1">{DIAS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 text-sm min-h-9"><Checkbox checked={f.dias.includes(i)} onCheckedChange={(v) => setF({ ...f, dias: v ? [...f.dias, i] : f.dias.filter((x) => x !== i) })} />{d}</label>))}</div></div>
            <div><Label>Segmentos (vazio = todos)</Label><div className="grid grid-cols-2 gap-1 mt-1">{SEGMENTOS.map((sg) => (
              <label key={sg} className="flex items-center gap-1 text-sm min-h-9"><Checkbox checked={f.segmentos.includes(sg)} onCheckedChange={(v) => setF({ ...f, segmentos: v ? [...f.segmentos, sg] : f.segmentos.filter((x) => x !== sg) })} />{sg}</label>))}</div></div>
            <div className="grid gap-3 sm:grid-cols-3 items-end">
              <div><Label>Prioridade (0–100)</Label><Input inputMode="numeric" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>
              <label className="flex items-center gap-2 text-sm min-h-11"><Switch checked={f.padrao} onCheckedChange={(v) => setF({ ...f, padrao: v })} />Padrão</label>
              <label className="flex items-center gap-2 text-sm min-h-11"><Switch checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v })} />Ativa</label>
            </div>
            <p className="text-xs text-muted-foreground">Se o aparelho ainda não estiver instalado, campanhas que usam {"{estabelecimento}"}, {"{segmento}"} ou {"{produto_do_aparelho}"} são puladas.</p>
            <Button className="w-full min-h-11" disabled={f.nome.trim().length < 2 || f.texto.trim().length < 5} onClick={salvar}>Salvar</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
