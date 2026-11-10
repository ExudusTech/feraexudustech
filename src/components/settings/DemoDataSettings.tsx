import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/use-organizations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { FlaskConical, Loader2, Trash2 } from "lucide-react";
import { CENARIO_RESUMO, DEMO_CONTAGEM_LABEL, NITSCLEAN_ORG_ID } from "@/lib/demo-cenario";

type Contagem = Record<string, number>;

async function chamar(action: "contar" | "criar" | "apagar", organization_id: string) {
  const { data, error } = await supabase.functions.invoke("demo-cenario", { body: { action, organization_id } });
  if (error) {
    let msg = "Não foi possível concluir agora.";
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep generic */ }
    throw new Error(msg);
  }
  return data as { contagem?: Contagem; existe?: boolean; apagado?: Contagem; arquivos_removidos?: number; resumo?: { datas?: Record<string, string> } };
}

/** Super admin only, NitsClean only (the server checks both again). */
export default function DemoDataSettings() {
  const { data: org } = useOrganization();
  const qc = useQueryClient();
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [existe, setExiste] = useState(false);
  const [busy, setBusy] = useState<"criar" | "apagar" | "contar" | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const orgId = org?.id as string | undefined;
  const permitido = orgId === NITSCLEAN_ORG_ID;

  const atualizar = useCallback(async () => {
    if (!orgId || !permitido) return;
    setBusy("contar");
    try { const r = await chamar("contar", orgId); setContagem(r.contagem ?? {}); setExiste(!!r.existe); }
    catch (e) { toast({ title: "Não foi possível contar", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(null); }
  }, [orgId, permitido]);
  useEffect(() => { atualizar(); }, [atualizar]);

  const run = async (action: "criar" | "apagar") => {
    if (!orgId) return;
    setBusy(action);
    try {
      const r = await chamar(action, orgId);
      if (action === "criar") {
        setContagem(r.contagem ?? {}); setExiste(!!r.existe);
        toast({ title: "Cenário de demonstração criado", description: "Os registros aparecem com [DEMO] em Leads, Agenda, Propostas e Tarefas." });
      } else {
        setContagem({}); setExiste(false);
        const total = Object.values(r.apagado ?? {}).reduce((a, n) => a + Number(n || 0), 0);
        toast({ title: "Cenário apagado", description: `${total} registro(s) e ${r.arquivos_removidos ?? 0} arquivo(s) removidos.` });
      }
      qc.invalidateQueries();
    } catch (e) {
      toast({ title: action === "criar" ? "Não foi possível criar" : "Não foi possível apagar", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); setConfirmar(false); }
  };

  if (!permitido) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Os dados de demonstração existem só para a organização NitsClean.</CardContent></Card>;
  }
  const itens = Object.entries(contagem ?? {}).filter(([, n]) => Number(n) > 0);

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Dados de demonstração</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Cria um cenário completo para apresentar o sistema. Tudo leva "[DEMO]" no nome, usa telefones fictícios e nunca dispara WhatsApp ou e-mail.
          Indicadores, Agenda, pendências e a Flora Equipe enxergam esses dados normalmente.
        </p>
        <div className="space-y-2">
          <p className="text-sm font-medium">O cenário cria:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">{CENARIO_RESUMO.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">{busy === "contar" ? "Contando…" : existe ? "Existe hoje:" : "Nenhum dado de demonstração no momento."}</p>
          {itens.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {itens.map(([k, n]) => <div key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{DEMO_CONTAGEM_LABEL[k] ?? k}</span><span className="font-medium">{n}</span></div>)}
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => run("criar")} disabled={!!busy || existe} className="w-full sm:w-auto">
            {busy === "criar" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
            Criar cenário de demonstração
          </Button>
          <Button variant="destructive" onClick={() => setConfirmar(true)} disabled={!!busy || !existe} className="w-full sm:w-auto">
            {busy === "apagar" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Apagar cenário de demonstração
          </Button>
        </div>
        {existe && <p className="text-xs text-muted-foreground">Para criar de novo, apague o cenário atual primeiro.</p>}
      </CardContent>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar o cenário de demonstração?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove só o que tem a marca de demonstração ({itens.map(([k, n]) => `${n} ${(DEMO_CONTAGEM_LABEL[k] ?? k).toLowerCase()}`).join(", ") || "nada"}),
              inclusive o que foi criado depois a partir desses registros. Nenhum dado real é tocado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel disabled={busy === "apagar"}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); run("apagar"); }} disabled={busy === "apagar"} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy === "apagar" ? "Apagando…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
