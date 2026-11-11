import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CalendarPlus, Download, Upload, QrCode, Search } from "lucide-react";
import { AtivacaoDialog, ImportarCarteiraDialog } from "@/components/inventario/AtivacaoBase";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import EtiquetaScanner from "@/components/etiquetas/EtiquetaScanner";
import { formatEtiqueta, parseEtiqueta } from "@/lib/etiquetas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProducts } from "@/hooks/use-products";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { exportToExcel } from "@/lib/export-utils";
import ClientBaseDialog from "@/components/crm/ClientBaseDialog";
import { ESTADO_CLASS, ESTADO_HEX, ESTADO_LABEL, piorEstado } from "@/lib/base-instalada";
import { cn } from "@/lib/utils";

type Card = "clientes" | "pontos" | "alerta" | "atrasados" | "ocorrencias";

/** Installed base: map of active clients with point counts/state, filters, clickable cards and Excel export. */
import SepararMaterial from "@/components/inventario/SepararMaterial";
import SepararEquipamentos from "@/components/inventario/SepararEquipamentos";

export default function InstalledBasePanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { roles = [] } = usePermissions() as any;
  const isManager = (roles as string[]).some((r) => ["admin", "gestor", "super_admin"].includes(r));
  const { data: products = [] } = useProducts();
  const { data } = useQuery({
    queryKey: ["installed-base", user?.organization_id], enabled: !!user?.organization_id,
    queryFn: async () => {
      const sb = supabase as any;
      const [c, p, o] = await Promise.all([
        sb.from("clients").select("id, name, city, latitude, longitude, status").eq("organization_id", user!.organization_id),
        sb.from("comodatos").select("id, client_id, product_id, estado_atual, proxima_manutencao, status, etiqueta_numero").eq("organization_id", user!.organization_id),
        sb.from("maintenance_schedule").select("id, client_id").eq("organization_id", user!.organization_id).eq("tipo_os", "substituicao").in("status", ["agendada", "em_andamento"]),
      ]);
      return { clients: (c.data ?? []) as any[], pontos: ((p.data ?? []) as any[]).filter((x) => (x.status ?? "ATIVO").toUpperCase() === "ATIVO"), ocorrencias: (o.data ?? []) as any[] };
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  const [cidade, setCidade] = useState("all"); const [equip, setEquip] = useState("all"); const [estado, setEstado] = useState("all");
  const [card, setCard] = useState<Card | null>(null);
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ativOpen, setAtivOpen] = useState(false); const [ativIds, setAtivIds] = useState<string[] | undefined>(undefined);
  const navigate = useNavigate();
  const [busca, setBusca] = useState(""); const [scan, setScan] = useState(false);
  const abrirNumero = (n: number | null) => { if (n) navigate(`/aparelho/${formatEtiqueta(n)}`); else toast({ title: "Digite o número da etiqueta", variant: "destructive" }); };

  const rows = useMemo(() => {
    if (!data) return [];
    return data.clients.filter((c) => c.status !== "inactive").map((c) => {
      const pts = data.pontos.filter((p) => p.client_id === c.id && (equip === "all" || p.product_id === equip));
      return { ...c, pontos: pts.length, etiquetas: pts.map((p) => p.etiqueta_numero).filter(Boolean).sort((a: number, b: number) => a - b) as number[], pior: piorEstado(pts.map((p) => p.estado_atual)),
        atrasado: pts.some((p) => p.proxima_manutencao && p.proxima_manutencao < today),
        ocorrencias: data.ocorrencias.filter((o) => o.client_id === c.id).length };
    }).filter((r) => (cidade === "all" || r.city === cidade) && (estado === "all" || (estado === "atrasado" ? r.atrasado : r.pior === estado))
      && (equip === "all" || r.pontos > 0));
  }, [data, cidade, equip, estado, today]);
  const visible = rows.filter((r) => !card || card === "clientes" || (card === "pontos" && r.pontos > 0) || (card === "alerta" && (r.pior === "amarelo" || r.pior === "vermelho"))
    || (card === "atrasados" && r.atrasado) || (card === "ocorrencias" && r.ocorrencias > 0));
  const cidades = [...new Set((data?.clients ?? []).map((c) => c.city).filter(Boolean))].sort();
  const dispensers = products.filter((p) => p.is_dispenser);
  const cards: { k: Card; label: string; v: number }[] = [
    { k: "clientes", label: "Clientes ativos", v: rows.length }, { k: "pontos", label: "Pontos", v: rows.reduce((a, r) => a + r.pontos, 0) },
    { k: "alerta", label: "Atenção / ruim", v: rows.filter((r) => r.pior === "amarelo" || r.pior === "vermelho").length },
    { k: "atrasados", label: "Manutenção atrasada", v: rows.filter((r) => r.atrasado).length },
    { k: "ocorrencias", label: "Com itens a levar", v: rows.filter((r) => r.ocorrencias > 0).length },
  ];
  const located = visible.filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number");

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); abrirNumero(parseEtiqueta(busca)); }}>
        <div className="relative flex-1 min-w-[12rem] sm:max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" inputMode="numeric" placeholder="Buscar aparelho pelo nº da etiqueta" aria-label="Número da etiqueta" value={busca} onChange={(e) => setBusca(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
        <Button type="submit" variant="outline" className="min-h-10">Abrir</Button>
        <Button type="button" variant="outline" className="min-h-10" onClick={() => setScan(true)}><QrCode className="h-4 w-4 mr-2" />Escanear etiqueta</Button>
      </form>
      <EtiquetaScanner open={scan} onOpenChange={setScan} onNumero={(n) => { setScan(false); abrirNumero(n); }} />
      <SepararEquipamentos />
      <SepararMaterial />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <button key={c.k} type="button" onClick={() => setCard(card === c.k ? null : c.k)} className="text-left">
            <Card className={cn("transition-colors", card === c.k && "border-primary")}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p><p className="text-2xl font-bold">{c.v}</p></CardContent></Card>
          </button>))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Select value={cidade} onValueChange={setCidade}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas as cidades</SelectItem>{cidades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={equip} onValueChange={setEquip}><SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os equipamentos</SelectItem>{dispensers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
        <Select value={estado} onValueChange={setEstado}><SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os estados</SelectItem>{["verde", "amarelo", "vermelho"].map((e) => <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>)}
            <SelectItem value="atrasado">Manutenção atrasada</SelectItem></SelectContent></Select>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => exportToExcel(visible.map((r) => ({ Cliente: r.name, Cidade: r.city ?? "", Pontos: r.pontos,
          Estado: r.pior ? ESTADO_LABEL[r.pior] : "", Etiquetas: r.etiquetas.map(formatEtiqueta).join(", "), "Manutenção atrasada": r.atrasado ? "Sim" : "Não", "Itens a levar": r.ocorrencias })), "base-instalada")}>
          <Download className="h-4 w-4 mr-2" />Exportar</Button>
        {isManager && <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-2" />Importar clientes</Button>}
        {isManager && <Button variant="outline" onClick={() => { setAtivIds(undefined); setAtivOpen(true); }}><CalendarPlus className="h-4 w-4 mr-2" />Gerar visitas de ativação</Button>}
      </div>
      <div className="h-[360px] rounded-lg overflow-hidden border">
        <MapContainer center={[-22.88, -42.02]} zoom={9} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {located.map((r) => (
            <CircleMarker key={r.id} center={[r.latitude, r.longitude]} radius={6 + Math.min(10, r.pontos)} eventHandlers={{ click: () => setOpen(r) }}
              pathOptions={{ color: r.pior ? ESTADO_HEX[r.pior] : "hsl(0 0% 60%)", fillOpacity: 0.7 }}>
              <Tooltip>{r.name} · {r.pontos} ponto(s)</Tooltip>
            </CircleMarker>))}
        </MapContainer>
      </div>
      {visible.length > located.length && <p className="text-xs text-muted-foreground">{visible.length - located.length} cliente(s) ainda sem localização: ela é gravada no primeiro check-in.</p>}
      <div className="rounded-lg md:border">
        <Table className="table-cards">
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Cidade</TableHead><TableHead>Pontos</TableHead><TableHead>Estado</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
          <TableBody>
            {!visible.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum cliente. A base é montada nas visitas de manutenção.</TableCell></TableRow>}
            {visible.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                <TableCell className="font-medium">{r.name}{r.etiquetas.length > 0 && <span className="block text-xs font-normal text-muted-foreground font-mono">nº {r.etiquetas.slice(0, 6).map(formatEtiqueta).join(", ")}{r.etiquetas.length > 6 ? ` +${r.etiquetas.length - 6}` : ""}</span>}</TableCell><TableCell data-label="Cidade">{r.city ?? "—"}</TableCell><TableCell data-label="Pontos">{r.pontos}</TableCell>
                <TableCell data-label="Estado">{r.pior ? <Badge className={ESTADO_CLASS[r.pior]}>{ESTADO_LABEL[r.pior]}</Badge> : "—"}</TableCell>
                <TableCell data-card="body" className="space-x-1">{r.atrasado && <Badge variant="destructive">Atrasada</Badge>}{r.ocorrencias > 0 && <Badge variant="outline">{r.ocorrencias} a levar</Badge>}</TableCell>
              </TableRow>))}
          </TableBody>
        </Table>
      </div>
      <ClientBaseDialog client={open} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
      <ImportarCarteiraDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => { qc.invalidateQueries({ queryKey: ["installed-base"] }); qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["ativacao-candidatos"] }); }}
        onAtivar={(ids) => { setImportOpen(false); setAtivIds(ids); setAtivOpen(true); }} />
      <AtivacaoDialog open={ativOpen} onOpenChange={setAtivOpen} preselecionados={ativIds} />
    </div>
  );
}
