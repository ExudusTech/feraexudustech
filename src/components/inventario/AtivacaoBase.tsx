import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizationUsers } from "@/hooks/use-users";
import { toast } from "@/hooks/use-toast";
import { baseAction, type ImportRow } from "@/lib/base-instalada";

const br = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const amanha = () => new Date(Date.now() - 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
const cellText = (v: unknown): unknown => {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("text" in o) return o.text;
    if ("result" in o) return o.result;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
  }
  return v;
};

/** Manager's client sheet: read → preview (dedupe, warnings) → save. Then offers the batch activation for the imported clients. */
export function ImportarCarteiraDialog({ open, onOpenChange, onDone, onAtivar }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; onAtivar: (ids: string[]) => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [previa, setPrevia] = useState<ImportRow[] | null>(null);
  const [result, setResult] = useState<{ criados: number; client_ids: string[]; linhas: ImportRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setRows([]); setPrevia(null); setResult(null); } }, [open]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); } finally { setBusy(false); } };
  const read = (file: File) => run(async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const head: string[] = []; const out: Record<string, unknown>[] = [];
    ws?.eachRow((row, n) => {
      const vals = (row.values as unknown[]).slice(1).map(cellText);
      if (n === 1) vals.forEach((v) => head.push(String(v ?? "").trim()));
      else if (vals.some((v) => String(v ?? "").trim())) out.push(Object.fromEntries(head.map((h, i) => [h, vals[i] == null ? "" : String(vals[i])])));
    });
    if (!out.length) throw new Error("A planilha não tem linhas");
    const lista = out.slice(0, 500);
    setRows(lista); setResult(null);
    const r = await baseAction<{ linhas: ImportRow[] }>({ action: "importar_previa", rows: lista });
    setPrevia(r.linhas);
  });
  const gravar = () => run(async () => {
    const r = await baseAction<{ criados: number; client_ids: string[]; linhas: ImportRow[] }>({ action: "importar", rows });
    setResult(r); onDone(); toast({ title: `${r.criados} cliente(s) importado(s)`, description: "Endereços sendo localizados no mapa." });
  });
  const linhas = result?.linhas ?? previa ?? [];
  const novos = linhas.filter((l) => !l.erro).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>Importar carteira de clientes</DialogTitle>
          <DialogDescription>Planilha .xlsx com: Nome ou Razão social, CNPJ (opcional), Endereço, Bairro, Cidade, CEP, Contato, Telefone, E-mail e Segmento (opcional).
            Clientes repetidos (mesmo CNPJ ou mesmo nome na mesma cidade) não entram. Você vê a prévia antes de gravar.</DialogDescription></DialogHeader>
        {!result && <input type="file" accept=".xlsx" aria-label="Planilha" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />}
        {busy && !linhas.length && <p className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Lendo a planilha…</p>}
        {linhas.length > 0 && <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{result ? `${result.criados} gravado(s)` : `${novos} novo(s)`}</Badge>
            <Badge variant="outline">{linhas.length - novos} fora (repetido ou com erro)</Badge>
            <Badge variant="outline">{linhas.filter((l) => !l.erro && l.avisos?.length).length} com aviso</Badge>
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-md md:border">
            <table className="w-full text-sm table-cards">
              <thead><tr className="text-left text-muted-foreground"><th className="p-2">Cliente</th><th className="p-2">Cidade</th><th className="p-2">CNPJ</th><th className="p-2">Contato</th><th className="p-2">Situação</th></tr></thead>
              <tbody>{linhas.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-medium">{l.cliente || "—"}{l.endereco && <span className="block text-xs font-normal text-muted-foreground">{[l.endereco, l.bairro, l.cep].filter(Boolean).join(" · ")}</span>}</td>
                  <td className="p-2" data-label="Cidade">{l.cidade || "—"}</td>
                  <td className="p-2" data-label="CNPJ">{l.cnpj ?? "—"}</td>
                  <td className="p-2" data-label="Contato">{[l.contato, l.telefone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="p-2" data-card="body">{l.erro ? <span className="text-destructive">{l.erro}</span> : <span className="text-success">{result ? "Gravado" : "Novo"}</span>}
                    {l.avisos?.map((a) => <span key={a} className="block text-xs text-warning">{a}</span>)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>}
        {!result ? <Button className="min-h-11" disabled={busy || !novos} onClick={gravar}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Gravar {novos} cliente(s)</Button>
          : result.client_ids.length > 0 && <Button className="min-h-11" onClick={() => onAtivar(result.client_ids)}><CalendarPlus className="h-4 w-4" />Gerar visitas de ativação para os {result.client_ids.length} importados</Button>}
      </DialogContent>
    </Dialog>
  );
}

interface LinhaAtivacao { client_id: string; nome: string; cidade: string | null; regiao: string | null; data?: string; hora?: string; erro?: string; codigo?: string }

/** "Gerar visitas de ativação" (manager): clients without devices → one activation occurrence each, on the route day, capped per day; preview first. */
export function AtivacaoDialog({ open, onOpenChange, preselecionados }: { open: boolean; onOpenChange: (o: boolean) => void; preselecionados?: string[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: users = [] } = useOrganizationUsers();
  const consultores = users.filter((u) => u.is_active && u.roles.some((r) => ["consultor_tecnico", "vendedor", "gestor", "operacional", "admin"].includes(r)));
  const { data: candidatos = [], isLoading } = useQuery({
    queryKey: ["ativacao-candidatos", user?.organization_id], enabled: open && !!user?.organization_id,
    queryFn: async () => {
      const sb = supabase as any;
      const [c, p, s] = await Promise.all([
        sb.from("clients").select("id, name, city").eq("organization_id", user!.organization_id).neq("status", "inactive").order("name").limit(3000),
        sb.from("comodatos").select("client_id").eq("organization_id", user!.organization_id).in("status", ["ATIVO", "EM_TESTE", "RETIRADO"]).not("client_id", "is", null),
        sb.from("schedules").select("client_id").eq("organization_id", user!.organization_id).eq("ocorrencia_tipo", "ativacao_base").in("status", ["agendado", "confirmado", "em_atendimento"]),
      ]);
      const com = new Set(((p.data ?? []) as any[]).map((x) => x.client_id)); const marcadas = new Set(((s.data ?? []) as any[]).map((x) => x.client_id));
      return ((c.data ?? []) as any[]).filter((x) => !com.has(x.id) && !marcadas.has(x.id)) as { id: string; name: string; city: string | null }[];
    },
  });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState(""); const [consultor, setConsultor] = useState(""); const [desde, setDesde] = useState(amanha()); const [max, setMax] = useState("8");
  const [previa, setPrevia] = useState<LinhaAtivacao[] | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSel(new Set(preselecionados ?? [])); setPrevia(null); setBusca(""); setDesde(amanha()); } }, [open, preselecionados]);
  const visiveis = useMemo(() => { const q = busca.trim().toLowerCase(); return candidatos.filter((c) => !q || `${c.name} ${c.city ?? ""}`.toLowerCase().includes(q)); }, [candidatos, busca]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); } finally { setBusy(false); } };
  const body = () => ({ client_ids: [...sel], consultor_id: consultor, desde, max_por_dia: Number(max) || 8 });
  const verPrevia = () => run(async () => { const r = await baseAction<{ linhas: LinhaAtivacao[] }>({ action: "ativacao_previa", ...body() }); setPrevia(r.linhas); });
  const criar = () => run(async () => {
    const r = await baseAction<{ criadas: number; linhas: LinhaAtivacao[] }>({ action: "ativacao_criar", ...body() });
    qc.invalidateQueries({ queryKey: ["schedules"] }); qc.invalidateQueries({ queryKey: ["ativacao-candidatos"] });
    toast({ title: `${r.criadas} visita(s) de ativação criada(s)`, description: r.linhas.some((l) => l.erro) ? "Alguns clientes ficaram de fora: veja o motivo na lista." : undefined });
    if (r.linhas.some((l) => l.erro)) setPrevia(r.linhas.filter((l) => l.erro)); else onOpenChange(false);
  });
  const ok = (previa ?? []).filter((l) => !l.erro).length;
  const toggle = (id: string, v: boolean) => { setPrevia(null); setSel((cur) => { const n = new Set(cur); if (v) n.add(id); else n.delete(id); return n; }); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Gerar visitas de ativação</DialogTitle>
          <DialogDescription>Uma ocorrência "Ativação da base" por cliente sem aparelhos, no próximo dia de rota da região, fora de feriados, bloqueios e horários ocupados.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Consultor</Label>
            <Select value={consultor} onValueChange={(v) => { setConsultor(v); setPrevia(null); }}><SelectTrigger aria-label="Consultor"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{consultores.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor="ativ-desde">A partir de</Label><Input id="ativ-desde" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPrevia(null); }} /></div>
          <div className="space-y-1"><Label htmlFor="ativ-max">Máximo por dia</Label><Input id="ativ-max" inputMode="numeric" value={max} onChange={(e) => { setMax(e.target.value.replace(/\D/g, "").slice(0, 2)); setPrevia(null); }} /></div>
        </div>
        {!previa ? <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="flex-1 min-w-[10rem]" placeholder="Buscar cliente ou cidade" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => { setSel(new Set([...sel, ...visiveis.map((c) => c.id)])); setPrevia(null); }}>Marcar todos</Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={() => { setSel(new Set()); setPrevia(null); }}>Limpar</Button>
          </div>
          <p className="text-xs text-muted-foreground">{isLoading ? "Carregando…" : `${candidatos.length} cliente(s) sem aparelhos e sem ativação marcada · ${sel.size} escolhido(s)`}</p>
          <div className="max-h-[40vh] overflow-y-auto rounded-md border divide-y">
            {visiveis.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-2 min-h-11 text-sm cursor-pointer">
                <Checkbox checked={sel.has(c.id)} onCheckedChange={(v) => toggle(c.id, !!v)} /><span className="flex-1">{c.name}</span><span className="text-muted-foreground">{c.city ?? "—"}</span></label>))}
            {!isLoading && !visiveis.length && <p className="p-3 text-sm text-muted-foreground">Nenhum cliente sem aparelhos.</p>}
          </div>
          <Button className="w-full min-h-11" disabled={busy || !sel.size || !consultor} onClick={verPrevia}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Ver prévia</Button>
        </div> : <div className="space-y-2">
          <div className="max-h-[50vh] overflow-y-auto rounded-md md:border">
            <table className="w-full text-sm table-cards">
              <thead><tr className="text-left text-muted-foreground"><th className="p-2">Cliente</th><th className="p-2">Região</th><th className="p-2">Visita</th></tr></thead>
              <tbody>{previa.map((l) => (
                <tr key={l.client_id} className="border-t">
                  <td className="p-2 font-medium">{l.nome}<span className="block text-xs font-normal text-muted-foreground">{l.cidade ?? ""}</span></td>
                  <td className="p-2" data-label="Região">{l.regiao ?? "—"}</td>
                  <td className="p-2" data-card="body">{l.erro ? <span className="text-destructive">{l.erro}</span> : <span>{br(l.data)} às {l.hora}{l.codigo ? ` · #${l.codigo}` : ""}</span>}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setPrevia(null)}>Voltar e ajustar</Button>
            <Button className="min-h-11" disabled={busy || !ok} onClick={criar}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Criar {ok} visita(s)</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
