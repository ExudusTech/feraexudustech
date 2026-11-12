import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, MapPin, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEkkoaCoverageAreas } from "@/hooks/use-ekkoa-coverage-areas";
import type { Schedule } from "@/hooks/use-schedules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { STATUS_LABEL } from "@/lib/visit-exec";
import { corInfo } from "@/lib/ocorrencia-cores";
import { OcorrenciaLegenda, OcorrenciaTipoBadge } from "@/components/agenda/OcorrenciaCores";
import { DIAS_UTEIS, cidadeNaRegiao, distanciaKm, ordemDaRota, regioesDoDia, rotaBaseDe, temCoordenadas, type Ponto, type RotaBase } from "@/lib/rota";
import { cn } from "@/lib/utils";

interface Props {
  schedules: Schedule[];
  users: { user_id: string; name: string }[];
  canViewAll: boolean;
  onOpen: (scheduleId: string) => void;
}

interface Parada { id: string; s: Schedule; nome: string; latitude: number; longitude: number; checkin_em: string | null }
interface Grupo { id: string; nome: string; ordem: Parada[]; reais: number; semLocal: { s: Schedule; nome: string }[]; km: number }

/** Reads a theme token as a CSS color (SVG paths do not resolve CSS variables in attributes). */
const tokenColor = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
};
const pinIcon = (n: number | string, fundo: string, texto: string) => L.divIcon({
  className: "", iconSize: [28, 28], iconAnchor: [14, 14],
  html: `<div class="rota-pin" style="background:${fundo};color:${texto}">${n}</div>`,
});
const baseIcon = L.divIcon({
  className: "", iconSize: [28, 28], iconAnchor: [14, 14],
  html: `<div class="rota-pin rota-base" aria-label="Ponto de saída"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 10.5 12 3l9 7.5V21H3z"/></svg></div>`,
});

