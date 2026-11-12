import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { baseAction } from "@/lib/base-instalada";
import { aguardandoData, REGRA_DATA_LABEL, REGRAS_DATA, type RegraData } from "@/lib/revisita";
import { cn } from "@/lib/utils";

const hojeSP = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const br = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

export interface PlanoData { id?: string; modo_agenda?: string | null; regra_data?: string | null; proxima_data?: string | null; dia_mes?: number | null; intervalo_dias?: number | null }
interface Revisita { status: string; data?: string | null; aparelhos?: string[]; codigo?: string | null; ativacao?: boolean }

function resultadoTexto(r?: Revisita): string {
  if (!r) return "";
  if (r.status === "aguardando_data") return "Sem data ainda: o cliente continua em \"Aguardando data\".";
  if (r.data && r.ativacao) return `Ativação marcada para ${br(r.data)}${r.codigo ? ` (#${r.codigo})` : ""}.`;
  if (r.data) return `Próxima visita: ${br(r.data)} — ${r.aparelhos?.length ?? 0} aparelho(s) vencem nela.`;
  return "Salvo. Sem aparelhos ainda: a visita é marcada quando houver aparelhos ou ativação.";
}

/** "Atendimento por data (fora da rota)": next date informed, "dia X do mês" or "a cada N dias". Saved server-side (manager only). */
export function AgendaPorDataForm({ clientId, plano, canEdit, onSaved, compacto }: { clientId: string; plano?: PlanoData | null; canEdit: boolean; onSaved?: () => void; compacto?: boolean }) {
  const qc = useQueryClient();
  const [ativo, setAtivo] = useState(plano?.modo_agenda === "data");
  const [regra, setRegra] = useState<RegraData>((plano?.regra_data as RegraData) || "manual");
  const [data, setData] = useState(plano?.proxima_data ?? "");
  const [dia, setDia] = useState(plano?.dia_mes ? String(plano.dia_mes) : "");
  const [n, setN] = useState(plano?.intervalo_dias ? String(plano.intervalo_dias) : "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setAtivo(compacto || plano?.modo_agenda === "data"); setRegra((plano?.regra_data as RegraData) || "manual");
    setData(plano?.proxima_data ?? ""); setDia(plano?.dia_mes ? String(plano.dia_mes) : ""); setN(plano?.intervalo_dias ? String(plano.intervalo_dias) : "");
  }, [plano?.id, plano?.modo_agenda, plano?.regra_data, plano?.proxima_data, plano?.dia_mes, plano?.intervalo_dias, compacto]);
  const salvar = async (modo: "data" | "rota") => {
    setBusy(true);
    try {
      const r = await baseAction<{ revisita?: Revisita }>({ action: "agenda_cliente", client_id: clientId, modo, regra, proxima_data: data, dia_mes: Number(dia), intervalo_dias: Number(n) });
      ["client-base", "aguardando-data", "schedules", "ativacao-candidatos"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: modo === "data" ? "Atendimento por data salvo" : "Cliente volta a seguir a rota da cidade", description: resultadoTexto(r.revisita) });
      onSaved?.();
    } catch (e) { toast({ title: "Não foi salvo", description: e instanceof Error ? e.message : "Tente de novo", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const falta = regra === "manual" ? !data : regra === "dia_mes" ? !dia : !n;
  return (
    <div className={cn("space-y-3", !compacto && "rounded-md border p-3")}>
      {!compacto && <label className="flex items-center gap-2 text-sm font-medium min-h-11"><Switch checked={ativo} disabled={!canEdit} onCheckedChange={setAtivo} />Atendimento por data (fora da rota)</label>}
      {!compacto && <p className="text-xs text-muted-foreground">Para clientes de cidades sem rota (ex.: Nova Friburgo, Volta Redonda, Campos): a recorrência ignora o dia de rota da cidade e usa a data ou a regra abaixo.</p>}
      {ativo && <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Como definir as datas">
          {REGRAS_DATA.map((r) => (
            <Button key={r} type="button" role="radio" aria-checked={regra === r} variant={regra === r ? "default" : "outline"} className="min-h-11 h-auto whitespace-normal" disabled={!canEdit} onClick={() => setRegra(r)}>{REGRA_DATA_LABEL[r]}</Button>))}
        </div>
        {regra === "manual" && <div className="space-y-1"><Label htmlFor={`pd-${clientId}`}>Próxima data</Label><Input id={`pd-${clientId}`} type="date" min={hojeSP()} value={data} disabled={!canEdit} onChange={(e) => setData(e.target.value)} /></div>}
        {regra === "dia_mes" && <div className="space-y-1"><Label htmlFor={`dm-${clientId}`}>Dia do mês</Label><Input id={`dm-${clientId}`} inputMode="numeric" placeholder="Ex.: 10" value={dia} disabled={!canEdit} onChange={(e) => setDia(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          <p className="text-xs text-muted-foreground">Domingo ou feriado passa para o próximo dia útil.</p></div>}
        {regra === "intervalo" && <div className="space-y-1"><Label htmlFor={`in-${clientId}`}>A cada (dias)</Label><Input id={`in-${clientId}`} inputMode="numeric" placeholder="Ex.: 30" value={n} disabled={!canEdit} onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>}
        {canEdit && <Button className="w-full sm:w-auto min-h-11" disabled={busy || falta} onClick={() => salvar("data")}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Salvar e agendar</Button>}
      </>}
      {!ativo && plano?.modo_agenda === "data" && canEdit && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => salvar("rota")}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Salvar: voltar a seguir a rota da cidade</Button>}
    </div>
  );
}

/** Outside-the-route clients still without a next date (import of cities without a route, manual date already used). */
export function useAguardandoData(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["aguardando-data", user?.organization_id], enabled: enabled && !!user?.organization_id,
    queryFn: async () => {
      const sb = supabase as any;
      const hoje = hojeSP();
      const { data: planos } = await sb.from("planos_manutencao").select("id, client_id, ativo, modo_agenda, regra_data, proxima_data, dia_mes, intervalo_dias, data_inicio, clients(name, city)")
        .eq("organization_id", user!.organization_id).eq("ativo", true).eq("modo_agenda", "data").limit(1000);
      const ids = ((planos ?? []) as any[]).map((p) => p.client_id);
      const { data: abertas } = ids.length ? await sb.from("schedules").select("client_id").in("client_id", ids).in("status", ["agendado", "confirmado", "em_atendimento"]).gte("scheduled_date", hoje) : { data: [] };
      const comVisita = new Set(((abertas ?? []) as any[]).map((s) => s.client_id));
      return ((planos ?? []) as any[]).filter((p) => aguardandoData(p, hoje, comVisita.has(p.client_id)))
        .sort((a, b) => String(a.clients?.city ?? "").localeCompare(String(b.clients?.city ?? ""), "pt-BR") || String(a.clients?.name ?? "").localeCompare(String(b.clients?.name ?? ""), "pt-BR"));
    },
  });
}

export function AguardandoDataDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: lista = [], isLoading } = useAguardandoData(open);
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Aguardando data</DialogTitle>
          <DialogDescription>Clientes de cidades sem rota cadastrada (ou com a data já usada). Nenhuma visita é criada sozinha: defina a próxima data ou a regra.</DialogDescription></DialogHeader>
        {isLoading && <p className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</p>}
        {!isLoading && !lista.length && <p className="text-sm text-muted-foreground">Nenhum cliente aguardando data.</p>}
        <div className="max-h-[60vh] overflow-y-auto divide-y rounded-md border">
          {lista.map((p: any) => (
            <div key={p.id} className="p-2 space-y-2">
              <button type="button" className="w-full min-h-11 flex items-center gap-2 text-left text-sm" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="flex-1 font-medium">{p.clients?.name ?? "Cliente"}</span>
                <span className="text-muted-foreground">{p.clients?.city ?? "—"}</span></button>
              {aberto === p.id && <AgendaPorDataForm clientId={p.client_id} plano={p} canEdit compacto onSaved={() => setAberto(null)} />}
            </div>))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
