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

export interface LeadStage { id: string; organization_id: string; nome: string; ordem: number; tipo: string; chave: string | null; ativo: boolean }

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
        <p className="text-sm text-muted-foreground">Proposta inicial para validar com o gestor. Movimentos automáticos: agendou visita → “Visita agendada”; atendimento resolvido como perdido → “Perdido” (com confirmação).</p>
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
              <Switch checked={s.ativo} onCheckedChange={(ativo) => save.mutate({ id: s.id, ativo })} disabled={!isAdmin} aria-label="Etapa ativa" />
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
    </Card>
  );
}
