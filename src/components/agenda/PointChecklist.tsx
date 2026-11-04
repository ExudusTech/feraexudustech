import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/use-products";
import { useProductImageUrls } from "@/hooks/use-product-images";
import { refisCompativeis } from "@/lib/base-instalada";
import { baseAction, ESTADO_CLASS, ESTADO_LABEL, MANUTENCAO_LABEL, MANUTENCOES, pontosPendentes, uploadVisitPhoto } from "@/lib/base-instalada";
import { cn } from "@/lib/utils";
import { clearDraft, useDraftState } from "@/lib/visit-draft";

interface Props { scheduleId: string; orgId: string; clientId: string; onPendingChange?: (pending: number, total: number) => void }

function PhotoButton({ label, busy, onFile }: { label: string; busy: boolean; onFile: (f: File) => void }) {
  return (
    <Button asChild variant="outline" className="min-h-11" disabled={busy}>
      <label className="cursor-pointer"><Camera className="h-4 w-4" />{label}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} /></label>
    </Button>
  );
}

/** Maintenance checklist: one card per installed point, plus "add point". Closing requires every point evaluated. */
export default function PointChecklist({ scheduleId, orgId, clientId, onPendingChange }: Props) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const dispensers = products.filter((p) => p.is_dispenser && p.is_active);
  const refis = products.filter((p) => !p.is_dispenser && p.is_active);
  const { data, refetch } = useQuery({
    queryKey: ["checklist", scheduleId],
    queryFn: async () => {
      const [pts, avs, ocs] = await Promise.all([
        (supabase as any).from("comodatos").select("id, localizacao_interna, status, quantidade, estado_atual, product_id, refil_product_id").eq("client_id", clientId).order("created_at"),
        (supabase as any).from("schedule_evidencias").select("comodato_id, estado, itens, precisa_substituir").eq("schedule_id", scheduleId).not("estado", "is", null),
        (supabase as any).from("maintenance_schedule").select("id, comodato_id, item_descricao, quantidade, urgente, status").eq("client_id", clientId).eq("tipo_os", "substituicao").in("status", ["agendada", "em_andamento"]),
      ]);
      const pontos = ((pts.data ?? []) as any[]).filter((p) => (p.status ?? "ATIVO").toUpperCase() === "ATIVO");
      return { pontos, avaliacoes: (avs.data ?? []) as any[], ocorrencias: (ocs.data ?? []) as any[] };
    },
  });
  const pontos = data?.pontos ?? [];
  const avaliados = (data?.avaliacoes ?? []).map((a) => a.comodato_id);
  const pend = pontosPendentes(pontos, avaliados).length;
  useEffect(() => { onPendingChange?.(pend, pontos.length); }, [pend, pontos.length, onPendingChange]);
  const nameOf = (id?: string | null) => products.find((p) => p.id === id)?.name;
  const { data: signed } = useProductImageUrls(pontos.map((p) => products.find((x) => x.id === p.product_id)?.image_url));
  const imageOf = (id?: string | null) => { const path = products.find((p) => p.id === id)?.image_url; return path ? (signed as any)?.[path] ?? null : null; };

  const [open, setOpen] = useDraftState<string | null>(`pt-open:${scheduleId}`, null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useDraftState<{ estado?: string; manut: string[]; subst: boolean; item: string; itemId: string; qtd: string; urg: boolean; foto?: string; obs: string; resolver: string[] }>(`pt-aval:${scheduleId}`, { manut: [], subst: false, item: "", itemId: "", qtd: "1", urg: false, obs: "", resolver: [] });
  const [novo, setNovo] = useDraftState<{ local: string; disp: string; refil: string; qtd: string; foto?: string; obs: string; estado?: string; manut?: string[] } | null>(`pt-novo:${scheduleId}`, null);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) {
    toast({ title: "Não foi salvo ainda", description: e instanceof Error ? e.message : "Tente de novo. O que você preencheu foi mantido.", variant: "destructive" }); } finally { setBusy(false); } };
  const startEval = (id: string) => { setOpen(id); setF({ manut: [], subst: false, item: "", itemId: "", qtd: "1", urg: false, obs: "", resolver: [] }); };

  const salvar = (id: string) => run(async () => {
    const r = await baseAction<{ pedido_id: string | null }>({ action: "avaliar", schedule_id: scheduleId, comodato_id: id, estado: f.estado, manutencoes: f.manut,
      precisa_substituir: f.subst, item_product_id: f.itemId || undefined, item_descricao: f.item, quantidade: f.qtd, urgente: f.urg, foto_path: f.foto, observacao: f.obs, resolver_ocorrencias: f.resolver });
    setOpen(null); clearDraft(`pt-aval:${scheduleId}`); refetch(); qc.invalidateQueries({ queryKey: ["ocorrencias"] });
    toast({ title: "Ponto avaliado", description: r.pedido_id ? "Pedido de visita emergencial enviado ao gestor" : undefined });
  });
  const criar = () => run(async () => {
    await baseAction({ action: "ponto_novo", schedule_id: scheduleId, localizacao_interna: novo!.local, product_id: novo!.disp || undefined,
      refil_product_id: novo!.refil || undefined, quantidade: novo!.qtd, foto_path: novo!.foto, observacao: novo!.obs, estado: novo!.estado, manutencoes: novo!.manut ?? [] });
    setNovo(null); clearDraft(`pt-novo:${scheduleId}`); refetch(); qc.invalidateQueries({ queryKey: ["comodatos"] }); toast({ title: "Ponto cadastrado e avaliado" });
  });

  const [todosRefis, setTodosRefis] = useState(false);
  const compat = novo ? refisCompativeis(products.find((p) => p.id === novo.disp) as any, refis as any[]) : { lista: refis, mapeado: false };
  const refisLista = (novo?.disp && !todosRefis ? compat.lista : refis) as typeof refis;
  const novoFalta = !novo ? null : novo.local.trim().length < 2 ? "Informe o local do ponto" : !novo.estado ? "Escolha o estado do ponto" : !novo.foto ? "Tire a foto do ponto" : null;

  return (
    <section id="visita-pontos" className="space-y-3 rounded-lg border p-3 scroll-mt-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Pontos do cliente</h3>
        <Badge variant={pend ? "outline" : "default"}>{pontos.length - pend}/{pontos.length} avaliados</Badge>
      </div>
      {!pontos.length && <p className="text-xs text-muted-foreground">Nenhum ponto cadastrado. Adicione os pontos instalados neste cliente.</p>}
      {pontos.map((p) => {
        const av = data?.avaliacoes.find((a) => a.comodato_id === p.id);
        const ocs = (data?.ocorrencias ?? []).filter((o) => o.comodato_id === p.id);
        return (
          <div key={p.id} className="rounded-md border p-2 space-y-2">
            <button type="button" className="w-full text-left flex items-center gap-2 min-h-11" onClick={() => open === p.id ? setOpen(null) : startEval(p.id)}>
              {imageOf(p.product_id) && <img src={imageOf(p.product_id)!} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />}
              <span className="flex-1 text-sm"><strong>{p.localizacao_interna || "Ponto"}</strong> — {nameOf(p.product_id) ?? "Dispenser"}{nameOf(p.refil_product_id) && ` + ${nameOf(p.refil_product_id)}`}{p.quantidade && p.quantidade !== "1" && ` (${p.quantidade}x)`}</span>
              {av ? <Badge className={ESTADO_CLASS[av.estado]}>{ESTADO_LABEL[av.estado]}</Badge> : <Badge variant="outline">Avaliar</Badge>}
            </button>
            {ocs.length > 0 && <p className="text-xs text-warning">Levar: {ocs.map((o) => `${o.quantidade}x ${o.item_descricao}`).join(", ")}</p>}
            {open === p.id && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">{(["verde", "amarelo", "vermelho"] as const).map((e) => (
                  <Button key={e} type="button" variant="outline" className={cn("min-h-12 h-auto whitespace-normal", f.estado === e && ESTADO_CLASS[e])} onClick={() => setF({ ...f, estado: e })}>{ESTADO_LABEL[e]}</Button>))}</div>
                <div className="grid grid-cols-2 gap-2">{MANUTENCOES.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm min-h-9"><Checkbox checked={f.manut.includes(m)}
                    onCheckedChange={(v) => setF({ ...f, manut: v ? [...f.manut, m] : f.manut.filter((x) => x !== m) })} />{MANUTENCAO_LABEL[m]}</label>))}</div>
                {ocs.length > 0 && <div className="space-y-1">{ocs.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm"><Checkbox checked={f.resolver.includes(o.id)}
                    onCheckedChange={(v) => setF({ ...f, resolver: v ? [...f.resolver, o.id] : f.resolver.filter((x) => x !== o.id) })} />Resolvido: {o.quantidade}x {o.item_descricao}</label>))}</div>}
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.subst} onCheckedChange={(v) => setF({ ...f, subst: !!v })} />Precisa substituir?</label>
                {f.subst && <div className="space-y-2 pl-6">
                  <Select value={f.itemId} onValueChange={(v) => setF({ ...f, itemId: v, item: products.find((p) => p.id === v)?.name ?? f.item })}>
                    <SelectTrigger><SelectValue placeholder="Item do catálogo" /></SelectTrigger>
                    <SelectContent>{products.filter((p) => p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex gap-2"><Input value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} placeholder="Ou descreva o item" maxLength={160} />
                    <Input value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="w-20" inputMode="numeric" aria-label="Quantidade" /></div>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.urg} onCheckedChange={(v) => setF({ ...f, urg: !!v })} />Urgente (pede visita emergencial)</label>
                </div>}
                <Textarea value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} placeholder="Observação (opcional)" maxLength={500} />
                <div className="grid grid-cols-2 gap-2">
                  <PhotoButton label={f.foto ? "Foto ✓" : "Foto"} busy={busy} onFile={(file) => run(async () => { const path = await uploadVisitPhoto(orgId, scheduleId, file); setF((x) => ({ ...x, foto: path })); })} />
                  <Button className="min-h-11" disabled={busy || !f.estado || (f.estado !== "verde" && !f.foto)} onClick={() => salvar(p.id)}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Salvar</Button>
                </div>
                {f.estado && f.estado !== "verde" && !f.foto && <p className="text-xs text-muted-foreground">Foto obrigatória para atenção ou ruim.</p>}
              </div>)}
          </div>);
      })}
      {novo ? (
        <div className="rounded-md border p-2 space-y-2">
          <Label>Novo ponto</Label>
          {novo.foto && <p className="text-xs text-warning">Foto já enviada — falta tocar em "Salvar ponto".</p>}
          <Input value={novo.local} onChange={(e) => setNovo({ ...novo, local: e.target.value })} placeholder="Local interno (ex.: Banheiro feminino — público)" maxLength={120} />
          <Select value={novo.disp} onValueChange={(v) => { setTodosRefis(false); setNovo({ ...novo, disp: v, refil: "" }); }}>
            <SelectTrigger><SelectValue placeholder="Aparelho / dispenser" /></SelectTrigger>
            <SelectContent>{dispensers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={novo.refil} onValueChange={(v) => setNovo({ ...novo, refil: v })}>
            <SelectTrigger><SelectValue placeholder="Refil / produto usado" /></SelectTrigger>
            <SelectContent>{refisLista.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          {novo.disp && <p className="text-xs text-muted-foreground">
            {todosRefis ? "Mostrando todos os refis." : compat.mapeado ? `${compat.lista.length} refil(is) compatível(is) com este aparelho.` : "Sem compatibilidade cadastrada: mostrando refis da mesma marca."}{" "}
            <button type="button" className="underline" onClick={() => setTodosRefis((v) => !v)}>{todosRefis ? "Só compatíveis" : "Ver todos"}</button></p>}
          <Input value={novo.qtd} onChange={(e) => setNovo({ ...novo, qtd: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="Quantidade" />
          <Label>Como está o ponto?</Label>
          <div className="grid grid-cols-3 gap-2">{(["verde", "amarelo", "vermelho"] as const).map((e) => (
            <Button key={e} type="button" variant="outline" className={cn("min-h-12 h-auto whitespace-normal", novo.estado === e && ESTADO_CLASS[e])} onClick={() => setNovo({ ...novo, estado: e })}>{ESTADO_LABEL[e]}</Button>))}</div>
          <div className="grid grid-cols-2 gap-2">{MANUTENCOES.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm min-h-9"><Checkbox checked={(novo.manut ?? []).includes(m)}
              onCheckedChange={(v) => setNovo({ ...novo, manut: v ? [...(novo.manut ?? []), m] : (novo.manut ?? []).filter((x) => x !== m) })} />{MANUTENCAO_LABEL[m]}</label>))}</div>
          <Textarea value={novo.obs} onChange={(e) => setNovo({ ...novo, obs: e.target.value })} placeholder="Observação (opcional)" maxLength={500} />
          <p className="text-xs text-muted-foreground">Fotografe só o equipamento, sem pessoas.</p>
          <div className="grid grid-cols-2 gap-2">
            <PhotoButton label={novo.foto ? "Foto ✓" : "Foto do ponto"} busy={busy} onFile={(file) => run(async () => { const path = await uploadVisitPhoto(orgId, scheduleId, file); setNovo((x) => x && ({ ...x, foto: path })); })} />
            <Button className="min-h-11 h-auto whitespace-normal" disabled={busy || !!novoFalta} onClick={criar}>Salvar ponto</Button>
          </div>
          {novoFalta && <p className="text-xs text-warning">{novoFalta}</p>}
          <Button variant="ghost" size="sm" onClick={() => setNovo(null)}>Cancelar</Button>
        </div>
      ) : <Button variant="outline" className="w-full min-h-11" onClick={() => setNovo({ local: "", disp: "", refil: "", qtd: "1", obs: "", manut: [] })}><Plus className="h-4 w-4" />Adicionar ponto</Button>}
    </section>
  );
}
