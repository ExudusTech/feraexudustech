import { useCallback, useEffect, useState } from "react";
import PointChecklist from "@/components/agenda/PointChecklist";
import { baseAction } from "@/lib/base-instalada";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Loader2, MapPin, PlayCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useComodatos } from "@/hooks/use-comodatos";
import type { Schedule } from "@/hooks/use-schedules";
import {
  CONFIRMACAO_LABEL, ITEM_OPTIONS, NAO_REALIZADO_LABEL, NEXT_LABEL, RESULT_LABEL, STATUS_LABEL, getPosition, isTechnical,
  requiresPhoto, visitAction, VisitActionError,
} from "@/lib/visit-exec";
import { clearDraft, faltasParaEncerrar, readDraft, writeDraft } from "@/lib/visit-draft";
import { locationErrorMessage, RECENT_POSITION_MS, type LocationResult } from "@/lib/geolocation";

interface Props { schedule: Schedule | null; open: boolean; onOpenChange: (o: boolean) => void; clientName?: string }

/** Shrinks a phone photo to at most 1600px JPEG so it stays well under the storage limit. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.8));
}

export default function VisitExecutionDialog({ schedule, open, onOpenChange, clientName }: Props) {
  const qc = useQueryClient();
  const s = schedule;
  const tecnico = isTechnical(s?.schedule_type, s?.schedule_subtype);
  const fotoObrigatoria = requiresPhoto(s?.schedule_type, s?.schedule_subtype);
  const { data: comodatos = [] } = useComodatos();
  const loans = comodatos.filter((c) => s?.client_id && c.client_id === s.client_id);

  const { data: exec, refetch } = useQuery({
    queryKey: ["visit-exec", s?.id], enabled: !!s?.id && open,
    queryFn: async () => {
      if (!s) return { checkin: null, evidencias: [], proximo: null };
      const [ck, ev, pp] = await Promise.all([
        (supabase as any).from("schedule_checkins").select("*").eq("schedule_id", s.id).maybeSingle(),
        (supabase as any).from("schedule_evidencias").select("*").eq("schedule_id", s.id).order("created_at"),
        (supabase as any).from("schedule_proximo_passo").select("*").eq("schedule_id", s.id).maybeSingle(),
      ]);
      return { checkin: ck.data, evidencias: (ev.data ?? []) as any[], proximo: pp.data };
    },
  });
  const [status, setStatus] = useState(s?.status ?? "agendado");
  useEffect(() => { setStatus(s?.status ?? "agendado"); }, [s?.id, s?.status]);
  const [busy, setBusy] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [askReason, setAskReason] = useState<string | null>(null);
  const [lastLocation, setLastLocation] = useState<LocationResult | null>(null);
  const [obs, setObs] = useState(""); const [itens, setItens] = useState<string[]>([]); const [comodato, setComodato] = useState("");
  const [resultado, setResultado] = useState(""); const [resumo, setResumo] = useState(""); const [proximo, setProximo] = useState("");
  const [dataAlvo, setDataAlvo] = useState(""); const [motivoPerda, setMotivoPerda] = useState(""); const [confPerdido, setConfPerdido] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [pts, setPts] = useState({ pending: 0, total: 0 });
  const onPts = useCallback((pending: number, total: number) => setPts({ pending, total }), []);
  const [askLoc, setAskLoc] = useState(false);
  const [naoMotivo, setNaoMotivo] = useState(""); const [showNao, setShowNao] = useState(false);
  useEffect(() => {
    setAskReason(null); setJustificativa(""); setLastLocation(null); setShowNao(false);
    const d = s?.id ? readDraft<Record<string, any>>(`encerrar:${s.id}`) : null;
    setResultado(d?.resultado ?? ""); setResumo(d?.resumo ?? ""); setProximo(d?.proximo ?? ""); setDataAlvo(d?.dataAlvo ?? "");
    setMotivoPerda(d?.motivoPerda ?? ""); setDescricao(d?.descricao ?? ""); setObs(d?.obs ?? ""); setConfPerdido(false);
  }, [s?.id]);
  useEffect(() => { if (s?.id) writeDraft(`encerrar:${s.id}`, { resultado, resumo, proximo, dataAlvo, motivoPerda, descricao, obs }); },
    [s?.id, resultado, resumo, proximo, dataAlvo, motivoPerda, descricao, obs]);

  const done = () => { qc.invalidateQueries({ queryKey: ["schedules"] }); refetch(); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) {
    toast({ title: "Não foi salvo ainda", description: e instanceof Error ? e.message : "Tente de novo. O que você preencheu foi mantido.", variant: "destructive" }); } finally { setBusy(false); } };

  const checkin = (retry = false) => run(async () => {
    if (!s) return;
    const reusable = lastLocation && (!lastLocation.position || Date.now() - lastLocation.position.timestamp <= RECENT_POSITION_MS);
    const location = !retry && reusable ? lastLocation : await getPosition();
    const pos = location.position;
    setLastLocation(location);
    if (!pos) {
      setAskReason("Sem posição disponível: escreva uma justificativa para iniciar.");
      if (retry || justificativa.trim().length < 3) return;
    } else if (retry) { setAskReason(null); }
    try {
      const r = await visitAction<{ distancia_m: number | null }>({ id: s.id, action: "checkin", geolocation_error: location.error, lat: pos?.lat, lng: pos?.lng, precisao: pos?.precisao, justificativa });
      setStatus("em_atendimento"); done();
      if (s.client_id && pos && tecnico) setAskLoc(true);
      toast({ title: "Atendimento iniciado", description: r.distancia_m !== null ? `${r.distancia_m} m do endereço` : undefined });
    } catch (e) {
      if (e instanceof VisitActionError && e.data?.precisa_justificativa) { setAskReason(e.message); return; }
      throw e;
    }
  });

  const addEvidence = (file?: File) => run(async () => {
    let path: string | undefined;
    if (file) {
      const blob = await compress(file);
      path = `${s!.organization_id}/${s!.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("visit-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error("A foto não foi enviada. Verifique a conexão e tente de novo.");
    } else if (!obs.trim() && !itens.length) throw new Error("Tire uma foto ou escreva uma observação");
    await visitAction({ id: s!.id, action: "evidencia", foto_path: path, observacoes: obs, itens, comodato_id: comodato || undefined });
    setObs(""); setItens([]); refetch(); toast({ title: file ? "Foto salva" : "Registro salvo" });
  });

  const checkout = () => run(async () => {
    const r = await visitAction<{ duracao_min: number }>({ id: s!.id, action: "checkout", resultado, resumo, proximo, data_alvo: dataAlvo || null,
      motivo_perda: motivoPerda, confirmar_perdido: confPerdido, descricao });
    setStatus("concluido"); clearDraft(`encerrar:${s!.id}`); done(); toast({ title: "Visita encerrada", description: `Duração: ${r.duracao_min} min` });
  });
  const naoRealizado = () => run(async () => {
    await visitAction({ id: s!.id, action: "nao_realizado", motivo: naoMotivo, observacao: obs });
    setStatus("nao_realizado"); done(); toast({ title: "Registrado como não realizado" });
  });

  if (!s) return null;
  const fotos = (exec?.evidencias ?? []).filter((e) => e.foto_path).length;
  const finished = ["concluido", "nao_realizado", "cancelado"].includes(status);
  const faltas = faltasParaEncerrar({ finished, resultado, resumo, proximo, pendingPoints: pts.pending, totalPoints: pts.total,
    fotoObrigatoria, fotos, dataAlvo, motivoPerda, confPerdido });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientName || s.title}</DialogTitle>
          <DialogDescription>{s.scheduled_date.split("-").reverse().join("/")} {s.start_time?.slice(0, 5)} · {tecnico ? "Visita técnica" : "Visita comercial"}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Badge>{STATUS_LABEL[status] ?? status}</Badge>
          {s.confirmacao_status && CONFIRMACAO_LABEL[s.confirmacao_status] && <Badge variant="outline">{CONFIRMACAO_LABEL[s.confirmacao_status]}</Badge>}
        </div>
        {s.location && <p className="text-sm text-muted-foreground flex gap-1"><MapPin className="h-4 w-4 mt-0.5 shrink-0" />{s.location}</p>}

        {exec?.checkin && (
          <p className="text-sm">Check-in {new Date(exec.checkin.checkin_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {exec.checkin.distancia_m !== null ? ` · ${exec.checkin.distancia_m} m do endereço` : exec.checkin.latitude == null ? " · sem localização" : ""}
            {exec.checkin.geolocation_error && <span className="block text-muted-foreground">{locationErrorMessage(exec.checkin.geolocation_error)}</span>}
            {exec.checkin.fora_do_raio && <Badge variant="destructive" className="ml-2">Fora do local</Badge>}
            {exec.checkin.justificativa && <span className="block text-muted-foreground">Justificativa: {exec.checkin.justificativa}</span>}</p>
        )}

        {(status === "agendado" || status === "confirmado") && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Ao iniciar, o Fera registra sua localização uma única vez para confirmar a chegada ao cliente.</p>
            {lastLocation?.error && <div role="status" className="space-y-2">
              <p className="text-sm text-warning">{locationErrorMessage(lastLocation.error)}{lastLocation.cached && " Última posição recente recuperada."}</p>
              <Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => checkin(true)}><MapPin className="h-4 w-4" />Tentar de novo</Button>
            </div>}
            {askReason && (<div className="space-y-2"><Label>{askReason}</Label>
              <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={300} placeholder="Ex.: cliente pediu para encontrar no depósito" /></div>)}
            <Button className="w-full min-h-12 text-base" onClick={() => checkin()} disabled={busy}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}Iniciar atendimento</Button>
            <Button variant="outline" className="w-full min-h-11" onClick={() => setShowNao((v) => !v)}><XCircle className="h-4 w-4" />Não realizado</Button>
          </div>
        )}

        {status === "em_atendimento" && (
          <div className="space-y-4">
            {askLoc && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm">Usar esta localização como endereço do cliente?</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="min-h-11" disabled={busy} onClick={() => run(async () => { await baseAction({ action: "localizacao_cliente", schedule_id: s.id, confirmar: true });
                    setAskLoc(false); toast({ title: "Localização do cliente atualizada" }); })}>Sim, usar</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => setAskLoc(false)}>Não</Button>
                </div>
              </div>)}
            {tecnico && s.client_id && <PointChecklist scheduleId={s.id} orgId={s.organization_id} clientId={s.client_id} onPendingChange={onPts} />}
            <section className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold text-sm">Registro {fotoObrigatoria && "(foto obrigatória)"}</h3>
              {loans.length > 0 && (
                <Select value={comodato} onValueChange={setComodato}>
                  <SelectTrigger><SelectValue placeholder="Comodato (opcional)" /></SelectTrigger>
                  <SelectContent>{loans.map((c) => <SelectItem key={c.id} value={c.id}>{c.numero_contrato || c.linha_produto || "Comodato"}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {tecnico && <div className="grid grid-cols-2 gap-2">{ITEM_OPTIONS.map((i) => (
                <label key={i.value} className="flex items-center gap-2 text-sm min-h-9"><Checkbox checked={itens.includes(i.value)}
                  onCheckedChange={(v) => setItens((cur) => v ? [...cur, i.value] : cur.filter((x) => x !== i.value))} />{i.label}</label>))}</div>}
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações" maxLength={1000} />
              <p className="text-xs text-muted-foreground">Fotografe só o equipamento, sem pessoas ou documentos.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="min-h-11" disabled={busy}>
                  <label className="cursor-pointer"><Camera className="h-4 w-4" />Tirar foto
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addEvidence(f); }} /></label>
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => addEvidence()} disabled={busy}>Salvar registro</Button>
              </div>
              <p className="text-xs text-muted-foreground">{fotos} foto(s) · {(exec?.evidencias ?? []).length} registro(s)</p>
            </section>

            <section className="space-y-3 rounded-lg border p-3">
              <h3 className="font-semibold text-sm">Encerrar</h3>
              <div className="grid grid-cols-3 gap-2">{(tecnico ? ["concluida", "com_problema"] : ["boa", "mediana", "ruim"]).map((r) => (
                <Button key={r} type="button" variant={resultado === r ? "default" : "outline"} className="min-h-11 text-xs" onClick={() => setResultado(r)}>{RESULT_LABEL[r]}</Button>))}</div>
              <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Resumo curto da visita" maxLength={500} />
              <Label>Próximo passo</Label>
              <Select value={proximo} onValueChange={setProximo}>
                <SelectTrigger><SelectValue placeholder="Escolha o próximo passo" /></SelectTrigger>
                <SelectContent>{Object.entries(NEXT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              {(proximo === "follow_up" || proximo === "novo_agendamento") && (
                <div><Label>{proximo === "follow_up" ? "Data do follow-up" : "Data sugerida (opcional)"}</Label>
                  <Input type="date" value={dataAlvo} onChange={(e) => setDataAlvo(e.target.value)} />
                  {proximo === "follow_up" && <div className="flex gap-2 mt-2">{[3, 6].map((m) => (
                    <Button key={m} type="button" size="sm" variant="outline" onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + m); setDataAlvo(d.toISOString().slice(0, 10)); }}>{m} meses</Button>))}</div>}
                </div>)}
              {proximo === "proposta" && <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que vai na proposta (opcional)" maxLength={300} />}
              {proximo === "perdido" && (<div className="space-y-2">
                <Input value={motivoPerda} onChange={(e) => setMotivoPerda(e.target.value)} placeholder="Motivo da perda" maxLength={200} />
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={confPerdido} onCheckedChange={(v) => setConfPerdido(!!v)} />Confirmo que o lead será marcado como perdido</label>
              </div>)}
            </section>
            <Button variant="ghost" className="w-full" onClick={() => setShowNao((v) => !v)}>Não foi possível realizar</Button>
            {/* Fixed footer: what is still missing + the close button, always visible. */}
            <div className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background/95 backdrop-blur px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2">
              <p className={faltas.length ? "text-sm text-warning" : "text-sm text-success"} aria-live="polite">
                {faltas.length ? `Para encerrar falta: ${faltas.join(" / ")}` : "Tudo pronto para encerrar."}</p>
              <Button className="w-full min-h-12 text-base" onClick={checkout} disabled={busy || faltas.length > 0}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}Encerrar visita</Button>
            </div>
          </div>
        )}

        {showNao && !finished && (
          <div className="space-y-2 rounded-lg border p-3">
            <Select value={naoMotivo} onValueChange={setNaoMotivo}>
              <SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger>
              <SelectContent>{Object.entries(NAO_REALIZADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" maxLength={300} />
            <Button variant="destructive" className="w-full min-h-11" onClick={naoRealizado} disabled={busy || !naoMotivo}>Registrar não realizado</Button>
          </div>
        )}

        {finished && (
          <div className="space-y-1 text-sm">
            {s.resultado && <p><strong>Resultado:</strong> {RESULT_LABEL[s.resultado] ?? s.resultado}{s.duracao_min != null && ` · ${s.duracao_min} min`}</p>}
            {s.nao_realizado_motivo && <p><strong>Motivo:</strong> {NAO_REALIZADO_LABEL[s.nao_realizado_motivo] ?? s.nao_realizado_motivo}</p>}
            {s.resumo_execucao && <p><strong>Resumo:</strong> {s.resumo_execucao}</p>}
            {exec?.proximo && <p><strong>Próximo passo:</strong> {NEXT_LABEL[exec.proximo.tipo]}{exec.proximo.data_alvo && ` (${exec.proximo.data_alvo.split("-").reverse().join("/")})`}{exec.proximo.motivo_perda && ` — ${exec.proximo.motivo_perda}`}</p>}
            {exec?.proximo?.tipo === "proposta" && (exec.proximo.proposta_enviada_em
              ? <p className="text-muted-foreground">Proposta enviada em {new Date(exec.proximo.proposta_enviada_em).toLocaleDateString("pt-BR")}</p>
              : <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => {
                  await visitAction({ id: s.id, action: "proposta_enviada" }); refetch(); toast({ title: "Proposta marcada como enviada" }); })}>Marcar proposta enviada</Button>)}
            {fotos > 0 && <p className="text-muted-foreground">{fotos} foto(s) registrada(s)</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
