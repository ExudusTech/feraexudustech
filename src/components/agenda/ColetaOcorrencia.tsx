// Lote 15: "only record" collection screen + AI draft review/confirmation for an occurrence.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Sparkles, CheckCircle2, Plus, Trash2, ChevronDown, Search } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { enqueue, flushAudio, pending, pickMime } from "@/lib/audio-queue";
import { visitAction } from "@/lib/visit-exec";
import { aparelhosCompativeis, escolherProduto, itensDosPontos, PASSO_LABEL, pendenciasColeta, pontoPedeAparelho, precisaInstalacao, produtosCompativeis, resumoColeta, sugerirProdutos, tipoNotaPadrao, type ProdutoCompat, type RascunhoColeta } from "@/lib/coleta";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [audios, setAudios] = useState<Audio[]>([]);
  const [podeExcluir, setPodeExcluir] = useState(true);
  const [ctx, setCtx] = useState<{ tem_cnpj?: boolean; segmento?: string | null }>({});
  const [produtos, setProdutos] = useState<Prod[]>([]);
  useEffect(() => {
    (supabase as any).from("products").select("id, name, brand, is_dispenser, dispenser_family_id, compatible_dispenser_families").eq("organization_id", orgId).eq("is_active", true).order("name").limit(2000)
      .then(({ data }: any) => setProdutos(data ?? []));
    coleta({ id: scheduleId, action: "pendencias" }).then((r) => setCtx({ tem_cnpj: r.tem_cnpj, segmento: r.segmento })).catch(() => {});
  }, [orgId, scheduleId]);

  const refresh = useCallback(async () => {
    setFila((await pending(scheduleId)).length);
    try { const r = await coleta<{ audios: Audio[]; pode_excluir: boolean }>({ id: scheduleId, action: "audios" }); setAudios(r.audios); setEnviados(r.audios.length); setPodeExcluir(r.pode_excluir); }
    catch { /* offline: keep the last list */ }
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
  const excluir = (id: string) => run(async () => { if (!window.confirm("Excluir este registro?")) return; await coleta({ id: scheduleId, action: "excluir_audio", evidencia_id: id }); await refresh(); onChange(); });
  const consultarCnpj = () => run(async () => {
    const c = (draft?.instalacao?.cnpj ?? "").replace(/\D/g, "");
    if (c.length !== 14) throw new Error("Digite os 14 números do CNPJ");
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`);
    if (!r.ok) throw new Error("CNPJ não encontrado na Receita");
    const j = await r.json();
    toast({ title: j.razao_social ?? "CNPJ encontrado", description: [j.nome_fantasia, j.municipio, j.descricao_situacao_cadastral].filter(Boolean).join(" · ") });
  });
  const confirmar = () => run(async () => {
    const r = await coleta({ id: scheduleId, action: "confirmar", rascunho: draft });
    toast({ title: "Coleta confirmada", description: `${r.pontos_previstos} ponto(s) previsto(s)${r.agendamentos?.length ? ` · ${r.agendamentos.length} agendamento(s) criado(s)` : ""}` }); onChange();
  });

  if (status === "confirmada") return <p className="text-sm text-success">Coleta {codigo && `#${codigo} `}confirmada.</p>;
  const pend = draft ? pendenciasColeta(tipo, draft, { cnpj: ctx.tem_cnpj, catalogo: produtos }) : [];
  const inst = draft ? precisaInstalacao(draft) : null;
  const set = (fn: (d: RascunhoColeta) => void) => setDraft((cur) => { const d = structuredClone(cur ?? {}); fn(d); return d; });
  const aparelhos = produtos.filter((p) => p.is_dispenser);
  const noCatalogo = (nome?: string) => !!nome && produtos.some((p) => p.name === nome);

  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="Coleta por áudio">
      <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">Coleta {codigo && `#${codigo}`}</h3>
        <span className="text-xs text-muted-foreground">{enviados} enviado(s){fila ? ` · ${fila} na fila (sem sinal)` : ""}</span></div>
      <Button type="button" className="w-full min-h-20 text-lg" variant={rec ? "destructive" : "default"} onClick={() => rec ? rec.stop() : startRec()} disabled={busy}>
        {rec ? <><Square className="h-6 w-6" />Parar ({secs}s)</> : <><Mic className="h-6 w-6" />Gravar áudio</>}
      </Button>
      <p className="text-xs text-muted-foreground">Grave quantos áudios curtos quiser (até 3 min cada). Sem sinal, eles ficam guardados e são enviados sozinhos.</p>
      {(audios.length > 0 || fila > 0) && <ul className="space-y-2" aria-label="Áudios da ocorrência">
        {audios.map((a) => <li key={a.id} className="rounded-md border p-2 space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>{new Date(a.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{a.tipo === "audio" ? ` · ${fmtDur(a.duracao_s)}` : " · texto"}</span>
            <span className="flex items-center gap-1">{a.tipo === "audio" && <Badge variant="outline" className={a.transcrito ? "border-success text-success" : ""}>{a.transcrito ? "Transcrito" : "Enviado"}</Badge>}
              {podeExcluir && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Excluir" onClick={() => excluir(a.id)} disabled={busy}><Trash2 className="h-4 w-4" /></Button>}</span>
          </div>
          {a.url ? <audio controls preload="none" src={a.url} className="w-full h-9" /> : a.texto ? <p className="text-sm">{a.texto}</p> : null}
        </li>)}
        {fila > 0 && <li className="rounded-md border border-dashed p-2 text-xs text-warning">{fila} áudio(s) na fila — enviados quando o sinal voltar</li>}
      </ul>}
      <div className="flex gap-2"><Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ou escreva (opcional)" maxLength={4000} />
        <Button variant="outline" onClick={salvarTexto} disabled={busy || texto.trim().length < 3}>Salvar</Button></div>
      <Button variant="secondary" className="w-full min-h-12" onClick={concluir} disabled={busy || !!rec || (enviados + fila) === 0}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{draft ? "Atualizar rascunho com os novos áudios" : "Concluir coleta"}</Button>

      {draft && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm">{resumoColeta(codigo, draft)}</p>
          {pend.length > 0 && <div className="space-y-1"><p className="text-sm font-medium text-warning">Falta:</p>
            <ul className="text-sm list-disc pl-5 text-warning">{pend.map((p) => <li key={p}>{p}</li>)}</ul></div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><Label>Contato</Label><Input value={draft.contato?.nome ?? ""} onChange={(e) => set((d) => { d.contato = { ...d.contato, nome: e.target.value }; })} /></div>
            <div><Label>Cargo</Label><Input value={draft.contato?.cargo ?? ""} onChange={(e) => set((d) => { d.contato = { ...d.contato, cargo: e.target.value }; })} /></div>
            <div><Label>Decisor</Label><Input value={draft.decisor?.nome ?? ""} onChange={(e) => set((d) => { d.decisor = { ...d.decisor, nome: e.target.value }; })} />
              <button type="button" className="mt-1 text-xs text-primary underline" disabled={!draft.contato?.nome}
                onClick={() => set((d) => { d.decisor = { nome: d.contato?.nome, cargo: d.contato?.cargo }; })}>O contato é o decisor</button></div>
            <div><Label>Fluxo de pessoas</Label><Input value={draft.fluxo_pessoas ?? ""} onChange={(e) => set((d) => { d.fluxo_pessoas = e.target.value; })} /></div>
            <div><Label>Produto atual</Label><Input value={draft.produto_atual ?? ""} onChange={(e) => set((d) => { d.produto_atual = e.target.value; })} /></div>
            <div><Label>Concorrente</Label><Input value={draft.concorrente ?? ""} onChange={(e) => set((d) => { d.concorrente = e.target.value; })} /></div>
          </div>
          {ctx.segmento && <p className="text-xs text-muted-foreground">Segmento: {ctx.segmento}</p>}
          <div><Label>Queixas / dores (uma por linha)</Label><Textarea value={(draft.dores ?? []).join("\n")} onChange={(e) => set((d) => { d.dores = e.target.value.split("\n"); })} /></div>
          <div className="space-y-2"><Label>Pontos</Label>
            {(draft.pontos ?? []).map((p, i) => (
              <div key={i} className="space-y-2 rounded-md border p-2">
                <div className="flex gap-1"><Input aria-label="Local" placeholder="Local (ex.: Banheiro feminino)" value={p.local ?? ""} onChange={(e) => set((d) => { d.pontos![i].local = e.target.value; })} />
                  <Button size="icon" variant="ghost" aria-label="Remover ponto" onClick={() => set((d) => { d.pontos!.splice(i, 1); })}><Trash2 className="h-4 w-4" /></Button></div>
                <ProdutoBusca label="Produto / refil" produtos={produtos.filter((x) => !x.is_dispenser)} prioridade={p.sem_aparelho ? [] : produtosCompativeis(produtos, p.aparelho)}
                  value={p.produto ?? ""} onChange={(v) => set((d) => { const pt = { ...d.pontos![i], produto: v }; d.pontos![i] = noCatalogo(v) ? escolherProduto(pt, produtos) : pt; })} />
                <label className="flex items-center gap-2 text-sm min-h-9">
                  <Checkbox checked={!!p.sem_aparelho} onCheckedChange={(c) => set((d) => { d.pontos![i].sem_aparelho = c === true; if (c === true) d.pontos![i].aparelho = undefined; })} />
                  Sem aparelho (ex.: detergente em galão)</label>
                {!p.sem_aparelho && <>
                  {(() => { const comp = aparelhosCompativeis(produtos, p.produto); return comp.length > 0 && <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground w-full">Aparelhos compatíveis:</span>
                    {comp.map((a) => <button type="button" key={a.id} aria-pressed={p.aparelho === a.name}
                      className={`rounded-full border px-3 py-1 text-xs min-h-8 ${p.aparelho === a.name ? "border-primary bg-primary/15 text-primary" : "hover:bg-accent"}`}
                      onClick={() => set((d) => { d.pontos![i].aparelho = a.name; })}>{a.name}{a.brand ? ` · ${a.brand}` : ""}</button>)}</div>; })()}
                  <ProdutoBusca label={pontoPedeAparelho(p, produtos) ? "Aparelho" : "Aparelho (opcional)"} produtos={aparelhos.length ? aparelhos : produtos} value={p.aparelho ?? ""} onChange={(v) => set((d) => { d.pontos![i].aparelho = v; })} />
                </>}
                <div className="w-32"><Label className="text-xs">Quantidade</Label><Input inputMode="numeric" value={p.quantidade ?? ""} onChange={(e) => set((d) => { d.pontos![i].quantidade = e.target.value; })} /></div>
              </div>))}
            <Button size="sm" variant="outline" onClick={() => set((d) => { d.pontos = [...(d.pontos ?? []), {}]; })}><Plus className="h-4 w-4" />Ponto</Button>
          </div>
          <div className="space-y-2"><Label>Produtos oferecidos e reação</Label>
            {(draft.produtos_oferecidos ?? []).map((o, i) => (
              <div key={i} className="space-y-1 rounded-md border p-2">
                <ProdutoBusca label="Produto" produtos={produtos} value={o.produto ?? ""} onChange={(v) => set((d) => { d.produtos_oferecidos![i].produto = v; })} />
                <div className="flex gap-1"><Input placeholder="O que o cliente achou?" value={o.reacao ?? ""} onChange={(e) => set((d) => { d.produtos_oferecidos![i].reacao = e.target.value; })} />
                  <Button size="icon" variant="ghost" aria-label="Remover oferta" onClick={() => set((d) => { d.produtos_oferecidos!.splice(i, 1); })}><Trash2 className="h-4 w-4" /></Button></div>
              </div>))}
            <Button size="sm" variant="outline" onClick={() => set((d) => { d.produtos_oferecidos = [...(d.produtos_oferecidos ?? []), {}]; })}><Plus className="h-4 w-4" />Oferta</Button>
          </div>
          <div className="space-y-2"><Label>Próximos passos</Label>
            {(draft.proximos_passos ?? []).map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-1">
                <select className="h-10 rounded-md border bg-background px-2 text-sm" value={p.tipo ?? ""} onChange={(e) => set((d) => { d.proximos_passos![i].tipo = (e.target.value || undefined) as any; })}>
                  <option value="">—</option>{Object.entries(PASSO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {p.tipo === "perdido" ? <Input placeholder="Motivo da perda" value={p.observacao ?? ""} onChange={(e) => set((d) => { d.proximos_passos![i].observacao = e.target.value; })} />
                  : <Input type="date" value={p.data ?? ""} onChange={(e) => set((d) => { d.proximos_passos![i].data = e.target.value; })} />}
              </div>))}
            <Button size="sm" variant="outline" onClick={() => set((d) => { d.proximos_passos = [...(d.proximos_passos ?? []), {}]; })}><Plus className="h-4 w-4" />Passo</Button>
          </div>
          {inst && <div className="space-y-2 rounded-md border border-primary/40 p-2">
            <Label>{PASSO_LABEL[inst]}: itens, nota e CNPJ</Label>
            {(draft.instalacao?.itens?.length ? draft.instalacao.itens : itensDosPontos(draft)).map((it, i, arr) => (
              <div key={i} className="flex gap-1">
                <Input className="flex-1" value={it.descricao ?? ""} onChange={(e) => set((d) => { d.instalacao = { ...d.instalacao, itens: arr.map((x, j) => j === i ? { ...x, descricao: e.target.value } : { ...x }) }; })} />
                <Input className="w-16" inputMode="numeric" value={it.quantidade ?? ""} onChange={(e) => set((d) => { d.instalacao = { ...d.instalacao, itens: arr.map((x, j) => j === i ? { ...x, quantidade: e.target.value } : { ...x }) }; })} />
                <Button size="icon" variant="ghost" aria-label="Remover item" onClick={() => set((d) => { d.instalacao = { ...d.instalacao, itens: arr.filter((_, j) => j !== i).map((x) => ({ ...x })) }; })}><Trash2 className="h-4 w-4" /></Button>
              </div>))}
            <Button size="sm" variant="outline" onClick={() => set((d) => { const base = d.instalacao?.itens?.length ? d.instalacao.itens : itensDosPontos(d); d.instalacao = { ...d.instalacao, itens: [...base, { descricao: "", quantidade: "1" }] }; })}><Plus className="h-4 w-4" />Item</Button>
            <div><Label className="text-xs">Tipo de nota</Label>
              <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={draft.instalacao?.tipo_nota ?? tipoNotaPadrao(inst)} onChange={(e) => set((d) => { d.instalacao = { ...d.instalacao, tipo_nota: e.target.value }; })}>
                <option value="remessa_teste">Simples Remessa (teste)</option><option value="venda">Venda</option><option value="remessa_comodato">Remessa em comodato</option></select></div>
            {ctx.tem_cnpj === false && <div><Label className="text-xs">CNPJ</Label><div className="flex gap-1">
              <Input inputMode="numeric" placeholder="00.000.000/0000-00" value={draft.instalacao?.cnpj ?? ""} onChange={(e) => set((d) => { d.instalacao = { ...d.instalacao, cnpj: e.target.value }; })} />
              <Button variant="outline" onClick={consultarCnpj} disabled={busy}><Search className="h-4 w-4" />Consultar</Button></div></div>}
          </div>}
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">Mais detalhes (opcional)<ChevronDown className="h-4 w-4" /></CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-2 gap-2 pt-2">
              {([["porte", "Funcionários"], ["banheiros_f", "Banheiros F"], ["banheiros_m", "Banheiros M"], ["banheiros_pne", "Banheiros PNE"]] as const).map(([k, l]) =>
                <div key={k}><Label className="text-xs">{l}</Label><Input inputMode="numeric" value={draft.levantamento?.[k] ?? ""} onChange={(e) => set((d) => { d.levantamento = { ...d.levantamento, [k]: e.target.value }; })} /></div>)}
              <div className="col-span-2"><Label className="text-xs">Problema principal</Label><Input value={draft.levantamento?.problema ?? ""} onChange={(e) => set((d) => { d.levantamento = { ...d.levantamento, problema: e.target.value }; })} /></div>
              <div className="col-span-2"><Label className="text-xs">Compra de quem hoje</Label><Input value={draft.levantamento?.fornecedor ?? ""} onChange={(e) => set((d) => { d.levantamento = { ...d.levantamento, fornecedor: e.target.value }; })} /></div>
            </CollapsibleContent>
          </Collapsible>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" onClick={salvar} disabled={busy}>Salvar correções</Button>
            <Button className="min-h-11" onClick={confirmar} disabled={busy || pend.length > 0}><CheckCircle2 className="h-4 w-4" />Confirmar</Button>
          </div>
          {pend.length === 0 && <Badge variant="outline" className="border-success text-success">Pronto para confirmar</Badge>}
        </div>)}
    </section>
  );
}

interface Audio { id: string; tipo: string; criado_em: string; duracao_s: number | null; url: string | null; transcrito: boolean; texto: string | null }
interface Prod extends ProdutoCompat { id: string; name: string; brand: string | null }
const fmtDur = (s?: number | null) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—";

/** Free text field with catalog suggestions (tolerant to transcription typos); shows the matched product and lets the seller swap it. */
function ProdutoBusca({ label, produtos, value, onChange, prioridade = [] }: { label: string; produtos: Prod[]; value: string; onChange: (v: string) => void; prioridade?: Prod[] }) {
  const [open, setOpen] = useState(false);
  const noCatalogo = produtos.some((p) => p.name === value);
  // Compatible products (from the chosen device) come first; any other product can still be typed.
  const prio = new Set(prioridade.map((p) => p.id));
  const busca = (n: number) => [...sugerirProdutos(produtos, value, 12)].sort((a, b) => Number(prio.has(b.id)) - Number(prio.has(a.id))).slice(0, n);
  const sug = value && !noCatalogo ? busca(4) : open ? (value ? busca(6) : prioridade.slice(0, 6)) : [];
  return <div>
    <Label className="text-xs">{label}</Label>
    <Input value={value} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 200)} onChange={(e) => onChange(e.target.value)} placeholder={`${label} (busca no catálogo)`} />
    {noCatalogo && <p className="text-xs text-success mt-0.5">✓ No catálogo</p>}
    {sug.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{!noCatalogo && value ? <span className="text-xs text-muted-foreground w-full">Encontrado no catálogo:</span>
      : !value && prioridade.length > 0 ? <span className="text-xs text-muted-foreground w-full">Compatíveis com o aparelho:</span> : null}
      {sug.map((p) => <button type="button" key={p.id} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(p.name); setOpen(false); }}>
        {p.name}{p.brand ? ` · ${p.brand}` : ""}</button>)}</div>}
  </div>;
}

/** Occurrence code + "information pending" seal, used in Agenda, Hoje and the manager panel. */
export function OcorrenciaTag({ s }: { s: { ocorrencia_codigo?: string | null; coleta_status?: string | null; status?: string } }) {
  return <>
    {s.ocorrencia_codigo && <span className="text-xs text-muted-foreground font-mono">#{s.ocorrencia_codigo}</span>}
    {s.coleta_status === "pendente" && <Badge variant="outline" className="border-warning text-warning">Informações pendentes</Badge>}
  </>;
}
