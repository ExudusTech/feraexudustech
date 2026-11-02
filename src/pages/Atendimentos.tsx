import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Hand, CheckCircle2, MessageCircle, Undo2, Send, ExternalLink, XCircle } from "lucide-react";
import PainelAgora, { NIVEL_STYLE, formatEspera } from "@/components/atendimentos/PainelAgora";
import AtendimentoMetrics from "@/components/atendimentos/AtendimentoMetrics";
import ResolveDialog from "@/components/atendimentos/ResolveDialog";
import LeadTimeline from "@/components/crm/LeadTimeline";
import { RESULTADO_LABEL, STATUS_LABEL, useAtendimentoAction, useAtendimentos, useConversa, type Atendimento } from "@/hooks/use-atendimentos";
import { useHumanService } from "@/hooks/use-human-service";
import { useOrganizationUsers } from "@/hooks/use-users";
import { esperaMinutos, nivel } from "@/lib/atendimento-metrics";
import { cn } from "@/lib/utils";

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

function Detail({ a, onResolve }: { a: Atendimento; onResolve: () => void }) {
  const action = useAtendimentoAction();
  const { data: conversa, isLoading } = useConversa(a.id, !!a.chat_id);
  const { data: users = [] } = useOrganizationUsers();
  const [msg, setMsg] = useState("");
  const open = a.status === "aberto" || a.status === "em_atendimento";
  const name = (id: string | null) => users.find((u) => u.user_id === id)?.name ?? "—";
  const wa = a.whatsapp?.replace(/\D/g, "");
  const send = async () => { await action.mutateAsync({ id: a.id, action: "enviar", mensagem: msg.trim() }); setMsg(""); };

  return (
    <div className="space-y-5">
      <div className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Status</span><span>{STATUS_LABEL[a.status]}</span>
        <span className="text-muted-foreground">Responsável</span><span>{name(a.responsavel_id)}</span>
        <span className="text-muted-foreground">Aberto em</span><span>{when(a.aberto_em)}{a.recebido_fora_horario ? " (fora do horário)" : ""}</span>
        <span className="text-muted-foreground">Assumido</span><span>{a.assumido_em ? `${when(a.assumido_em)} — ${name(a.assumido_por)}` : "—"}</span>
        {a.resolvido_em && <><span className="text-muted-foreground">Finalizado</span><span>{when(a.resolvido_em)} — {name(a.resolvido_por)}</span></>}
        {a.resultado && <><span className="text-muted-foreground">Resultado</span><span>{RESULTADO_LABEL[a.resultado]}</span></>}
        {a.resolucao && <><span className="text-muted-foreground">Resolução</span><span>{a.resolucao}</span></>}
        {a.motivo && <><span className="text-muted-foreground">Motivo</span><span>{a.motivo}</span></>}
      </div>
      {a.resumo && <p className="text-sm rounded-lg bg-muted/40 p-3">{a.resumo}</p>}
      <div className="grid grid-cols-2 gap-2">
        {a.lead_id && <Button asChild variant="outline" className="min-h-11"><Link to={`/leads?lead=${a.lead_id}`}><ExternalLink className="h-4 w-4 mr-1" />Abrir lead</Link></Button>}
        {wa && <Button asChild variant="outline" className="min-h-11"><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a></Button>}
        {a.status === "aberto" && <Button className="min-h-11" disabled={action.isPending} onClick={() => action.mutate({ id: a.id, action: "assumir" })}><Hand className="h-4 w-4 mr-1" />Assumir</Button>}
        {open && <Button variant="secondary" className="min-h-11" onClick={onResolve}><CheckCircle2 className="h-4 w-4 mr-1" />Resolver</Button>}
        {a.humano_ativo && <Button variant="outline" className="min-h-11" disabled={action.isPending} onClick={() => action.mutate({ id: a.id, action: "devolver" })}><Undo2 className="h-4 w-4 mr-1" />Devolver para a Flora</Button>}
        {open && <Button variant="ghost" className="min-h-11" disabled={action.isPending} onClick={() => action.mutate({ id: a.id, action: "encerrar" })}><XCircle className="h-4 w-4 mr-1" />Encerrar sem resposta</Button>}
      </div>

      {a.chat_id && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Conversa {a.humano_ativo ? <Badge variant="secondary" className="ml-1">Flora pausada</Badge> : null}</h3>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border p-2 space-y-2 bg-card/40">
            {isLoading ? <p className="text-sm text-muted-foreground">Carregando conversa…</p>
              : !conversa?.disponivel ? <p className="text-sm text-muted-foreground">Não foi possível buscar a conversa agora.</p>
              : conversa.mensagens.length === 0 ? <p className="text-sm text-muted-foreground">Sem mensagens.</p>
              : conversa.mensagens.map((m, i) => (
                <div key={i} className={cn("rounded-lg px-3 py-2 text-sm max-w-[85%]", m.autor === "Cliente" ? "bg-muted" : "bg-primary/10 ml-auto")}>
                  <p className="text-[11px] text-muted-foreground">{m.autor}{m.quando ? ` · ${when(m.quando)}` : ""}</p>
                  <p className="whitespace-pre-wrap">{m.texto}</p>
                </div>
              ))}
          </div>
          {open && (
            <div className="space-y-2">
              <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={2000} placeholder="Responder pelo canal da NitsClean…" aria-label="Mensagem" />
              <Button className="min-h-11 w-full sm:w-auto" disabled={!msg.trim() || action.isPending} onClick={send}><Send className="h-4 w-4 mr-1" />Enviar</Button>
              <p className="text-xs text-muted-foreground">Ao responder, a Flora fica pausada neste chat até você devolver.</p>
            </div>
          )}
        </section>
      )}
      {a.lead_id && <section className="space-y-2"><h3 className="text-sm font-semibold">Histórico do lead</h3><LeadTimeline leadId={a.lead_id} /></section>}
    </div>
  );
}

