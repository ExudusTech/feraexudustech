// Lote 15: "only record" collection screen + AI draft review/confirmation for an occurrence.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Sparkles, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { enqueue, flushAudio, pending, pickMime } from "@/lib/audio-queue";
import { visitAction } from "@/lib/visit-exec";
import { PASSO_LABEL, pendenciasColeta, resumoColeta, type RascunhoColeta } from "@/lib/coleta";

interface Props { scheduleId: string; orgId: string; codigo?: string | null; tipo?: string | null; status?: string | null; rascunho?: RascunhoColeta | null; onChange: () => void }
const MAX_S = 180;

async function coleta<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("coleta-ocorrencia", { body });
  if (error) {
    let msg = "Não foi possível agora. Tente de novo.";
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error + (j.pendencias?.length ? `: ${j.pendencias.join(", ")}` : ""); } catch { /* keep */ }
    throw new Error(msg);
  }
  return data as T;
}

export default function ColetaOcorrencia({ scheduleId, orgId, codigo, tipo, status, rascunho, onChange }: Props) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [fila, setFila] = useState(0);
  const [enviados, setEnviados] = useState(0);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<RascunhoColeta | null>(rascunho ?? null);
  const chunks = useRef<Blob[]>([]); const start = useRef(0); const timer = useRef<number>();
  useEffect(() => { setDraft(rascunho ?? null); }, [rascunho]);

  const refresh = useCallback(async () => {
    setFila((await pending(scheduleId)).length);
    const { count } = await (supabase as any).from("schedule_evidencias").select("id", { count: "exact", head: true }).eq("schedule_id", scheduleId).in("tipo", ["audio", "texto"]);
    setEnviados(count ?? 0);
  }, [scheduleId]);
  const flush = useCallback(async () => { const n = await flushAudio(); if (n) onChange(); await refresh(); }, [onChange, refresh]);
  useEffect(() => {
    flush();
    const on = () => flush();
    window.addEventListener("online", on);
    const iv = window.setInterval(flush, 20000);
    return () => { window.removeEventListener("online", on); window.clearInterval(iv); };
  }, [flush]);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = []; start.current = Date.now(); setSecs(0);
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); window.clearInterval(timer.current); setRec(null);
        const type = (r.mimeType || mime || "audio/webm").split(";")[0].replace("video/", "audio/");
        const blob = new Blob(chunks.current, { type });
        if (blob.size < 1000) return;
        await enqueue({ id: crypto.randomUUID(), scheduleId, orgId, blob, mime: type, duracao: Math.round((Date.now() - start.current) / 1000), createdAt: Date.now() });
        await refresh(); flush();
      };
      r.start(1000); setRec(r);
      timer.current = window.setInterval(() => { const s = Math.round((Date.now() - start.current) / 1000); setSecs(s); if (s >= MAX_S) r.stop(); }, 500);
    } catch { toast({ title: "Microfone bloqueado", description: "Permita o microfone para o Fera nas configurações do navegador.", variant: "destructive" }); }
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Tente de novo", variant: "destructive" }); } finally { setBusy(false); } };
  const salvarTexto = () => run(async () => { await visitAction({ id: scheduleId, action: "audio", texto, client_uuid: crypto.randomUUID() }); setTexto(""); await refresh(); onChange(); });
  const concluir = () => run(async () => {
    if (fila) { await flush(); if ((await pending(scheduleId)).length) throw new Error("Ainda há áudios sem enviar. Aguarde o sinal voltar."); }
    const r = await coleta({ id: scheduleId, action: "concluir" }); setDraft(r.rascunho); onChange();
  });
  const salvar = () => run(async () => { const r = await coleta({ id: scheduleId, action: "salvar", rascunho: draft }); setDraft(r.rascunho); onChange(); toast({ title: "Rascunho salvo" }); });
  const confirmar = () => run(async () => {
    const r = await coleta({ id: scheduleId, action: "confirmar", rascunho: draft });
    toast({ title: "Coleta confirmada", description: `${r.pontos_previstos} ponto(s) previsto(s)${r.agendamentos?.length ? ` · ${r.agendamentos.length} agendamento(s) criado(s)` : ""}` }); onChange();
  });

  if (status === "confirmada") return <p className="text-sm text-success">Coleta {codigo && `#${codigo} `}confirmada.</p>;
  const pend = draft ? pendenciasColeta(tipo, draft) : [];
  const set = (fn: (d: RascunhoColeta) => void) => setDraft((cur) => { const d = structuredClone(cur ?? {}); fn(d); return d; });

  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="Coleta por áudio">
      <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">Coleta {codigo && `#${codigo}`}</h3>
        <span className="text-xs text-muted-foreground">{enviados} enviado(s){fila ? ` · ${fila} na fila (sem sinal)` : ""}</span></div>
      <Button type="button" className="w-full min-h-20 text-lg" variant={rec ? "destructive" : "default"} onClick={() => rec ? rec.stop() : startRec()} disabled={busy}>
        {rec ? <><Square className="h-6 w-6" />Parar ({secs}s)</> : <><Mic className="h-6 w-6" />Gravar áudio</>}
      </Button>
      <p className="text-xs text-muted-foreground">Grave quantos áudios curtos quiser (até 3 min cada). Sem sinal, eles ficam guardados e são enviados sozinhos.</p>
      <div className="flex gap-2"><Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ou escreva (opcional)" maxLength={4000} />
        <Button variant="outline" onClick={salvarTexto} disabled={busy || texto.trim().length < 3}>Salvar</Button></div>
      <Button variant="secondary" className="w-full min-h-12" onClick={concluir} disabled={busy || !!rec || (enviados + fila) === 0}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{draft ? "Atualizar rascunho com os novos áudios" : "Concluir coleta"}</Button>

      {draft && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm">{resumoColeta(codigo, draft)}</p>
          {pend.length > 0 && <div className="space-y-1"><p className="text-sm font-medium text-warning">Falta:</p>
            <ul className="text-sm list-disc pl-5 text-warning">{pend.map((p) => <li key={p}>{p}</li>)}</ul></div>}
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Contato</Label><Input value={draft.contato?.nome ?? ""} onChange={(e) => set((d) => { d.contato = { ...d.contato, nome: e.target.value }; })} /></div>
            <div><Label>Cargo</Label><Input value={draft.contato?.cargo ?? ""} onChange={(e) => set((d) => { d.contato = { ...d.contato, cargo: e.target.value }; })} /></div>
            <div><Label>Decisor</Label><Input value={draft.decisor?.nome ?? ""} onChange={(e) => set((d) => { d.decisor = { ...d.decisor, nome: e.target.value }; })} /></div>
            <div><Label>Fluxo de pessoas</Label><Input value={draft.fluxo_pessoas ?? ""} onChange={(e) => set((d) => { d.fluxo_pessoas = e.target.value; })} /></div>
            <div><Label>Produto atual</Label><Input value={draft.produto_atual ?? ""} onChange={(e) => set((d) => { d.produto_atual = e.target.value; })} /></div>
            <div><Label>Concorrente</Label><Input value={draft.concorrente ?? ""} onChange={(e) => set((d) => { d.concorrente = e.target.value; })} /></div>
          </div>
          <div><Label>Queixas / dores (uma por linha)</Label><Textarea value={(draft.dores ?? []).join("\n")} onChange={(e) => set((d) => { d.dores = e.target.value.split("\n"); })} /></div>
          <div className="space-y-2"><Label>Pontos</Label>
            {(draft.pontos ?? []).map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_4rem_auto] gap-1">
                {(["local", "aparelho", "produto", "quantidade"] as const).map((k) => <Input key={k} aria-label={k} placeholder={k} value={p[k] ?? ""} onChange={(e) => set((d) => { d.pontos![i] = { ...d.pontos![i], [k]: e.target.value }; })} />)}
                <Button size="icon" variant="ghost" aria-label="Remover ponto" onClick={() => set((d) => { d.pontos!.splice(i, 1); })}><Trash2 className="h-4 w-4" /></Button>
              </div>))}
            <Button size="sm" variant="outline" onClick={() => set((d) => { d.pontos = [...(d.pontos ?? []), {}]; })}><Plus className="h-4 w-4" />Ponto</Button>
          </div>
          <div className="space-y-2"><Label>Produtos oferecidos e reação</Label>
            {(draft.produtos_oferecidos ?? []).map((o, i) => (
              <div key={i} className="grid grid-cols-2 gap-1">
                <Input placeholder="Produto" value={o.produto ?? ""} onChange={(e) => set((d) => { d.produtos_oferecidos![i].produto = e.target.value; })} />
                <Input placeholder="O que o cliente achou?" value={o.reacao ?? ""} onChange={(e) => set((d) => { d.produtos_oferecidos![i].reacao = e.target.value; })} />
              </div>))}
            <Button size="sm" variant="outline" onClick={() => set((d) => { d.produtos_oferecidos = [...(d.produtos_oferecidos ?? []), {}]; })}><Plus className="h-4 w-4" />Oferta</Button>
          </div>
          <div className="space-y-2"><Label>Próximos passos</Label>
            {(draft.proximos_passos ?? []).map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-1">
                <select className="h-10 rounded-md border bg-background px-2 text-sm" value={p.tipo ?? ""} onChange={(e) => set((d) => { d.proximos_passos![i].tipo = (e.target.value || undefined) as any; })}>
                  <option value="">—</option>{Object.entries(PASSO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <Input type="date" value={p.data ?? ""} onChange={(e) => set((d) => { d.proximos_passos![i].data = e.target.value; })} />
              </div>))}
            <Button size="sm" variant="outline" onClick={() => set((d) => { d.proximos_passos = [...(d.proximos_passos ?? []), {}]; })}><Plus className="h-4 w-4" />Passo</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" onClick={salvar} disabled={busy}>Salvar correções</Button>
            <Button className="min-h-11" onClick={confirmar} disabled={busy || pend.length > 0}><CheckCircle2 className="h-4 w-4" />Confirmar</Button>
          </div>
          {pend.length === 0 && <Badge variant="outline" className="border-success text-success">Pronto para confirmar</Badge>}
        </div>)}
    </section>
  );
}
