import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProducts, type Product } from "@/hooks/use-products";
import { useDispenserFamilies } from "@/hooks/use-dispenser-families";
import { usePermissions } from "@/hooks/use-permissions";
import { useOrganizationUsers } from "@/hooks/use-users";
import { toast } from "@/hooks/use-toast";
import { refisCompativeis } from "@/lib/base-instalada";
import { ajusteErro, contagemBase, deltaAjuste, disponivel, emAlerta, reservasEstoque, STATUS_VISITA_RESERVA, TIPO_AJUSTE_LABEL, TIPO_MOV_LABEL, type TipoAjuste } from "@/lib/estoque";
import { formatEtiqueta } from "@/lib/etiquetas";
import { OPERACAO_LABEL, type OperacaoMaterial } from "@/lib/prontidao";
import { cn } from "@/lib/utils";
import { useProductImageUrls } from "@/hooks/use-product-images";
import { fotoPrincipal, listaFotosRef } from "@/lib/fotos-referencia";

/** Stock tab: devices (dispensers) by family with stock, reserved, available, in test and installed; manager adjustments with history. */
export default function EstoquePanel() {
  const { user } = useAuth();
  const { roles = [] } = usePermissions() as any;
  const gestor = (roles as string[]).some((r) => ["admin", "gestor", "super_admin"].includes(r));
  const { data: products = [] } = useProducts();
  const { data: familias = [] } = useDispenserFamilies();
  const hoje = format(new Date(), "yyyy-MM-dd");
  const { data } = useQuery({
    queryKey: ["estoque", user?.organization_id, hoje], enabled: !!user?.organization_id,
    queryFn: async () => {
      const sb = supabase as any; const org = user!.organization_id;
      const [c, s, o] = await Promise.all([
        sb.from("comodatos").select("id, product_id, status, quantidade, etiqueta_numero, ocorrencia_schedule_id, reserva_os_id").eq("organization_id", org).in("status", ["ATIVO", "EM_TESTE", "SEPARADO"]),
        sb.from("schedules").select("id, status, scheduled_date, operacao_material, itens, title, clients(name), leads(empresa_nome, company)").eq("organization_id", org)
          .not("operacao_material", "is", null).gte("scheduled_date", hoje).in("status", STATUS_VISITA_RESERVA).limit(500),
        sb.from("maintenance_schedule").select("id, status, item_product_id, quantidade, schedule_id, resolvida_schedule_id, title, clients(name)").eq("organization_id", org)
          .eq("tipo_os", "substituicao").in("status", ["agendada", "em_andamento"]).limit(500),
      ]);
      return { aparelhos: (c.data ?? []) as any[], visitas: (s.data ?? []) as any[], ordens: (o.data ?? []) as any[] };
    },
  });
  const [familia, setFamilia] = useState("all"); const [marca, setMarca] = useState("all"); const [soAlerta, setSoAlerta] = useState(false);
  const [ajuste, setAjuste] = useState<Product | null>(null);

  const dispensers = products.filter((p) => p.is_dispenser && p.is_active);
  const refis = products.filter((p) => !p.is_dispenser && p.is_active);
  const linhas = useMemo(() => {
    const res = reservasEstoque({ hoje, visitas: data?.visitas ?? [], ordens: data?.ordens ?? [], aparelhos: data?.aparelhos ?? [], dispensers: new Set(dispensers.map((p) => p.id)) });
    const base = contagemBase(data?.aparelhos ?? []);
    return dispensers.map((p) => {
      const r = res.get(p.id); const b = base.get(p.id);
      const disp = disponivel(p.stock, r?.reservados ?? 0);
      return { p, reservados: r?.reservados ?? 0, reservas: r?.linhas ?? [], disp, em_teste: b?.em_teste ?? 0, instalados: b?.instalados ?? 0, alerta: emAlerta(disp, p.min_stock) };
    });
  }, [data, dispensers, hoje]);
  const { data: fotoUrls = {} } = useProductImageUrls(dispensers.flatMap((p) => [...listaFotosRef(p.fotos_referencia).map((f) => f.path), p.image_url]));
  const marcas = [...new Set(dispensers.map((p) => p.brand).filter(Boolean) as string[])].sort();
  const visiveis = linhas.filter((l) => (familia === "all" || (familia === "sem" ? !l.p.dispenser_family_id : l.p.dispenser_family_id === familia))
    && (marca === "all" || l.p.brand === marca) && (!soAlerta || l.alerta));
  const grupos = [...familias.map((f) => ({ id: f.id, nome: f.name, itens: visiveis.filter((l) => l.p.dispenser_family_id === f.id) })),
    { id: "sem", nome: "Sem família", itens: visiveis.filter((l) => !l.p.dispenser_family_id || !familias.some((f) => f.id === l.p.dispenser_family_id)) }].filter((g) => g.itens.length);
  const nomeVisita = (id: string) => { const s = data?.visitas.find((x) => x.id === id); return s ? `${OPERACAO_LABEL[s.operacao_material as OperacaoMaterial] ?? "Ocorrência"} — ${s.clients?.name ?? s.leads?.empresa_nome ?? s.leads?.company ?? s.title} (${s.scheduled_date.split("-").reverse().join("/")})` : "Ocorrência"; };
  const nomeOrdem = (id: string) => { const o = data?.ordens.find((x) => x.id === id); return o ? `Substituição — ${o.clients?.name ?? o.title}` : "Substituição"; };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={familia} onValueChange={setFamilia}><SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas as famílias</SelectItem>{familias.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}<SelectItem value="sem">Sem família</SelectItem></SelectContent></Select>
        <Select value={marca} onValueChange={setMarca}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas as marcas</SelectItem>{marcas.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
        <label className="flex items-center gap-2 text-sm min-h-11"><Switch checked={soAlerta} onCheckedChange={setSoAlerta} />Só com alerta</label>
        <span className="text-xs text-muted-foreground sm:ml-auto">{linhas.filter((l) => l.alerta).length} aparelho(s) em alerta</span>
      </div>
      {!grupos.length && <p className="text-sm text-muted-foreground">Nenhum aparelho com esses filtros.</p>}
      {grupos.map((g) => (
        <div key={g.id} className="space-y-2">
          <h3 className="text-sm font-semibold">{g.nome} <span className="text-muted-foreground font-normal">({g.itens.length})</span></h3>
          {g.id === "sem" && <p className="text-xs text-warning">Complete a família no cadastro do produto para ver os refis compatíveis.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {g.itens.map((l) => {
              const compat = refisCompativeis(l.p as any, refis as any[]);
              return (
                <Card key={l.p.id} className={cn(l.alerta && "border-warning")}><CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {(() => { const f = fotoPrincipal(l.p); return f && fotoUrls[f]
                      ? <img src={fotoUrls[f]} alt="" loading="lazy" className="h-12 w-12 rounded border object-cover shrink-0" /> : null; })()}
                    <div className="flex-1 min-w-0"><p className="font-medium text-sm break-words">{l.p.name}</p>
                      {l.p.codigo_fabricante && <p className="text-xs break-words">Modelo: {l.p.codigo_fabricante}</p>}
                      <p className="text-xs text-muted-foreground">{[l.p.brand, l.p.sku].filter(Boolean).join(" · ") || "—"} · mínimo {l.p.min_stock}</p></div>
                    {l.alerta && <Badge variant="outline" className="border-warning text-warning gap-1 shrink-0"><AlertTriangle className="h-3 w-3" />Alerta</Badge>}
                  </div>
                  {listaFotosRef(l.p.fotos_referencia).length > 1 && <div className="flex gap-2">
                    {listaFotosRef(l.p.fotos_referencia).map((f) => fotoUrls[f.path] && (
                      <a key={f.key} href={fotoUrls[f.path]} target="_blank" rel="noopener noreferrer" className="text-center">
                        <img src={fotoUrls[f.path]} alt={`${l.p.name} — ${f.label}`} loading="lazy" className="h-16 w-16 rounded border object-cover" />
                        <span className="block text-[10px] text-muted-foreground">{f.label}</span></a>))}
                  </div>}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    {[["Em estoque", l.p.stock], ["Reservados", l.reservados], ["Disponível", l.disp], ["Em teste", l.em_teste], ["Instalados", l.instalados]].map(([k, v]) => (
                      <div key={k as string} className={cn("rounded border p-1.5", k === "Disponível" && l.alerta && "border-warning text-warning")}><p className="text-muted-foreground">{k}</p><p className="text-base font-semibold">{v}</p></div>))}
                    {gestor && <Button variant="outline" className="h-full min-h-11 text-xs" onClick={() => setAjuste(l.p)}><SlidersHorizontal className="h-3 w-3" />Ajustar</Button>}
                  </div>
                  {l.reservas.length > 0 && <Collapsible><CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground min-h-9"><ChevronDown className="h-3 w-3" />Reservas ({l.reservas.length})</CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 text-xs">{l.reservas.map((r) => (
                      <p key={r.ref_id}>{r.quantidade}x · {r.origem === "visita" ? nomeVisita(r.ref_id) : nomeOrdem(r.ref_id)}
                        {r.separados.length > 0 && <span className="block text-success">{r.separados.map((n) => `aparelho nº ${formatEtiqueta(n)} separado`).join(" · ")}</span>}</p>))}
                    </CollapsibleContent></Collapsible>}
                  <Collapsible><CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground min-h-9"><ChevronDown className="h-3 w-3" />Refis compatíveis ({compat.mapeado ? compat.lista.length : "mesma marca"})</CollapsibleTrigger>
                    <CollapsibleContent className="text-xs">{compat.lista.length ? compat.lista.slice(0, 30).map((r) => r.name).join(" · ") : "Nenhum refil cadastrado."}</CollapsibleContent></Collapsible>
                </CardContent></Card>);
            })}
          </div>
        </div>))}
      <AjusteDialog produto={ajuste} onClose={() => setAjuste(null)} />
    </div>
  );
}

function AjusteDialog({ produto, onClose }: { produto: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoAjuste>("entrada");
  const [qtd, setQtd] = useState(""); const [motivo, setMotivo] = useState(""); const [minimo, setMinimo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: users = [] } = useOrganizationUsers();
  const nomeUsuario = (id?: string | null) => (users as any[]).find((u) => u.user_id === id)?.name ?? null;
  const { data: hist = [], refetch } = useQuery({
    queryKey: ["stock-movements", produto?.id], enabled: !!produto,
    queryFn: async () => ((await (supabase as any).from("stock_movements").select("id, created_at, tipo, quantidade, saldo_antes, saldo_depois, motivo, autor_id").eq("product_id", produto!.id)
      .order("created_at", { ascending: false }).limit(20)).data ?? []) as any[],
  });
  const n = qtd === "" ? null : Number(qtd);
  const erro = produto ? ajusteErro(tipo, n, motivo) : null;
  const fechar = () => { setQtd(""); setMotivo(""); setMinimo(null); setTipo("entrada"); onClose(); };
  const salvar = async () => {
    if (!produto || erro) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("ajustar_estoque", { _product: produto.id, _tipo: tipo, _quantidade: n, _motivo: motivo.trim() });
      if (error) throw new Error(error.message?.length < 120 ? error.message : "Não foi possível ajustar");
      if (minimo !== null && minimo !== String(produto.min_stock)) {
        const { error: me } = await supabase.from("products").update({ min_stock: Number(minimo) || 0 }).eq("id", produto.id);
        if (me) throw new Error("Estoque ajustado, mas o mínimo não foi salvo");
      }
      toast({ title: "Estoque ajustado" });
      qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["estoque"] }); refetch(); setQtd(""); setMotivo("");
    } catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!produto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Ajustar estoque</DialogTitle><DialogDescription>{produto?.name} · hoje {produto?.stock}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">{(Object.keys(TIPO_AJUSTE_LABEL) as TipoAjuste[]).map((t) => (
            <Button key={t} type="button" variant={tipo === t ? "default" : "outline"} className="min-h-11" onClick={() => setTipo(t)}>{TIPO_AJUSTE_LABEL[t]}</Button>))}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>{tipo === "contagem" ? "Quantidade contada" : "Quantidade"}</Label>
              <Input inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
            <div><Label>Estoque mínimo</Label>
              <Input inputMode="numeric" value={minimo ?? String(produto?.min_stock ?? 0)} onChange={(e) => setMinimo(e.target.value.replace(/\D/g, "").slice(0, 5))} /></div>
          </div>
          <div><Label>Motivo</Label><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ex.: compra NF 1234, contagem mensal, aparelho danificado" /></div>
          {produto && n !== null && !erro && <p className="text-sm">Saldo passa de <strong>{produto.stock}</strong> para <strong>{produto.stock + deltaAjuste(tipo, n, produto.stock)}</strong>.</p>}
          {erro && (qtd !== "" || motivo) && <p className="text-xs text-warning">{erro}</p>}
          <Button className="w-full min-h-11" disabled={busy || !!erro} onClick={salvar}>Salvar ajuste</Button>
          <div className="space-y-1">
            <p className="text-sm font-medium">Histórico</p>
            {!hist.length && <p className="text-xs text-muted-foreground">Sem movimentações ainda.</p>}
            {hist.map((h) => (
              <div key={h.id} className="text-xs border-b last:border-0 pb-1">
                <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{nomeUsuario(h.autor_id) ? ` · ${nomeUsuario(h.autor_id)}` : ""}</span>
                <p>{TIPO_MOV_LABEL[h.tipo] ?? h.tipo}: {h.quantidade > 0 ? "+" : ""}{h.quantidade} ({h.saldo_antes} → {h.saldo_depois}){h.motivo ? ` — ${h.motivo}` : ""}</p>
              </div>))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
