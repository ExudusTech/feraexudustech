import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, CheckCircle2, FileText, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { OPERACAO_LABEL, TIPO_NOTA_LABEL, formatCnpj, type OperacaoMaterial, type TipoNota, type ItemOperacao } from "@/lib/prontidao";

interface Tarefa {
  id: string; numero: number; organization_id: string; schedule_id: string; tipo_operacao: string; tipo_nota: string; itens: ItemOperacao[];
  empresa_nome: string | null; razao_social: string | null; cnpj: string | null; cnpj_verificado: boolean; endereco: string | null; contato: string | null;
  data_visita: string; prazo: string; status: string; numero_nota: string | null; pdf_path: string | null; concluida_em: string | null;
}

const fmtData = (d: string) => d.split("-").reverse().join("/");

/** Billing tasks: one card per visit that needs an invoice (created automatically with the visit). */
export default function Tarefas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<"aberta" | "concluida">("aberta");
  const { data = [], isLoading } = useQuery({
    queryKey: ["tarefas-faturamento", user?.organization_id, aba], enabled: !!user?.organization_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("tarefas_faturamento").select("*")
        .eq("organization_id", user!.organization_id).eq("status", aba).order(aba === "aberta" ? "prazo" : "concluida_em", { ascending: aba === "aberta" }).limit(200);
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tarefas-faturamento"] });
  return (
    <AppLayout title="Tarefas" subtitle="Notas fiscais para emitir antes das visitas">
      <Tabs value={aba} onValueChange={(v) => setAba(v as any)} className="mb-4">
        <TabsList><TabsTrigger value="aberta">Para emitir</TabsTrigger><TabsTrigger value="concluida">Concluídas</TabsTrigger></TabsList>
      </Tabs>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : !data.length ? <p className="text-sm text-muted-foreground">Nenhuma tarefa {aba === "aberta" ? "pendente" : "concluída"}.</p>
        : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.map((t) => <TarefaCard key={t.id} t={t} onChange={refresh} />)}</div>}
    </AppLayout>
  );
}

function TarefaCard({ t, onChange }: { t: Tarefa; onChange: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [numero, setNumero] = useState(t.numero_nota ?? "");
  const [pdf, setPdf] = useState(t.pdf_path);
  const [busy, setBusy] = useState(false);
  const atrasada = useMemo(() => t.status === "aberta" && new Date(t.prazo).getTime() < Date.now(), [t.prazo, t.status]);
  const titulo = `Emitir nota — ${OPERACAO_LABEL[t.tipo_operacao as OperacaoMaterial] ?? t.tipo_operacao} — ${t.empresa_nome ?? "Cliente"}`;

  const upload = async (file: File) => {
    if (file.type !== "application/pdf") { toast({ title: "Envie um PDF", variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: "PDF maior que 10 MB", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const path = `${t.organization_id}/${t.id}.pdf`;
      const { error } = await supabase.storage.from("notas-fiscais").upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (error) throw error;
      const { error: ue } = await (supabase as any).from("tarefas_faturamento").update({ pdf_path: path }).eq("id", t.id);
      if (ue) throw ue;
      setPdf(path); toast({ title: "PDF anexado" }); onChange();
    } catch { toast({ title: "Não foi possível anexar o PDF", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const salvar = async (concluir: boolean) => {
    if (concluir && (!pdf || !numero.trim())) { toast({ title: "Anexe o PDF e informe o número da nota", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await (supabase as any).from("tarefas_faturamento").update({ numero_nota: numero.trim() || null, ...(concluir ? { status: "concluida" } : {}) }).eq("id", t.id);
    setBusy(false);
    if (error) { toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: concluir ? "Tarefa concluída" : "Salvo" }); onChange();
  };
  const reabrir = async () => {
    const { error } = await (supabase as any).from("tarefas_faturamento").update({ status: "aberta" }).eq("id", t.id);
    if (error) toast({ title: "Não foi possível reabrir", variant: "destructive" }); else onChange();
  };

  return (
    <Card className={atrasada ? "border-destructive/60" : undefined}>
      <CardContent className="p-4 space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="font-semibold flex-1">{titulo}</div>
          <Badge variant="outline">#T-{t.numero}</Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{TIPO_NOTA_LABEL[t.tipo_nota as TipoNota] ?? t.tipo_nota}</Badge>
          <Badge variant={atrasada ? "destructive" : "outline"}>Visita {fmtData(t.data_visita)} · prazo {new Date(t.prazo).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Badge>
        </div>
        <dl className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
          <dt className="text-muted-foreground">Razão social</dt><dd>{t.razao_social ?? "—"}</dd>
          <dt className="text-muted-foreground">CNPJ</dt>
          <dd className="flex items-center gap-1">{t.cnpj ? formatCnpj(t.cnpj) : "—"}{!t.cnpj_verificado && <span className="text-warning flex items-center gap-0.5 text-xs"><AlertTriangle className="h-3 w-3" />não verificado</span>}</dd>
          <dt className="text-muted-foreground">Endereço</dt><dd>{t.endereco ?? "—"}</dd>
          <dt className="text-muted-foreground">Contato</dt><dd>{t.contato ?? "—"}</dd>
        </dl>
        <div>
          <div className="text-muted-foreground">Itens</div>
          {t.itens?.length ? <ul className="list-disc pl-5">{t.itens.map((i, k) => <li key={k}>{i.quantidade}x {i.descricao}</li>)}</ul> : <p>—</p>}
        </div>
        <a className="text-xs inline-flex items-center gap-1 underline" href={`/agenda?agendamento=${t.schedule_id}`}><ExternalLink className="h-3 w-3" />Abrir a visita</a>
        {t.status === "aberta" ? (
          <div className="space-y-2 pt-2 border-t">
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Anexar PDF da nota" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <Input placeholder="Número da nota" value={numero} onChange={(e) => setNumero(e.target.value.slice(0, 30))} onBlur={() => numero !== (t.numero_nota ?? "") && salvar(false)} />
            </div>
            {pdf && <NotaLink path={pdf} />}
            <Button className="w-full" onClick={() => salvar(true)} disabled={busy}><CheckCircle2 className="h-4 w-4 mr-1" />Marcar concluída</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Badge>Nota {t.numero_nota}</Badge>{t.pdf_path && <NotaLink path={t.pdf_path} />}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={reabrir}>Reabrir</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Opens the private PDF through a short-lived signed URL. */
export function NotaLink({ path }: { path: string }) {
  return (
    <button type="button" className="text-xs underline inline-flex items-center gap-1" onClick={async () => {
      const { data } = await supabase.storage.from("notas-fiscais").createSignedUrl(path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener"); else toast({ title: "Não foi possível abrir a nota", variant: "destructive" });
    }}><FileText className="h-3 w-3" />Ver PDF</button>
  );
}
