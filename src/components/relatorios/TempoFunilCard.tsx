import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timer, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ciclos, ciclosPorRecorte, etapaMaisDemorada, faixaPorte, fmtDias, FT_RECORTE_LABEL, rankingDecisao, temposPorEtapa,
  type FtEstat, type FtLead, type FtMudanca, type FtProposta, type FtRecorte,
} from "@/lib/funil-tempos";

const CANAL: Record<string, string> = { WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", MESSENGER: "Messenger", WIDGET: "Site", TELEGRAM: "Telegram" };
const fold = (v?: string | null) => (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const PERIODOS = [["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["180", "Últimos 6 meses"], ["365", "Últimos 12 meses"]] as const;

function useDadosFunil() {
  const { user } = useAuth();
  const org = user?.organization_id;
  return useQuery({
    queryKey: ["tempo-funil", org],
    enabled: !!org,
    staleTime: 60_000,
    queryFn: async () => {
      const [st, ls, hs, ps, pf, ar] = await Promise.all([
        supabase.from("lead_stages").select("id, nome, ordem, tipo, chave").eq("organization_id", org!),
        supabase.from("leads").select("id, created_at, category, city, canal_origem, created_by_flora, assigned_to, levantamento, teste_instalado_em, teste_aprovado_em").eq("organization_id", org!).limit(5000),
        supabase.from("lead_stage_history").select("lead_id, etapa_anterior_id, etapa_nova_id, mudou_em, estimado").eq("organization_id", org!).order("mudou_em").limit(20000),
        supabase.from("proposals").select("id, lead_id, client_id, status, created_at, enviada_em, aceita_em, rejeitada_em, ativado_em").eq("organization_id", org!).limit(5000),
        supabase.from("profiles").select("user_id, name").eq("organization_id", org!).limit(300),
        supabase.from("ekkoa_coverage_areas").select("name, city").eq("organization_id", org!).eq("is_active", true).limit(200),
      ]);
      for (const r of [st, ls, hs, ps]) if (r.error) throw r.error;
      const nomes = new Map((pf.data ?? []).map((p) => [p.user_id, (p.name ?? "Equipe").trim().split(/\s+/)[0]]));
      const areas = ar.data ?? [];
      const leads: FtLead[] = (ls.data ?? []).map((l) => {
        const lev = (l.levantamento ?? {}) as { segmento?: string; porte?: number };
        return {
          id: l.id, created_at: l.created_at, segmento: lev.segmento ?? l.category ?? null, porte: faixaPorte(lev.porte), cidade: l.city ?? null,
          regiao: areas.find((a) => fold(a.city) === fold(l.city) || (!!l.city && fold(a.city).includes(fold(l.city))))?.name ?? null,
          canal: l.canal_origem ? (CANAL[l.canal_origem] ?? l.canal_origem) : (l.created_by_flora ? "Flora" : "Fera"),
          vendedor: l.assigned_to ? (nomes.get(l.assigned_to) ?? "Equipe") : null, teste_instalado_em: l.teste_instalado_em, teste_aprovado_em: l.teste_aprovado_em,
        };
      });
      return { etapas: st.data ?? [], leads, historico: (hs.data ?? []) as FtMudanca[], propostas: (ps.data ?? []) as FtProposta[] };
    },
  });
}

function Ciclo({ titulo, e }: { titulo: string; e: FtEstat }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 min-w-0">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-xl font-semibold leading-tight">{fmtDias(e.mediana)}</p>
      <p className="text-xs text-muted-foreground">{e.n ? `mediana · média ${fmtDias(e.media)} · ${e.n} ${e.n === 1 ? "caso" : "casos"}` : "sem dados no período"}</p>
    </div>
  );
}

/** Relatórios → "Tempo do funil": time in each stage, cycle times and who decides faster. */
export default function TempoFunilCard() {
  const { data, isLoading, error } = useDadosFunil();
  const [dias, setDias] = useState("90");
  const [recorte, setRecorte] = useState<FtRecorte>("segmento");

  const r = useMemo(() => {
    if (!data) return null;
    const fim = new Date(); const inicio = new Date(fim.getTime() - Number(dias) * 86_400_000);
    const jan = { inicio: inicio.toISOString(), fim: new Date(fim.getTime() + 60_000).toISOString() };
    const etapas = temposPorEtapa(data.etapas, data.historico, jan);
    const grupos = ciclosPorRecorte(data.leads, data.historico, data.propostas, recorte, jan);
    return { etapas, lenta: etapaMaisDemorada(etapas), ciclos: ciclos(data.leads, data.historico, data.propostas, jan), grupos, rank: rankingDecisao(grupos),
      estimados: etapas.reduce((s, e) => s + e.estimados, 0) };
  }, [data, dias, recorte]);
  const maxMediana = Math.max(1, ...(r?.etapas ?? []).map((e) => e.mediana ?? 0));

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Timer className="h-5 w-5 text-primary" /> Tempo do funil</CardTitle>
          <div className="grid grid-cols-1 gap-2 sm:flex">
            <Select value={dias} onValueChange={setDias}>
              <SelectTrigger className="w-full sm:w-[170px]" aria-label="Período"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODOS.map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={recorte} onValueChange={(v) => setRecorte(v as FtRecorte)}>
              <SelectTrigger className="w-full sm:w-[170px]" aria-label="Agrupar por"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(FT_RECORTE_LABEL) as FtRecorte[]).map((k) => <SelectItem key={k} value={k}>Por {FT_RECORTE_LABEL[k].toLowerCase()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && <p className="text-sm text-destructive">Não foi possível carregar o tempo do funil.</p>}
        {r && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Ciclo titulo="Entrada do lead → proposta aceita" e={r.ciclos.entrada_aceita} />
              <Ciclo titulo="Proposta enviada → aceita" e={r.ciclos.enviada_aceita} />
              <Ciclo titulo="Proposta aceita → ativação" e={r.ciclos.aceita_ativacao} />
              <Ciclo titulo="Teste instalado → aprovado" e={r.ciclos.teste_aprovado} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Tempo em cada etapa {r.lenta && <span className="text-muted-foreground font-normal">· mais demora em <strong className="text-foreground">{r.lenta.nome}</strong></span>}
              </p>
              <ul className="space-y-2">
                {r.etapas.map((e) => (
                  <li key={e.etapa_id} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{e.nome}</span>
                      <span className="shrink-0 text-muted-foreground">{e.n ? `${fmtDias(e.mediana)} · ${e.n}` : "—"}{e.parados ? ` · ${e.parados} parados` : ""}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <div className={`h-2 rounded-full ${e === r.lenta ? "bg-primary" : "bg-primary/50"}`} style={{ width: `${e.n ? Math.max(4, ((e.mediana ?? 0) / maxMediana) * 100) : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              {r.estimados > 0 && <p className="text-xs text-muted-foreground">{r.estimados} intervalos foram reconstruídos de dados antigos (estimados).</p>}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Quem decide mais rápido · {FT_RECORTE_LABEL[recorte].toLowerCase()} (entrada → aceite)</p>
              {r.grupos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma proposta aceita no período.</p> : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {r.grupos.map((g) => (
                    <li key={g.grupo} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{g.grupo}</span>
                        {r.rank.rapidos[0] === g && r.grupos.length > 1 && <Badge variant="secondary" className="shrink-0"><TrendingUp className="mr-1 h-3 w-3" />mais rápido</Badge>}
                        {r.rank.lentos[0] === g && r.grupos.length > 1 && <Badge variant="outline" className="shrink-0"><TrendingDown className="mr-1 h-3 w-3" />mais lento</Badge>}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{fmtDias(g.mediana)} · {g.n} {g.n === 1 ? "lead" : "leads"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