function Enquadrar({ pontos, chave }: { pontos: Ponto[]; chave: string }) {
  const map = useMap();
  useEffect(() => {
    if (!pontos.length) return;
    if (pontos.length === 1) map.setView([pontos[0].latitude, pontos[0].longitude], 13);
    else map.fitBounds(L.latLngBounds(pontos.map((p) => [p.latitude, p.longitude] as [number, number])), { padding: [36, 36], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, map]);
  return null;
}
function EscolherNoMapa({ ativo, onPonto }: { ativo: boolean; onPonto: (p: Ponto) => void }) {
  useMapEvents({ click: (e) => { if (ativo) onPonto({ latitude: e.latlng.lat, longitude: e.latlng.lng }); } });
  return null;
}

const hhmm = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;

/** Route map: active clients and the day's visits, numbered in check-in order (or nearest-neighbor suggestion from the base). */
export default function MapaRotas({ schedules, users, canViewAll, onOpen }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const orgId = user?.organization_id;
  const podeEditarBase = (user?.roles ?? [user?.role ?? ""]).some((r) => ["admin", "gestor", "super_admin"].includes(r));
  const hoje = new Date();
  const [semana, setSemana] = useState(() => startOfWeek(hoje, { weekStartsOn: 1 }));
  const [dow, setDow] = useState(() => (hoje.getDay() >= 1 && hoje.getDay() <= 5 ? hoje.getDay() : 1));
  const [consultor, setConsultor] = useState<string>(canViewAll ? "all" : user?.id ?? "all");
  const [soRota, setSoRota] = useState(true);
  const [editBase, setEditBase] = useState(false);
  const [novaBase, setNovaBase] = useState<RotaBase | null>(null);
  const dia = addDays(semana, dow - 1);
  const diaStr = format(dia, "yyyy-MM-dd");
  const consultorId = consultor === "all" ? null : consultor;

  const { data: areas = [] } = useEkkoaCoverageAreas();
  const { data: org } = useQuery({
    queryKey: ["rota-base", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("organizations").select("rota_base").eq("id", orgId!).maybeSingle()).data,
  });
  const base = rotaBaseDe(org?.rota_base);
  const { data: clientes = [] } = useQuery({
    queryKey: ["rota-clientes", orgId], enabled: !!orgId,
    queryFn: async () => ((await supabase.from("clients").select("id, name, company, city, latitude, longitude, status").eq("organization_id", orgId!)).data ?? [])
      .filter((c: any) => c.status !== "inactive"),
  });

  const doDia = useMemo(() => schedules.filter((s) => s.scheduled_date === diaStr && s.status !== "cancelado"
    && (!consultorId || s.assigned_to === consultorId)), [schedules, diaStr, consultorId]);
  const ids = doDia.map((s) => s.id).sort();
  const leadIds = [...new Set(doDia.map((s) => s.lead_id).filter(Boolean) as string[])].sort();
  const { data: leads = [] } = useQuery({
    queryKey: ["rota-leads", leadIds], enabled: leadIds.length > 0,
    queryFn: async () => (await supabase.from("leads").select("id, title, empresa_nome, latitude, longitude").in("id", leadIds)).data ?? [],
  });
  const { data: checkins = [] } = useQuery({
    queryKey: ["rota-checkins", ids], enabled: ids.length > 0,
    queryFn: async () => ((await (supabase as any).from("schedule_checkins").select("schedule_id, checkin_em, latitude, longitude").in("schedule_id", ids)).data ?? []) as any[],
  });

  const regioes = useMemo(() => regioesDoDia(areas, dow, consultorId), [areas, dow, consultorId]);
  const nomes = useMemo(() => new Map(users.map((u) => [u.user_id, u.name])), [users]);
  const clienteMap = useMemo(() => new Map(clientes.map((c: any) => [c.id, c])), [clientes]);
  const leadMap = useMemo(() => new Map((leads as any[]).map((l) => [l.id, l])), [leads]);

  const clientesNoMapa = useMemo(() => clientes.filter((c: any) => temCoordenadas(c)
    && (!soRota || regioes.some((r) => cidadeNaRegiao(c.city, r.city)))), [clientes, soRota, regioes]);

  const grupos: Grupo[] = useMemo(() => {
    const porConsultor = new Map<string, Schedule[]>();
    doDia.forEach((s) => { const k = s.assigned_to ?? ""; porConsultor.set(k, [...(porConsultor.get(k) ?? []), s]); });
    return [...porConsultor.entries()].map(([id, lista]) => {
      const paradas: Parada[] = [], semLocal: Grupo["semLocal"] = [];
      for (const s of lista) {
        const c: any = s.client_id ? clienteMap.get(s.client_id) : null;
        const l: any = s.lead_id ? leadMap.get(s.lead_id) : null;
        const ck = checkins.filter((x) => x.schedule_id === s.id).sort((a, b) => String(a.checkin_em).localeCompare(String(b.checkin_em)))[0];
        const nome = c?.company || c?.name || l?.empresa_nome || l?.title || s.title;
        const pos = [s, c, l, ck].find((p) => temCoordenadas(p)) as Ponto | undefined;
        if (pos) paradas.push({ id: s.id, s, nome, latitude: pos.latitude, longitude: pos.longitude, checkin_em: ck?.checkin_em ?? s.checkin_em ?? null });
        else semLocal.push({ s, nome });
      }
      const { ordem, reais } = ordemDaRota(base, paradas);
      const km = [base, ...ordem].reduce((t, p, i, arr) => i ? t + distanciaKm(arr[i - 1], p) : 0, 0);
      return { id, nome: id ? nomes.get(id) ?? "Consultor" : "Sem responsável", ordem, reais, semLocal, km };
    }).sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [doDia, clienteMap, leadMap, checkins, base, nomes]);

  const corReal = tokenColor("--primary", "hsl(0 72% 55%)");
  const corSugerida = tokenColor("--muted-foreground", "hsl(0 0% 55%)");
  const corCliente = tokenColor("--muted-foreground", "hsl(0 0% 55%)");
  const pontosEnquadrar: Ponto[] = grupos.some((g) => g.ordem.length) ? [base, ...grupos.flatMap((g) => g.ordem)] : clientesNoMapa.length ? clientesNoMapa as Ponto[] : [base];
  const nomeDia = DIAS_UTEIS.find((d) => d.dow === dow)?.nome ?? "";

  const salvarBase = async () => {
    if (!novaBase) return;
    const { error } = await (supabase as any).rpc("definir_rota_base", { _nome: novaBase.nome, _latitude: novaBase.latitude, _longitude: novaBase.longitude });
    if (error) { toast({ title: "Não foi possível salvar o ponto de saída", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ponto de saída salvo" });
    setEditBase(false); setNovaBase(null);
    qc.invalidateQueries({ queryKey: ["rota-base", orgId] });
  };
  const baseMostrada = novaBase ?? base;

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setSemana((d) => subWeeks(d, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-sm font-medium text-center">{format(semana, "dd/MM")} – {format(addDays(semana, 4), "dd/MM/yyyy")}
          <Button variant="link" size="sm" className="h-auto px-2" onClick={() => { setSemana(startOfWeek(new Date(), { weekStartsOn: 1 })); const d = new Date().getDay(); if (d >= 1 && d <= 5) setDow(d); }}>Hoje</Button></div>
        <Button variant="outline" size="icon" aria-label="Próxima semana" onClick={() => setSemana((d) => addWeeks(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-5 gap-1" role="tablist" aria-label="Dia da semana">
        {DIAS_UTEIS.map((d) => {
          const data = addDays(semana, d.dow - 1);
          const n = schedules.filter((s) => s.scheduled_date === format(data, "yyyy-MM-dd") && s.status !== "cancelado" && (!consultorId || s.assigned_to === consultorId)).length;
          return (
            <button key={d.dow} type="button" role="tab" aria-selected={dow === d.dow} onClick={() => setDow(d.dow)}
              className={cn("min-h-12 rounded-lg border text-sm leading-tight", dow === d.dow ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent")}>
              <span className="block font-semibold">{d.curto}</span>
              <span className="block text-xs opacity-80">{format(data, "dd")}{n ? ` · ${n}` : ""}</span>
            </button>);
        })}
      </div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        {canViewAll && (
          <Select value={consultor} onValueChange={setConsultor}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Consultor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os consultores</SelectItem>
              {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <label className="flex items-center gap-2 text-sm min-h-10"><Checkbox checked={soRota} onCheckedChange={(v) => setSoRota(v === true)} />Só clientes da rota do dia</label>
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">Rota de {nomeDia}: </span>
        {regioes.length ? <span className="inline-flex flex-wrap gap-1 align-middle">{regioes.map((r) => <Badge key={r.id} variant="outline">{r.name}</Badge>)}</span>
          : <span className="text-muted-foreground">nenhuma região cadastrada para este dia.</span>}
      </div>

      <div className="relative h-[55vh] min-h-[320px] md:h-[520px] rounded-lg overflow-hidden border">
        <MapContainer center={[base.latitude, base.longitude]} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Enquadrar pontos={pontosEnquadrar} chave={`${diaStr}|${consultor}|${soRota}|${grupos.map((g) => g.ordem.length).join(",")}|${clientesNoMapa.length}`} />
          <EscolherNoMapa ativo={editBase} onPonto={(p) => setNovaBase({ nome: novaBase?.nome ?? base.nome, ...p })} />
          {clientesNoMapa.map((c: any) => (
            <CircleMarker key={c.id} center={[c.latitude, c.longitude]} radius={5} pathOptions={{ color: corCliente, weight: 1, fillOpacity: 0.5 }}>
              <Tooltip>{c.company || c.name}{c.city ? ` · ${c.city}` : ""}</Tooltip>
            </CircleMarker>))}
          {grupos.map((g) => {
            const linha = [baseMostrada, ...g.ordem].map((p) => [p.latitude, p.longitude] as [number, number]);
            return [
              g.reais > 0 && <Polyline key={`${g.id}-r`} positions={linha.slice(0, g.reais + 1)} pathOptions={{ color: corReal, weight: 4, opacity: 0.85 }} />,
              g.ordem.length > g.reais && <Polyline key={`${g.id}-s`} positions={linha.slice(g.reais)} pathOptions={{ color: corSugerida, weight: 3, opacity: 0.9, dashArray: "6 8" }} />,
            ];
          })}
          {grupos.flatMap((g) => g.ordem.map((p, i) => {
            const info = corInfo(p.s as any);
            return (
              <Marker key={p.id} position={[p.latitude, p.longitude]} icon={pinIcon(i + 1, info.fundo, info.texto)} eventHandlers={{ click: () => onOpen(p.id) }}
                title={`${i + 1}. ${p.nome}`} keyboard>
                <Tooltip permanent direction="right" offset={[14, 0]} className="rota-nome">{p.nome}</Tooltip>
              </Marker>);
          }))}
          <Marker position={[baseMostrada.latitude, baseMostrada.longitude]} icon={baseIcon}><Tooltip>{baseMostrada.nome} (saída)</Tooltip></Marker>
        </MapContainer>
        {editBase && <div className="absolute top-2 inset-x-2 z-[1000] rounded-md border bg-card/95 p-2 text-xs text-center shadow">Toque no mapa para marcar o ponto de saída.</div>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-4" style={{ borderColor: corReal }} />Ordem real dos check-ins</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: corSugerida }} />Ordem sugerida (mais perto primeiro)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full border" style={{ borderColor: corCliente }} />Cliente ativo</span>
      </div>
      <OcorrenciaLegenda />

      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0" /><span className="text-muted-foreground">Ponto de saída:</span><span className="font-medium">{baseMostrada.nome}</span>
          {podeEditarBase && !editBase && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setEditBase(true); setNovaBase(null); }}><Pencil className="h-4 w-4 mr-1" />Alterar</Button>}
        </div>
        {editBase && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Input aria-label="Nome do ponto de saída" value={novaBase?.nome ?? base.nome} maxLength={80}
              onChange={(e) => setNovaBase({ ...(novaBase ?? base), nome: e.target.value })} className="sm:max-w-xs" />
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="outline" onClick={() => { setEditBase(false); setNovaBase(null); }}>Cancelar</Button>
              <Button onClick={salvarBase} disabled={!novaBase}>Salvar</Button>
            </div>
          </div>
        )}
      </div>

      {doDia.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma visita agendada para {format(dia, "EEEE, dd/MM", { locale: ptBR })}.</p>}
      {grupos.map((g) => (
        <section key={g.id || "none"} className="space-y-2" aria-label={`Paradas de ${g.nome}`}>
          <h3 className="font-semibold text-sm">{g.nome} <span className="font-normal text-muted-foreground">· {g.ordem.length + g.semLocal.length} parada(s){g.ordem.length ? ` · ≈ ${Math.round(g.km)} km em linha reta` : ""}</span></h3>
          <ol className="space-y-2">
            {g.ordem.map((p, i) => {
              const info = corInfo(p.s as any);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => onOpen(p.id)} className={cn("w-full text-left rounded-lg border border-l-4 bg-card p-3 flex items-start gap-3 hover:bg-accent", info.borda)}>
                    <span className="rota-pin shrink-0" style={{ background: info.fundo, color: info.texto }}>{i + 1}</span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block font-medium truncate">{p.nome}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <OcorrenciaTipoBadge s={p.s as any} />
                        {p.s.start_time && <span>{p.s.start_time.slice(0, 5)}</span>}
                        {p.checkin_em ? <span>· check-in {hhmm(p.checkin_em)}</span> : <span>· sugerida</span>}
                        {p.s.status !== "agendado" && <span>· {STATUS_LABEL[p.s.status] ?? p.s.status}</span>}
                      </span>
                    </span>
                  </button>
                </li>);
            })}
            {g.semLocal.map(({ s, nome }) => (
              <li key={s.id}>
                <button type="button" onClick={() => onOpen(s.id)} className={cn("w-full text-left rounded-lg border border-l-4 border-dashed bg-card p-3 hover:bg-accent", corInfo(s as any).borda)}>
                  <span className="block font-medium truncate">{nome}</span>
                  <span className="text-xs text-muted-foreground">Sem localização — não entra na trilha</span>
                </button>
              </li>))}
          </ol>
        </section>))}
    </div>
  );
}
