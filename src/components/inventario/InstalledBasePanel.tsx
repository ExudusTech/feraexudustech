import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Download, Upload } from "lucide-react";
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
import { baseAction, ESTADO_CLASS, ESTADO_HEX, ESTADO_LABEL, piorEstado, type ImportRow } from "@/lib/base-instalada";
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
        sb.from("comodatos").select("id, client_id, product_id, estado_atual, proxima_manutencao, status").eq("organization_id", user!.organization_id),
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

  const rows = useMemo(() => {
    if (!data) return [];
    return data.clients.filter((c) => c.status !== "inactive").map((c) => {
      const pts = data.pontos.filter((p) => p.client_id === c.id && (equip === "all" || p.product_id === equip));
      return { ...c, pontos: pts.length, pior: piorEstado(pts.map((p) => p.estado_atual)),
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
          Estado: r.pior ? ESTADO_LABEL[r.pior] : "", "Manutenção atrasada": r.atrasado ? "Sim" : "Não", "Itens a levar": r.ocorrencias })), "base-instalada")}>
          <Download className="h-4 w-4 mr-2" />Exportar</Button>
        {isManager && <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-2" />Importar clientes</Button>}
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
      <div className="rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Cidade</TableHead><TableHead>Pontos</TableHead><TableHead>Estado</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
          <TableBody>
            {!visible.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum cliente. A base é montada nas visitas de manutenção.</TableCell></TableRow>}
            {visible.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                <TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.city ?? "—"}</TableCell><TableCell>{r.pontos}</TableCell>
                <TableCell>{r.pior ? <Badge className={ESTADO_CLASS[r.pior]}>{ESTADO_LABEL[r.pior]}</Badge> : "—"}</TableCell>
                <TableCell className="space-x-1">{r.atrasado && <Badge variant="destructive">Atrasada</Badge>}{r.ocorrencias > 0 && <Badge variant="outline">{r.ocorrencias} a levar</Badge>}</TableCell>
              </TableRow>))}
          </TableBody>
        </Table>
      </div>
      <ClientBaseDialog client={open} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => { qc.invalidateQueries({ queryKey: ["installed-base"] }); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
    </div>
  );
}

function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [result, setResult] = useState<{ criados: number; linhas: ImportRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const read = async (file: File) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const head: string[] = [];
    const out: Record<string, unknown>[] = [];
    ws?.eachRow((row, n) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "text" in (v as any) ? (v as any).text : v));
      if (n === 1) vals.forEach((v) => head.push(String(v ?? "")));
      else out.push(Object.fromEntries(head.map((h, i) => [h, vals[i] ?? ""])));
    });
    setRows(out.slice(0, 500)); setResult(null);
  };
  const enviar = async () => {
    setBusy(true);
    try { const r = await baseAction<{ criados: number; linhas: ImportRow[] }>({ action: "importar", rows }); setResult(r); onDone(); toast({ title: `${r.criados} cliente(s) importado(s)` }); }
    catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Importar clientes ativos</DialogTitle>
          <DialogDescription>Planilha .xlsx com as colunas: Cliente, Cidade, Frequência (semanal, quinzenal, mensal), Dia (ex.: terça) e, opcional, Consultor. Os pontos são cadastrados nas visitas.</DialogDescription></DialogHeader>
        <input type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f).catch(() => toast({ title: "Não foi possível ler a planilha", variant: "destructive" })); }} />
        {rows.length > 0 && !result && <p className="text-sm">{rows.length} linha(s) lidas.</p>}
        {result && <div className="max-h-64 overflow-y-auto text-sm space-y-1">{result.linhas.map((l, i) => (
          <p key={i} className={l.erro ? "text-destructive" : ""}>{l.cliente || "—"} · {l.cidade || "—"} {l.erro ? `— ${l.erro}` : "✓"}</p>))}</div>}
        <Button disabled={busy || !rows.length || !!result} onClick={enviar}>Importar</Button>
      </DialogContent>
    </Dialog>
  );
}
