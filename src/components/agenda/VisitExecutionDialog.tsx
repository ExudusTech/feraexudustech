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
import { clearDraft, faltasDetalhadas, readDraft, writeDraft, type FaltaAlvo } from "@/lib/visit-draft";
import { FREQ_LABEL, FREQ_RAPIDAS } from "@/lib/base-instalada";
import { serviceKind } from "@/lib/service-kind";
import { spDate, sugestaoTermino } from "@/lib/visit-exec";
import LevantamentoComercial from "@/components/agenda/LevantamentoComercial";
import { ProntidaoBadge, MaterialFields, CnpjGate, MaterialSeparadoButton, emptyMaterial, type MaterialValue, type CnpjStatus } from "@/components/agenda/MaterialPronto";
import { NotaLink } from "@/pages/Tarefas";
import { OPERACAO_LABEL, TIPO_NOTA_LABEL, itensTexto, type OperacaoMaterial, type TipoNota } from "@/lib/prontidao";
import { useCreateSchedule } from "@/hooks/use-schedules";
import { locationErrorMessage, RECENT_POSITION_MS, type LocationResult } from "@/lib/geolocation";
import ColetaOcorrencia from "@/components/agenda/ColetaOcorrencia";
import { OCORRENCIA_LABEL, exigeColeta, type OcorrenciaTipo } from "@/lib/coleta";
import { usePermissions } from "@/hooks/use-permissions";

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
      const tf = (s as any).operacao_material ? await (supabase as any).from("tarefas_faturamento").select("numero, status, numero_nota, pdf_path").eq("schedule_id", s.id).maybeSingle() : { data: null };
      return { checkin: ck.data, evidencias: (ev.data ?? []) as any[], proximo: pp.data, tarefa: tf.data as any };
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
  const [descricao, setDescricao] = useState(""); const [frequencia, setFrequencia] = useState(""); const [termino, setTermino] = useState("");
  const checkinEm = (s as any)?.checkin_em as string | null | undefined;
  const outroDia = !!checkinEm && spDate(checkinEm) < spDate(new Date());
  useEffect(() => { if (outroDia && checkinEm) setTermino(sugestaoTermino(checkinEm, 60)); }, [outroDia, checkinEm]);
  const usaPlano = tecnico && !!s?.client_id;
  const { data: plano } = useQuery({
    queryKey: ["plano-cliente", s?.client_id], enabled: open && usaPlano,
    queryFn: async () => {
      const { data } = await (supabase as any).from("planos_manutencao").select("id, frequencia").eq("client_id", s!.client_id).eq("ativo", true).limit(1).maybeSingle();
      if (!data) return null;
      const { data: prox } = await (supabase as any).from("schedules").select("scheduled_date").eq("plano_manutencao_id", data.id)
        .gt("scheduled_date", s!.scheduled_date).in("status", ["agendado", "confirmado"]).order("scheduled_date").limit(1).maybeSingle();
      return { ...data, proxima: prox?.scheduled_date as string | undefined };
    },
  });
  const [teste, setTeste] = useState<MaterialValue>({ ...emptyMaterial, operacao: "instalacao_teste", tipo_nota: "remessa_teste" });
  const [testeCnpj, setTesteCnpj] = useState<CnpjStatus>({ ok: false });
  const createSchedule = useCreateSchedule();
  const comColeta = !tecnico && exigeColeta((s as any)?.ocorrencia_tipo);
  const proximoEfetivo = comColeta ? "coleta" : usaPlano ? (plano || frequencia ? "plano" : "") : proximo === "teste" ? "novo_agendamento" : proximo;
  const [pts, setPts] = useState({ pending: 0, total: 0 });
  const onPts = useCallback((pending: number, total: number) => setPts({ pending, total }), []);
  const [askLoc, setAskLoc] = useState(false); const [registroAberto, setRegistroAberto] = useState(false);
  const [naoMotivo, setNaoMotivo] = useState(""); const [showNao, setShowNao] = useState(false);
  const { hasRole } = usePermissions();
  const gestor = hasRole("gestor") || hasRole("admin") || hasRole("super_admin");
  const [liberarMotivo, setLiberarMotivo] = useState(""); const [bloqueioNota, setBloqueioNota] = useState<string | null>(null);
  const [substResultado, setSubstResultado] = useState<"" | "trocou" | "nao_trocou">("");
  const sx = s as any;
  const ehSubstituicao = sx?.operacao_material === "substituicao";
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
      const r = await visitAction<{ distancia_m: number | null; destino_sem_coordenadas?: boolean }>({ id: s.id, action: "checkin", geolocation_error: location.error, lat: pos?.lat, lng: pos?.lng, precisao: pos?.precisao, justificativa });
      setStatus("em_atendimento"); done();
      // Destination without coordinates: offer this position as the client/lead address (consultant confirms).
      if ((s.client_id || s.lead_id) && pos && r.destino_sem_coordenadas) setAskLoc(true);
      toast({ title: "Atendimento iniciado", description: r.distancia_m !== null ? `${r.distancia_m} m do endereço` : r.destino_sem_coordenadas ? "Local do cliente sem coordenadas: distância não verificada" : undefined });
    } catch (e) {
      if (e instanceof VisitActionError && e.data?.precisa_justificativa) { setAskReason(e.message); return; }
      if (e instanceof VisitActionError && e.data?.bloqueado_nota) { setBloqueioNota(e.message); return; }
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
    const ehTeste = !comColeta && proximo === "teste";
    const r = await visitAction<{ duracao_min: number }>({ id: s!.id, action: "checkout", resultado, resumo, proximo: comColeta ? undefined : proximoEfetivo, data_alvo: dataAlvo || null,
      motivo_perda: motivoPerda, confirmar_perdido: proximo === "perdido", substituicao_resultado: substResultado || undefined, descricao: ehTeste ? `Instalação de teste: ${itensTexto(teste.itens)}` : descricao, frequencia: frequencia || undefined, termino: outroDia ? termino : undefined });
    if (ehTeste) {
      await createSchedule.mutateAsync({ title: `Instalação de teste — ${clientName || s!.title}`, scheduled_date: dataAlvo, start_time: s!.start_time,
        end_time: null, schedule_type: "visita_tecnica", schedule_subtype: "INSTALACAO", client_id: s!.client_id, lead_id: s!.lead_id,
        location: s!.location, zip_code: s!.zip_code, assigned_to: s!.assigned_to, latitude: (s as any).latitude ?? null, longitude: (s as any).longitude ?? null,
        operacao_material: "instalacao_teste", tipo_nota: teste.tipo_nota || "remessa_teste", itens: teste.itens } as any);
    }
    setStatus("concluido"); clearDraft(`encerrar:${s!.id}`); done();
    const cp = (r as any).coleta_pendente as string[] | undefined;
    toast({ title: cp?.length ? "Realizada — informações pendentes" : "Visita encerrada", description: cp?.length ? `Falta: ${cp.slice(0, 3).join(", ")}${cp.length > 3 ? "…" : ""}` : `Duração: ${r.duracao_min} min` });
  });
  const naoRealizado = () => run(async () => {
    await visitAction({ id: s!.id, action: "nao_realizado", motivo: naoMotivo, observacao: obs });
    setStatus("nao_realizado"); done(); toast({ title: "Registrado como não realizado" });
  });

  if (!s) return null;
  const fotos = (exec?.evidencias ?? []).filter((e) => e.foto_path).length;
  const finished = ["concluido", "nao_realizado", "cancelado"].includes(status);
  const faltas = faltasDetalhadas({ finished, resultado, resumo, proximo: proximoEfetivo, pendingPoints: pts.pending, totalPoints: pts.total,
    fotoObrigatoria, fotos, dataAlvo, motivoPerda, tecnico: usaPlano });
  if (proximo === "teste" && !usaPlano && !comColeta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAlvo) || dataAlvo <= spDate(new Date())) faltas.push({ label: "data da instalação de teste", alvo: "proximo" });
    if (!teste.itens.length) faltas.push({ label: "itens da instalação de teste", alvo: "proximo" });
    if (!testeCnpj.ok) faltas.push({ label: "CNPJ da empresa", alvo: "proximo" });
  }
  if (ehSubstituicao && !substResultado) faltas.push({ label: "se o aparelho foi trocado", alvo: "resultado" });
  if (outroDia && !/^\d{2}:\d{2}$/.test(termino)) faltas.push({ label: "horário real de término", alvo: "resultado" });
  const irPara = (alvo: FaltaAlvo) => {
    if (alvo === "registro") setRegistroAberto(true);
    setTimeout(() => document.getElementById(`visita-${alvo}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientName || s.title}</DialogTitle>
          <DialogDescription>{s.scheduled_date.split("-").reverse().join("/")} {s.start_time?.slice(0, 5)} · {serviceKind(s.schedule_type, s.schedule_subtype)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {sx.ocorrencia_codigo && <Badge variant="outline">#{sx.ocorrencia_codigo}</Badge>}
          {sx.ocorrencia_tipo && <Badge variant="secondary">{OCORRENCIA_LABEL[sx.ocorrencia_tipo as OcorrenciaTipo] ?? sx.ocorrencia_tipo}</Badge>}
          <Badge>{status === "concluido" && sx.coleta_status === "pendente" ? "Realizada — informações pendentes" : STATUS_LABEL[status] ?? status}</Badge>
          {(status === "agendado" || status === "confirmado") && s.confirmacao_status && CONFIRMACAO_LABEL[s.confirmacao_status] && <Badge variant="outline">{CONFIRMACAO_LABEL[s.confirmacao_status]}</Badge>}
        </div>
        {(s as any).operacao_material && (
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{OPERACAO_LABEL[(s as any).operacao_material as OperacaoMaterial]}</strong>
              {(s as any).prontidao === "pronto" ? <Badge variant="outline" className="border-success text-success">Pronto: nota e material ok</Badge> : <ProntidaoBadge prontidao={(s as any).prontidao} />}
            </div>
            <p className="text-muted-foreground">Itens: {itensTexto((s as any).itens)}</p>
            <div className="flex flex-wrap items-center gap-2">
              {exec?.tarefa?.status === "concluida" ? <>Nota {exec.tarefa.numero_nota} ({TIPO_NOTA_LABEL[(s as any).tipo_nota as TipoNota] ?? "nota"}){exec.tarefa.pdf_path && <NotaLink path={exec.tarefa.pdf_path} />}</>
                : <span className="text-muted-foreground">Nota com o Faturamento{exec?.tarefa ? ` (#T-${exec.tarefa.numero})` : ""}</span>}
              {!finished && <MaterialSeparadoButton scheduleId={s.id} separado={(s as any).material_status === "separado"} onDone={done} />}
            </div>
          </div>
        )}
        {s.location && <p className="text-sm text-muted-foreground flex gap-1"><MapPin className="h-4 w-4 mt-0.5 shrink-0" />{s.location}</p>}

        {exec?.checkin && (
          <p className="text-sm">Check-in {new Date(exec.checkin.checkin_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {exec.checkin.distancia_m !== null ? ` · ${exec.checkin.distancia_m} m do endereço` : exec.checkin.latitude == null ? " · sem localização" : ""}
            {exec.checkin.geolocation_error && <span className="block text-muted-foreground">{locationErrorMessage(exec.checkin.geolocation_error)}</span>}
            {exec.checkin.fora_do_raio && <Badge variant="destructive" className="ml-2">Fora do local</Badge>}
            {exec.checkin.destino_sem_coordenadas && exec.checkin.latitude != null && <Badge variant="outline" className="ml-2 border-warning text-warning">Local do cliente sem coordenadas</Badge>}
            {exec.checkin.justificativa && <span className="block text-muted-foreground">Justificativa: {exec.checkin.justificativa}</span>}</p>
        )}

        {(status === "agendado" || status === "confirmado") && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Ao iniciar, o Fera registra sua localização uma única vez para confirmar a chegada ao cliente.</p>
            {sx.exige_nota && sx.nota_status !== "anexada" && (sx.checkin_liberado_em
              ? <p className="text-sm text-warning">Check-in liberado sem nota pelo gestor: {sx.checkin_liberacao_motivo}</p>
              : <div role="alert" className="rounded-md border border-destructive p-2 space-y-2 text-sm">
                  <p className="text-destructive">{bloqueioNota ?? "A nota fiscal desta operação ainda não foi anexada: o check-in fica bloqueado até o faturamento anexar."}</p>
                  {gestor && <div className="flex gap-2"><Input value={liberarMotivo} onChange={(e) => setLiberarMotivo(e.target.value)} placeholder="Motivo da exceção" maxLength={300} />
                    <Button variant="outline" disabled={busy || liberarMotivo.trim().length < 5} onClick={() => run(async () => {
                      await visitAction({ id: s.id, action: "liberar_checkin", motivo: liberarMotivo }); setBloqueioNota(null); done(); toast({ title: "Check-in liberado (exceção registrada)" }); })}>Liberar</Button></div>}
                </div>)}
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
                <p className="text-sm">Este é o endereço do cliente? O cadastro não tem coordenadas; se você está no local, use sua posição atual (fica registrado que veio do check-in).</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="min-h-11" disabled={busy} onClick={() => run(async () => { await baseAction({ action: "localizacao_cliente", schedule_id: s.id, confirmar: true });
                    setAskLoc(false); toast({ title: "Localização do cliente atualizada" }); })}>Sim, usar</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => setAskLoc(false)}>Não</Button>
                </div>
              </div>)}
            {sx.coleta_devolucao_tarefa_id && !sx.devolucao_assinada_em && (
              <div className="rounded-lg border border-warning p-3 space-y-2">
                <p className="text-sm font-medium">Coletar assinatura da nota de devolução de comodato</p>
                <Button asChild variant="outline" className="w-full min-h-11" disabled={busy}>
                  <label className="cursor-pointer"><Camera className="h-4 w-4" />Foto da nota assinada
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(async () => {
                      const blob = await compress(f); const path = `${s.organization_id}/${s.id}/${crypto.randomUUID()}.jpg`;
                      const { error } = await supabase.storage.from("visit-photos").upload(path, blob, { contentType: "image/jpeg" });
                      if (error) throw new Error("A foto não foi enviada. Verifique a conexão e tente de novo.");
                      await visitAction({ id: s.id, action: "devolucao_assinada", foto_path: path }); done(); toast({ title: "Assinatura registrada: OS encerrada" }); }); }} /></label>
                </Button>
              </div>)}
            <ColetaOcorrencia scheduleId={s.id} orgId={s.organization_id} codigo={sx.ocorrencia_codigo} tipo={sx.ocorrencia_tipo} status={sx.coleta_status} rascunho={sx.coleta_rascunho} onChange={done} />
            {!tecnico && !comColeta && <LevantamentoComercial scheduleId={s.id} clientId={s.client_id} leadId={s.lead_id} initial={(s as any).levantamento ?? null} />}
            {tecnico && (s.client_id || s.lead_id) && <PointChecklist scheduleId={s.id} orgId={s.organization_id} clientId={s.client_id} leadId={s.lead_id} onPendingChange={onPts} />}
            {usaPlano && !registroAberto ? (
              <Button variant="ghost" className="w-full" onClick={() => setRegistroAberto(true)}>+ Foto ou observação extra (opcional)</Button>
            ) : (
            <section id="visita-registro" className="space-y-2 rounded-lg border p-3 scroll-mt-4">
              <h3 className="font-semibold text-sm">{usaPlano ? "Registro extra (opcional)" : `Registro${fotoObrigatoria ? " (foto obrigatória)" : ""}`}</h3>
              {loans.length > 0 && (
                <Select value={comodato} onValueChange={setComodato}>
                  <SelectTrigger><SelectValue placeholder="Comodato (opcional)" /></SelectTrigger>
                  <SelectContent>{loans.map((c) => <SelectItem key={c.id} value={c.id}>{c.numero_contrato || c.linha_produto || "Comodato"}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {tecnico && !usaPlano && <div className="grid grid-cols-2 gap-2">{ITEM_OPTIONS.map((i) => (
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
            </section>)}

            <section className="space-y-3 rounded-lg border p-3">
              <h3 id="visita-resultado" className="font-semibold text-sm scroll-mt-4">Encerrar</h3>
              <div className={tecnico ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>{(tecnico ? ["concluida", "com_problema"] : ["boa", "mediana", "ruim"]).map((r) => (
                <Button key={r} type="button" variant={resultado === r ? "default" : "outline"} className="min-h-12 h-auto whitespace-normal leading-tight text-sm" onClick={() => setResultado(r)}>{RESULT_LABEL[r]}</Button>))}</div>
              {outroDia && <div className="space-y-1 rounded-md border border-warning p-2">
                <Label htmlFor="termino-real">A visita ficou aberta desde {checkinEm!.slice(8, 10)}/{checkinEm!.slice(5, 7)}. Que horas ela terminou de verdade?</Label>
                <Input id="termino-real" type="time" value={termino} onChange={(e) => setTermino(e.target.value)} />
                <p className="text-xs text-muted-foreground">Sugestão: check-in + 1 h. A duração é calculada por este horário.</p></div>}
              {ehSubstituicao && <div className="space-y-1"><Label>O aparelho levado foi trocado?</Label>
                <div className="grid grid-cols-2 gap-2">{([["trocou", "Sim, troquei"], ["nao_trocou", "Não precisou"]] as const).map(([k, l]) => (
                  <Button key={k} type="button" variant={substResultado === k ? "default" : "outline"} className="min-h-12" onClick={() => setSubstResultado(k)}>{l}</Button>))}</div>
                <p className="text-xs text-muted-foreground">{substResultado === "nao_trocou" ? "O faturamento cancela a nota (até 24h) e o aparelho volta ao estoque." : substResultado === "trocou" ? "Registre o aparelho novo no ponto com foto. A nota de devolução será assinada na próxima visita da rota." : ""}</p></div>}
              {exigeColeta(sx.ocorrencia_tipo) && sx.coleta_status !== "confirmada" && <p className="text-xs text-muted-foreground">Pode encerrar agora: a ocorrência fica "Realizada — informações pendentes" até você confirmar a coleta.</p>}
              <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Resumo (opcional)" maxLength={500} />
              {!comColeta && <div id="visita-proximo" className="space-y-2 scroll-mt-4">
                <Label>Próximo passo</Label>
                {usaPlano ? (plano ? (
                  <p className="text-sm">Próxima visita do plano ({FREQ_LABEL[plano.frequencia] ?? plano.frequencia}){plano.proxima && `: ${plano.proxima.split("-").reverse().join("/")}`}. Nada a escolher.</p>
                ) : (<>
                  <p className="text-xs text-muted-foreground">Este cliente ainda não tem plano. De quanto em quanto tempo voltar?</p>
                  <div className="grid grid-cols-3 gap-2">{FREQ_RAPIDAS.map((fq) => (
                    <Button key={fq} type="button" variant={frequencia === fq ? "default" : "outline"} className="min-h-12 h-auto whitespace-normal" onClick={() => setFrequencia(fq)}>{FREQ_LABEL[fq]}</Button>))}</div>
                </>)) : (<>
                  <div className="grid grid-cols-2 gap-2">{([["novo_agendamento", "Agendar nova visita"], ["teste", "Instalação de teste"], ["proposta", "Enviar proposta"], ["follow_up", "Retornar em…"], ["perdido", "Perdido"]] as const).map(([k, l]) => (
                    <Button key={k} type="button" variant={proximo === k ? (k === "perdido" ? "destructive" : "default") : "outline"} className="min-h-12 h-auto whitespace-normal leading-tight"
                      onClick={() => { setProximo(k); setDataAlvo(""); }}>{l}</Button>))}</div>
                  {proximo === "teste" && (
                    <div className="space-y-2">
                      <Input type="date" aria-label="Data da instalação de teste" value={dataAlvo} onChange={(e) => setDataAlvo(e.target.value)} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><MaterialFields scheduleType="visita_tecnica" value={teste} onChange={(v) => setTeste({ ...v, operacao: "instalacao_teste" })} /></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><CnpjGate target={s.client_id ? { kind: "cliente", id: s.client_id } : s.lead_id ? { kind: "lead", id: s.lead_id } : null} onStatus={setTesteCnpj} /></div>
                      <p className="text-xs text-muted-foreground">Ao encerrar, o Fera cria a instalação de teste com a tarefa de nota e a lista de material.</p>
                    </div>)}
                  {(proximo === "follow_up" || proximo === "novo_agendamento") && (
                    <Input type="date" aria-label={proximo === "follow_up" ? "Data do retorno" : "Data sugerida (opcional)"} value={dataAlvo} onChange={(e) => setDataAlvo(e.target.value)} />)}
                  {proximo === "proposta" && <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que vai na proposta (opcional)" maxLength={300} />}
                  {proximo === "perdido" && <Input value={motivoPerda} onChange={(e) => setMotivoPerda(e.target.value)} placeholder="Motivo da perda" maxLength={200} />}
                </>)}
              </div>}
            </section>
            <Button variant="ghost" className="w-full" onClick={() => setShowNao((v) => !v)}>Não foi possível realizar</Button>
            {/* Fixed footer: what is still missing + the close button, always visible. */}
            <div className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background/95 backdrop-blur px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2">
              <p className={faltas.length ? "text-sm text-warning" : "text-sm text-success"} aria-live="polite">
                {faltas.length ? <>Para encerrar falta:{" "}{faltas.map((f, i) => (
                  <span key={f.label}>{i > 0 && " / "}<button type="button" className="underline font-medium" onClick={() => irPara(f.alvo)}>{f.label}</button></span>))}</> : "Tudo pronto para encerrar."}</p>
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

        {status === "concluido" && sx.coleta_status && sx.coleta_status !== "confirmada" && (
          <ColetaOcorrencia scheduleId={s.id} orgId={s.organization_id} codigo={sx.ocorrencia_codigo} tipo={sx.ocorrencia_tipo} status={sx.coleta_status} rascunho={sx.coleta_rascunho} onChange={done} />)}
        {status === "concluido" && !sx.coleta_status && exigeColeta(sx.ocorrencia_tipo) && (
          <ColetaOcorrencia scheduleId={s.id} orgId={s.organization_id} codigo={sx.ocorrencia_codigo} tipo={sx.ocorrencia_tipo} status={null} rascunho={null} onChange={done} />)}
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
