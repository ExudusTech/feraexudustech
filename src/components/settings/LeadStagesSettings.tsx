import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/use-organizations";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, ListOrdered, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export interface LeadStage { id: string; organization_id: string; nome: string; ordem: number; tipo: string; chave: string | null; ativo: boolean; cor?: string | null }

const TIPOS: Record<string, string> = { aberta: "Em andamento", ganho: "Ganho", perdido: "Perdido", cliente: "Cliente ativo" };

export function useLeadStages() {
  const { data: org } = useOrganization();
  return useQuery({
    queryKey: ["lead-stages", org?.id], enabled: !!org?.id,
    queryFn: async (): Promise<LeadStage[]> => {
      const { data, error } = await (supabase as any).from("lead_stages").select("*").eq("organization_id", org!.id).order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function LeadStagesSettings() {
  const { data: org } = useOrganization();
  const { isAdmin } = usePermissions();
  const { data: stages = [] } = useLeadStages();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [pending, setPending] = useState<{ stage: LeadStage; count: number } | null>(null);
  const toggle = async (s: LeadStage, ativo: boolean) => {
    if (ativo) return save.mutate({ id: s.id, ativo });
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("stage_id", s.id);
    if (count) setPending({ stage: s, count }); else save.mutate({ id: s.id, ativo: false });
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["lead-stages"] });
  const fail = () => toast({ title: "Não foi possível salvar a etapa", description: "Verifique o nome (sem repetir) e tente novamente.", variant: "destructive" });

  const save = useMutation({
    mutationFn: async (change: { id: string } & Partial<LeadStage>) => {
      const { id, ...rest } = change;
      const { error } = await (supabase as any).from("lead_stages").update(rest).eq("id", id);
      if (error) throw error;
    }, onSuccess: refresh, onError: fail,
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("lead_stages").insert({ organization_id: org!.id, nome: nome.trim(), ordem: (stages.at(-1)?.ordem ?? 0) + 10 });
      if (error) throw error;
    }, onSuccess: () => { setNome(""); refresh(); }, onError: fail,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("lead_stages").delete().eq("id", id); if (error) throw error; },
    onSuccess: refresh, onError: fail,
  });
  const move = async (index: number, dir: -1 | 1) => {
    const other = stages[index + dir]; const cur = stages[index];
    if (!other) return;
    await save.mutateAsync({ id: cur.id, ordem: other.ordem });
    await save.mutateAsync({ id: other.id, ordem: cur.ordem });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ListOrdered className="h-5 w-5 text-primary" />Etapas do lead</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Estas etapas formam as colunas da tela Leads. Etapas desativadas somem do quadro. Movimentos automáticos: Flora cria lead → “Novo”; agendou visita → “Visita agendada”; visita concluída → “Visita realizada”; atendimento resolvido como perdido → “Perdido” (com confirmação).</p>
        <ul className="space-y-2">
          {stages.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
              <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <Input defaultValue={s.nome} disabled={!isAdmin} className="flex-1 min-w-40" aria-label="Nome da etapa"
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.nome && save.mutate({ id: s.id, nome: e.target.value.trim() })} />
              <Select value={s.tipo} onValueChange={(tipo) => save.mutate({ id: s.id, tipo })} disabled={!isAdmin}>
                <SelectTrigger className="w-40" aria-label="Tipo da etapa"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPOS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Switch checked={s.ativo} onCheckedChange={(ativo) => toggle(s, ativo)} disabled={!isAdmin} aria-label="Etapa ativa" />
              {isAdmin && <>
                <Button size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Descer" disabled={i === stages.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Excluir" disabled={!!s.chave}
                  title={s.chave ? "Etapa usada nos movimentos automáticos" : undefined} onClick={() => remove.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
              </>}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form className="flex gap-2 max-w-md" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) add.mutate(); }}>
            <Input placeholder="Nova etapa" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Button type="submit" disabled={!nome.trim() || add.isPending}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
          </form>
        )}
      </CardContent>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar “{pending?.stage.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.count === 1 ? "Há 1 lead nesta etapa." : `Há ${pending?.count} leads nesta etapa.`} A coluna sai do quadro e esses leads
              aparecem em “Sem etapa ativa” até serem movidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pending) save.mutate({ id: pending.stage.id, ativo: false }); setPending(null); }}>Desativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
