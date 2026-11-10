import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { formatEtiqueta } from "@/lib/etiquetas";
import { useAuth } from "@/hooks/use-auth";
import { useProducts } from "@/hooks/use-products";
import { useOrganizationUsers } from "@/hooks/use-users";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { DIAS_SEMANA, ESTADO_CLASS, ESTADO_LABEL, FREQ_LABEL, FREQUENCIAS, MANUTENCAO_LABEL } from "@/lib/base-instalada";

interface Props { client: { id: string; name: string } | null; open: boolean; onOpenChange: (o: boolean) => void }

/** Client installed base: points, maintenance plan and evaluation history. */
export default function ClientBaseDialog({ client, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { roles = [] } = usePermissions() as any;
  const canPlan = (roles as string[]).some((r) => ["admin", "gestor", "super_admin"].includes(r));
  const { data: products = [] } = useProducts();
  const { data: users = [] } = useOrganizationUsers();
  const name = (id?: string | null) => products.find((p) => p.id === id)?.name;
  const { data } = useQuery({
    queryKey: ["client-base", client?.id], enabled: !!client?.id && open,
    queryFn: async () => {
      const [pts, plano] = await Promise.all([
        (supabase as any).from("comodatos").select("id, localizacao_interna, product_id, refil_product_id, quantidade, estado_atual, status, ultima_manutencao, proxima_manutencao, etiqueta_numero").eq("client_id", client!.id).order("created_at"),
        (supabase as any).from("planos_manutencao").select("*").eq("client_id", client!.id).eq("ativo", true).maybeSingle(),
      ]);
      const ids = ((pts.data ?? []) as any[]).map((p) => p.id);
      const hist = ids.length ? await (supabase as any).from("schedule_evidencias").select("id, estado, itens, precisa_substituir, observacoes, created_at, comodatos(localizacao_interna)")
        .in("comodato_id", ids).not("estado", "is", null).order("created_at", { ascending: false }).limit(100) : { data: [] };
      return { pontos: (pts.data ?? []) as any[], plano: plano.data as any, historico: (hist.data ?? []) as any[] };
    },
  });
  const [form, setForm] = useState({ frequencia: "quinzenal", intervalo_dias: "", dia_semana: "2", hora_inicio: "09:00", consultor_id: "", ativo: true });
  useEffect(() => {
    const p = data?.plano;
    setForm(p ? { frequencia: p.frequencia, intervalo_dias: p.intervalo_dias ? String(p.intervalo_dias) : "", dia_semana: p.dia_semana != null ? String(p.dia_semana) : "",
      hora_inicio: String(p.hora_inicio).slice(0, 5), consultor_id: p.consultor_id ?? "", ativo: p.ativo } : { frequencia: "quinzenal", intervalo_dias: "", dia_semana: "2", hora_inicio: "09:00", consultor_id: "", ativo: true });
  }, [data?.plano]);

  const salvarPlano = async () => {
    if (!client || !user?.organization_id) return;
    const row = { frequencia: form.frequencia, intervalo_dias: form.frequencia === "personalizada" ? Number(form.intervalo_dias) || null : null,
      dia_semana: form.dia_semana === "" ? null : Number(form.dia_semana), hora_inicio: form.hora_inicio, consultor_id: form.consultor_id || null, ativo: form.ativo };
    if (row.frequencia === "personalizada" && !row.intervalo_dias) { toast({ title: "Informe o intervalo em dias", variant: "destructive" }); return; }
    const sb = supabase as any;
    const res = data?.plano ? await sb.from("planos_manutencao").update(row).eq("id", data.plano.id)
      : await sb.from("planos_manutencao").insert({ ...row, organization_id: user.organization_id, client_id: client.id, created_by: user.id });
    if (res.error) { toast({ title: "Não foi possível salvar o plano", variant: "destructive" }); return; }
    if (data?.plano) {
      // Changing or disabling a plan cancels its future visits that were not executed; the scheduler recreates them from the new rule.
      const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
      await sb.from("schedules").update({ status: "cancelado", notes: "Plano de manutenção alterado" }).eq("plano_manutencao_id", data.plano.id)
        .gte("scheduled_date", today).in("status", ["agendado", "confirmado"]);
      qc.invalidateQueries({ queryKey: ["schedules"] });
    }
    qc.invalidateQueries({ queryKey: ["client-base", client.id] });
    toast({ title: "Plano salvo", description: "As próximas visitas são geradas automaticamente todo dia às 6h." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{client?.name}</DialogTitle><DialogDescription>Base instalada do cliente</DialogDescription></DialogHeader>
        <Tabs defaultValue="pontos">
          <TabsList><TabsTrigger value="pontos">Pontos ({data?.pontos.length ?? 0})</TabsTrigger><TabsTrigger value="plano">Plano de manutenção</TabsTrigger><TabsTrigger value="historico">Histórico</TabsTrigger></TabsList>
          <TabsContent value="pontos" className="space-y-2">
            {!data?.pontos.length && <p className="text-sm text-muted-foreground">Nenhum ponto ainda. Eles são cadastrados pelo consultor na visita.</p>}
            {data?.pontos.map((p) => (
              <div key={p.id} className="rounded-md border p-2 text-sm flex items-start gap-2">
                <div className="flex-1">{p.etiqueta_numero && <Link to={`/aparelho/${formatEtiqueta(p.etiqueta_numero)}`} className="mr-1 rounded bg-muted px-1 font-mono text-xs underline">nº {formatEtiqueta(p.etiqueta_numero)}</Link>}<strong>{p.localizacao_interna || "Ponto"}</strong> — {name(p.product_id) ?? "Dispenser"}{name(p.refil_product_id) && ` + ${name(p.refil_product_id)}`} ({p.quantidade}x)
                  <span className="block text-xs text-muted-foreground">Última manutenção: {p.ultima_manutencao?.split("-").reverse().join("/") ?? "—"} · Próxima: {p.proxima_manutencao?.split("-").reverse().join("/") ?? "—"}</span></div>
                {p.estado_atual && <Badge className={ESTADO_CLASS[p.estado_atual]}>{ESTADO_LABEL[p.estado_atual]}</Badge>}
                {(p.status ?? "ATIVO").toUpperCase() !== "ATIVO" && <Badge variant="outline">{p.status}</Badge>}
              </div>))}
          </TabsContent>
          <TabsContent value="plano" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Frequência</Label><Select value={form.frequencia} onValueChange={(v) => setForm({ ...form, frequencia: v })} disabled={!canPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FREQUENCIAS.map((f) => <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>)}</SelectContent></Select></div>
              {form.frequencia === "personalizada" && <div><Label>A cada (dias)</Label><Input inputMode="numeric" value={form.intervalo_dias} disabled={!canPlan}
                onChange={(e) => setForm({ ...form, intervalo_dias: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>}
              <div><Label>Dia preferido</Label><Select value={form.dia_semana} onValueChange={(v) => setForm({ ...form, dia_semana: v })} disabled={!canPlan}>
                <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger><SelectContent>{DIAS_SEMANA.map((d, i) => i > 0 && <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Horário</Label><Input type="time" value={form.hora_inicio} disabled={!canPlan} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></div>
              <div><Label>Consultor</Label><Select value={form.consultor_id} onValueChange={(v) => setForm({ ...form, consultor_id: v })} disabled={!canPlan}>
                <SelectTrigger><SelectValue placeholder="Responsável do cliente" /></SelectTrigger>
                <SelectContent>{(users as any[]).map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}</SelectContent></Select></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.ativo} disabled={!canPlan} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />Plano ativo</label>
            </div>
            <p className="text-xs text-muted-foreground">Gera as visitas dos próximos 30 dias, pulando feriados (vai para o próximo dia útil). Mudar o plano cancela as visitas futuras ainda não feitas e gera as novas.</p>
            {canPlan ? <Button onClick={salvarPlano}>Salvar plano</Button> : <p className="text-xs text-muted-foreground">Só o gestor pode alterar o plano.</p>}
          </TabsContent>
          <TabsContent value="historico" className="space-y-2">
            {!data?.historico.length && <p className="text-sm text-muted-foreground">Sem avaliações ainda.</p>}
            {data?.historico.map((h) => (
              <div key={h.id} className="rounded-md border p-2 text-sm flex items-start gap-2">
                <div className="flex-1"><strong>{h.comodatos?.localizacao_interna ?? "Ponto"}</strong> · {new Date(h.created_at).toLocaleDateString("pt-BR")}
                  {h.itens?.length > 0 && <span className="block text-xs">{h.itens.map((m: string) => MANUTENCAO_LABEL[m] ?? m).join(", ")}</span>}
                  {h.observacoes && <span className="block text-xs text-muted-foreground">{h.observacoes}</span>}</div>
                <Badge className={ESTADO_CLASS[h.estado]}>{ESTADO_LABEL[h.estado]}</Badge>
                {h.precisa_substituir && <Badge variant="outline">Substituir</Badge>}
              </div>))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