export default function Atendimentos() {
  const [params, setParams] = useSearchParams();
  const { data = [] } = useAtendimentos();
  const svc = useHumanService();
  const [resolving, setResolving] = useState<Atendimento | null>(null);
  const selectedId = params.get("id");
  const selected = useMemo(() => data.find((a) => a.id === selectedId) ?? null, [data, selectedId]);
  const closeDetail = () => { params.delete("id"); setParams(params, { replace: true }); };
  useEffect(() => { /* keep URL deep links working after login */ }, [selectedId]);

  return (
    <AppLayout title="Atendimentos" subtitle="Pedidos de atendimento humano vindos da Flora">
      <Tabs defaultValue="agora">
        <TabsList><TabsTrigger value="agora">Agora</TabsTrigger><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="metricas">Métricas</TabsTrigger></TabsList>
        <TabsContent value="agora"><PainelAgora /></TabsContent>
        <TabsContent value="todos">
          <Card><CardContent className="pt-4">
            {data.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum atendimento ainda.</p> : (
              <ul className="divide-y divide-border">
                {data.map((a) => {
                  const lvl = nivel(a, svc);
                  return (
                    <li key={a.id}>
                      <button className="w-full text-left py-3 flex flex-wrap items-center gap-2 min-h-11" onClick={() => setParams({ id: a.id })}>
                        <span className={cn("rounded-full border px-2 py-0.5 text-xs tabular-nums", NIVEL_STYLE[lvl])}>{formatEspera(esperaMinutos(a, svc))}</span>
                        <span className="font-medium">{a.empresa || a.contato_nome || "Cliente"}</span>
                        <Badge variant="outline">{STATUS_LABEL[a.status]}</Badge>
                        {a.resultado && <Badge variant="secondary">{RESULTADO_LABEL[a.resultado]}</Badge>}
                        <span className="ml-auto text-xs text-muted-foreground">{when(a.aberto_em)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="metricas"><AtendimentoMetrics /></TabsContent>
      </Tabs>
      <Sheet open={!!selected} onOpenChange={(o) => !o && closeDetail()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>{selected?.empresa || selected?.contato_nome || "Atendimento"}</SheetTitle></SheetHeader>
          {selected && <div className="mt-4"><Detail a={selected} onResolve={() => setResolving(selected)} /></div>}
        </SheetContent>
      </Sheet>
      <ResolveDialog atendimento={resolving} onClose={() => setResolving(null)} />
    </AppLayout>
  );
}
