import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QrCode, MapPin, Wrench, History, Package } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { ESTADO_CLASS, ESTADO_LABEL, MANUTENCAO_LABEL } from "@/lib/base-instalada";
import { formatEtiqueta, parseEtiqueta, STATUS_APARELHO_LABEL } from "@/lib/etiquetas";
import { TIPO_MOV_LABEL } from "@/lib/estoque";
import EtiquetaScanner from "@/components/etiquetas/EtiquetaScanner";
import EtiquetaNaVisita from "@/components/etiquetas/EtiquetaNaVisita";

const dataBR = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

/** Device screen opened by the QR (signed-in team): client, point, status, maintenance, history and actions of the open occurrence. */
export default function Aparelho() {
  const { numero } = useParams();
  const n = parseEtiqueta(numero);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles = [] } = usePermissions() as any;
  const privilegiado = (roles as string[]).some((r) => ["admin", "gestor", "super_admin"].includes(r));
  const [scan, setScan] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["aparelho", user?.organization_id, n], enabled: !!user?.organization_id && !!n,
    queryFn: async () => {
      const sb = supabase as any;
      const { data: c } = await sb.from("comodatos").select("id, status, client_id, lead_id, product_id, refil_product_id, localizacao_interna, ultima_manutencao, proxima_manutencao, estado_atual, data_inicio, ativado_em, clients(name, city), leads(empresa_nome, company, city), produto:products!comodatos_product_id_fkey(name), refil:products!comodatos_refil_product_id_fkey(name)")
        .eq("organization_id", user!.organization_id).eq("etiqueta_numero", n).maybeSingle();
      if (!c) return { c: null, eventos: [], abertas: [] };
      const [ev, mov, ab] = await Promise.all([
        sb.from("schedule_evidencias").select("id, created_at, tipo, estado, itens, observacoes, schedules(ocorrencia_codigo, title)").eq("comodato_id", c.id).order("created_at", { ascending: false }).limit(60),
        sb.from("stock_movements").select("id, created_at, tipo, quantidade, motivo").eq("comodato_id", c.id).order("created_at", { ascending: false }).limit(30),
        sb.from("schedules").select("id, title, assigned_to, ocorrencia_codigo, operacao_material").eq("organization_id", user!.organization_id).eq("status", "em_atendimento")
          .eq(c.client_id ? "client_id" : "lead_id", c.client_id ?? c.lead_id).limit(5),
      ]);
      const eventos = [
        ...((ev.data ?? []) as any[]).map((e) => ({ id: e.id, em: e.created_at, estado: e.estado, texto: e.tipo === "evento" ? e.observacoes
          : [e.estado ? `Avaliação: ${ESTADO_LABEL[e.estado]}` : null, (e.itens ?? []).map((m: string) => MANUTENCAO_LABEL[m] ?? m).join(", ") || null, e.tipo !== "evento" ? e.observacoes : null].filter(Boolean).join(" · "),
          ref: e.schedules?.ocorrencia_codigo ? `#${e.schedules.ocorrencia_codigo}` : null })),
        ...((mov.data ?? []) as any[]).map((m) => ({ id: m.id, em: m.created_at, estado: null, texto: `Estoque: ${TIPO_MOV_LABEL[m.tipo] ?? m.tipo} (${m.quantidade > 0 ? "+" : ""}${m.quantidade})${m.motivo ? ` — ${m.motivo}` : ""}`, ref: null })),
      ].sort((a, b) => b.em.localeCompare(a.em));
      const abertas = ((ab.data ?? []) as any[]).filter((s) => privilegiado || s.assigned_to === user!.id);
      return { c, eventos, abertas };
    },
  });
  const c = data?.c as any;
  const local = c?.clients?.name ?? c?.leads?.empresa_nome ?? c?.leads?.company;
  const aberta = data?.abertas?.[0];

  return (
    <AppLayout title={n ? `Aparelho nº ${formatEtiqueta(n)}` : "Etiqueta inválida"} subtitle="Etiqueta numerada do aparelho"
      actions={<Button variant="outline" className="min-h-11" onClick={() => setScan(true)}><QrCode className="h-4 w-4 mr-2" />Escanear etiqueta</Button>}>
      <div className="space-y-4 max-w-3xl">
        {!n && <p className="text-sm text-muted-foreground">Este endereço não tem um número de etiqueta válido.</p>}
        {n && !isLoading && !c && <Card><CardContent className="p-4 text-sm space-y-1">
          <p className="font-medium">Etiqueta nº {formatEtiqueta(n)} ainda não está ligada a nenhum aparelho.</p>
          <p className="text-muted-foreground">Ela é ligada ao escanear na separação do material ou na instalação, dentro da ocorrência aberta.</p></CardContent></Card>}
        {c && <>
          <Card><CardContent className="p-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{STATUS_APARELHO_LABEL[c.status] ?? c.status}</Badge>
              {c.estado_atual && <Badge className={ESTADO_CLASS[c.estado_atual]}>{ESTADO_LABEL[c.estado_atual]}</Badge>}
            </div>
            <p><span className="text-muted-foreground block text-xs">Cliente</span>{local ?? "— (no estoque)"}{(c.clients?.city ?? c.leads?.city) && ` · ${c.clients?.city ?? c.leads?.city}`}</p>
            <p className="flex gap-1"><MapPin className="h-4 w-4 mt-0.5 shrink-0" /><span><span className="text-muted-foreground block text-xs">Ponto</span>{c.localizacao_interna ?? "—"}</span></p>
            <p className="flex gap-1"><Package className="h-4 w-4 mt-0.5 shrink-0" /><span><span className="text-muted-foreground block text-xs">Aparelho</span>{c.produto?.name ?? "—"}{c.refil?.name && ` + ${c.refil.name}`}</span></p>
            <p className="flex gap-1"><Wrench className="h-4 w-4 mt-0.5 shrink-0" /><span><span className="text-muted-foreground block text-xs">Manutenção</span>Última {dataBR(c.ultima_manutencao)} · Próxima {dataBR(c.proxima_manutencao)}</span></p>
            <p><span className="text-muted-foreground block text-xs">Ativado em</span>{dataBR(c.ativado_em ?? c.data_inicio)}</p>
            {c.client_id && <Button variant="link" className="justify-start px-0" asChild><Link to={`/clientes?cliente=${c.client_id}`}>Abrir cliente</Link></Button>}
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Ações</CardTitle></CardHeader><CardContent className="space-y-2">
            {aberta ? <>
              <p className="text-sm text-muted-foreground">Ocorrência aberta: {aberta.title}{aberta.ocorrencia_codigo ? ` #${aberta.ocorrencia_codigo}` : ""}</p>
              <EtiquetaNaVisita scheduleId={aberta.id} orgId={user!.organization_id!} clientId={c.client_id} leadId={c.client_id ? null : c.lead_id} numeroInicial={n} onChanged={() => refetch()}
                onAvaliar={() => navigate(`/agenda?agendamento=${aberta.id}`)} />
            </> : <p className="text-sm text-muted-foreground">Para avaliar, trocar de ponto, retirar ou substituir, faça o check-in numa ocorrência deste cliente e escaneie de novo.</p>}
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />Histórico do aparelho</CardTitle></CardHeader><CardContent className="space-y-2">
            {!data?.eventos.length && <p className="text-sm text-muted-foreground">Sem registros ainda.</p>}
            {data?.eventos.map((e) => (
              <div key={e.id} className="text-sm border-b last:border-0 pb-2">
                <span className="text-xs text-muted-foreground">{new Date(e.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{e.ref ? ` · ${e.ref}` : ""}</span>
                <p>{e.texto || "Registro"}</p>
              </div>))}
          </CardContent></Card>
        </>}
      </div>
      <EtiquetaScanner open={scan} onOpenChange={setScan} onNumero={(x) => { setScan(false); navigate(`/aparelho/${formatEtiqueta(x)}`); }} />
    </AppLayout>
  );
}
