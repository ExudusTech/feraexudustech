import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, FileText, AlertTriangle, Plus, X, Loader2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  OPERACAO_LABEL, TIPO_NOTA_LABEL, cnpjValido, formatCnpj, notaPadrao, operacoesPara, prontidaoLabel,
  type ItemOperacao, type OperacaoMaterial, type TipoNota,
} from "@/lib/prontidao";

/** "Pendente: falta nota / falta separar material" badge; renders nothing when ready or not required. */
export function ProntidaoBadge({ prontidao, compact }: { prontidao?: string | null; compact?: boolean }) {
  const label = prontidaoLabel(prontidao);
  if (!label) return null;
  return (
    <Badge variant="outline" className="gap-1 border-warning/50 text-warning whitespace-normal text-left">
      <AlertTriangle className="h-3 w-3 shrink-0" />{compact ? label.replace("Pendente: ", "") : label}
    </Badge>
  );
}

export interface MaterialValue { operacao: OperacaoMaterial | ""; tipo_nota: TipoNota | ""; itens: ItemOperacao[] }
export const emptyMaterial: MaterialValue = { operacao: "", tipo_nota: "", itens: [] };

export function MaterialFields({ scheduleType, value, onChange }: { scheduleType: string; value: MaterialValue; onChange: (v: MaterialValue) => void }) {
  const { user } = useAuth();
  const ops = operacoesPara(scheduleType);
  const [term, setTerm] = useState("");
  const { data: products = [] } = useQuery({
    queryKey: ["products-lite", user?.organization_id], enabled: !!user?.organization_id && ops.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name").eq("organization_id", user!.organization_id!).eq("is_active", true).order("name").limit(1000);
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const found = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t.length < 2 ? [] : products.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 8);
  }, [products, term]);
  if (!ops.length) return null;
  const setItem = (i: number, patch: Partial<ItemOperacao>) => onChange({ ...value, itens: value.itens.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <div className="sm:col-span-2 space-y-2 rounded-md border p-3">
      <Label>Envolve material?</Label>
      <Select value={value.operacao || "none"} onValueChange={(v) => {
        const op = v === "none" ? "" : (v as OperacaoMaterial);
        onChange({ ...value, operacao: op, tipo_nota: op ? notaPadrao(op) : "" });
      }}>
        <SelectTrigger aria-label="Envolve material"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Não (sem nota nem material)</SelectItem>
          {ops.map((o) => <SelectItem key={o} value={o}>{OPERACAO_LABEL[o]}</SelectItem>)}
        </SelectContent>
      </Select>
      {value.operacao && (
        <>
          <div>
            <Label className="text-xs">Tipo de nota</Label>
            <Select value={value.tipo_nota || notaPadrao(value.operacao)} onValueChange={(v) => onChange({ ...value, tipo_nota: v as TipoNota })}>
              <SelectTrigger aria-label="Tipo de nota"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(TIPO_NOTA_LABEL) as TipoNota[]).map((t) => <SelectItem key={t} value={t}>{TIPO_NOTA_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Label className="text-xs">Itens (aparelhos e refis)</Label>
          {value.itens.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="w-20" inputMode="numeric" aria-label="Quantidade" value={it.quantidade} onChange={(e) => setItem(i, { quantidade: e.target.value.replace(/[^\d]/g, "") })} />
              <span className="flex-1 text-sm truncate">{it.descricao}</span>
              <Button type="button" variant="ghost" size="icon" aria-label="Remover item" onClick={() => onChange({ ...value, itens: value.itens.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Input placeholder="Buscar produto para adicionar..." value={term} onChange={(e) => setTerm(e.target.value)} />
          {found.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded border divide-y">
              {found.map((p) => (
                <button type="button" key={p.id} className="flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-accent"
                  onClick={() => { onChange({ ...value, itens: [...value.itens, { product_id: p.id, descricao: p.name, quantidade: "1" }] }); setTerm(""); }}>
                  <Plus className="h-3 w-3" />{p.name}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">O Faturamento recebe a tarefa de emitir a nota e o material entra na lista "Separar para a data".</p>
        </>
      )}
    </div>
  );
}

export interface CnpjTarget { kind: "cliente" | "lead"; id: string }
export type CnpjStatus = { ok: boolean; aviso?: string };

/** Asks for/validates the company CNPJ when the visit needs an invoice; saves it on the client/lead. */
export function CnpjGate({ target, onStatus }: { target: CnpjTarget | null; onStatus: (s: CnpjStatus) => void }) {
  const [cnpj, setCnpj] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<{ razao?: string | null; situacao?: string | null; erro?: string; aviso?: string } | null>(null);

  useEffect(() => {
    setInfo(null); setSaved(null); setCnpj("");
    if (!target) return;
    (async () => {
      const { data } = target.kind === "cliente"
        ? await supabase.from("clients").select("document, razao_social, cnpj_situacao").eq("id", target.id).maybeSingle()
        : await supabase.from("leads").select("cnpj, razao_social, cnpj_situacao").eq("id", target.id).maybeSingle();
      const doc = (data as any)?.document ?? (data as any)?.cnpj ?? "";
      setCnpj(formatCnpj(doc));
      if (cnpjValido(doc) && (data as any)?.cnpj_situacao !== "BLOQUEADO") {
        setSaved(doc); setInfo({ razao: (data as any)?.razao_social, situacao: (data as any)?.cnpj_situacao });
      }
    })();
  }, [target?.kind, target?.id]);

  useEffect(() => {
    const sit = (info?.situacao ?? "").toUpperCase();
    onStatus({ ok: !!saved && (!sit || sit === "ATIVA"), aviso: info?.aviso });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, info?.situacao, info?.aviso]);

  if (!target) return null;
  const consultar = async () => {
    if (!cnpjValido(cnpj)) { setInfo({ erro: "CNPJ inválido: confira os dígitos." }); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cnpj-consulta", { body: { cnpj } });
      const r: any = data ?? {};
      if (error && !r.indisponivel) { setInfo({ erro: r.error ?? "Não foi possível consultar o CNPJ." }); return; }
      const digits = cnpj.replace(/\D/g, "");
      const patch: Record<string, unknown> = r.indisponivel
        ? {} : { razao_social: r.razao_social ?? null, cnpj_situacao: r.situacao ?? null, cnpj_verificado_em: new Date().toISOString() };
      const table = target.kind === "cliente" ? "clients" : "leads";
      const { error: ue } = await (supabase as any).from(table).update({ ...(target.kind === "cliente" ? { document: digits } : { cnpj: digits }), ...patch }).eq("id", target.id);
      if (ue) { setInfo({ erro: "Não foi possível salvar o CNPJ no cadastro." }); return; }
      if (r.bloqueado) { setSaved(digits); setInfo({ razao: r.razao_social, situacao: r.situacao, erro: `CNPJ com situação ${r.situacao}: não é possível emitir nota.` }); return; }
      setSaved(digits);
      setInfo(r.indisponivel ? { aviso: "Receita indisponível agora: CNPJ salvo sem verificação." } : { razao: r.razao_social, situacao: r.situacao });
    } finally { setLoading(false); }
  };
  return (
    <div className="sm:col-span-2 space-y-2 rounded-md border p-3">
      <Label className="flex items-center gap-1"><FileText className="h-4 w-4" /> CNPJ da empresa (obrigatório para nota)</Label>
      <div className="flex gap-2">
        <Input aria-label="CNPJ" inputMode="numeric" placeholder="00.000.000/0000-00" value={cnpj}
          onChange={(e) => { setCnpj(formatCnpj(e.target.value)); setSaved(null); setInfo(null); }} />
        <Button type="button" variant="outline" onClick={consultar} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Consultar"}</Button>
      </div>
      {saved && !info?.erro && <p className="text-xs flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" />{info?.razao ?? "CNPJ válido"}{info?.situacao ? ` · ${info.situacao}` : ""}</p>}
      {info?.aviso && <p className="text-xs text-warning">{info.aviso}</p>}
      {info?.erro && <p className="text-xs text-destructive">{info.erro}</p>}
      {!saved && !info?.erro && <p className="text-xs text-muted-foreground">Digite e toque em Consultar para buscar razão social e situação na Receita.</p>}
    </div>
  );
}

/** Button that marks the visit's material as separated (consultant, stock or manager). */
export function MaterialSeparadoButton({ scheduleId, separado, onDone }: { scheduleId: string; separado: boolean; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  if (separado) return <Badge className="gap-1"><PackageCheck className="h-3 w-3" />Material separado</Badge>;
  return (
    <Button size="sm" variant="outline" className="min-h-9" disabled={busy} onClick={async () => {
      setBusy(true);
      const { baseAction } = await import("@/lib/base-instalada");
      try { await baseAction({ action: "material_separado", id: scheduleId }); onDone?.(); }
      catch (e) { const { toast } = await import("@/hooks/use-toast"); toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); }
      finally { setBusy(false); }
    }}><PackageCheck className="h-4 w-4 mr-1" />Material separado</Button>
  );
}
