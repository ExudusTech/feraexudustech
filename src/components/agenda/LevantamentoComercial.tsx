import { useEffect, useMemo, useState } from "react";
import { ClipboardList, ChevronDown, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PROBLEMAS, SEGMENTOS, porteLabel, sugerirMix, type Levantamento, type SugestaoMix } from "@/lib/prontidao";

interface Props { scheduleId: string; clientId?: string | null; leadId?: string | null; initial?: Levantamento | null; onMix?: (mix: SugestaoMix[]) => void }

const n = (v: string) => (v === "" ? null : Math.max(0, Math.min(99999, Number(v.replace(/\D/g, "")) || 0)));

/** Short company survey at the start of a commercial visit; saved on the visit and on the company for the next visit. */
export default function LevantamentoComercial({ scheduleId, clientId, leadId, initial, onMix }: Props) {
  const [open, setOpen] = useState(!initial);
  const [l, setL] = useState<Levantamento>(initial ?? {});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!initial && (clientId || leadId)) (async () => {
    const { data } = clientId ? await (supabase as any).from("clients").select("levantamento").eq("id", clientId).maybeSingle()
      : await (supabase as any).from("leads").select("levantamento").eq("id", leadId).maybeSingle();
    if (data?.levantamento) setL(data.levantamento);
  })(); }, [clientId, leadId, initial]);
  const mix = useMemo(() => sugerirMix(l), [l]);
  useEffect(() => { onMix?.(mix); }, [mix, onMix]);
  const set = <K extends keyof Levantamento>(k: K, v: Levantamento[K]) => setL((p) => ({ ...p, [k]: v }));

  const salvar = async () => {
    setSaving(true);
    const { error } = await (supabase as any).from("schedules").update({ levantamento: l }).eq("id", scheduleId);
    if (clientId) await (supabase as any).from("clients").update({ levantamento: l }).eq("id", clientId);
    else if (leadId) await (supabase as any).from("leads").update({ levantamento: l }).eq("id", leadId);
    setSaving(false);
    if (error) toast({ title: "Não foi possível salvar o levantamento", variant: "destructive" });
    else { toast({ title: "Levantamento salvo" }); setOpen(false); }
  };

  return (
    <section id="visita-levantamento" className="rounded-lg border p-3 space-y-3 scroll-mt-4">
      <button type="button" className="flex w-full items-center gap-2 font-semibold text-sm" onClick={() => setOpen((o) => !o)}>
        <ClipboardList className="h-4 w-4" />Levantamento da empresa{l.segmento ? ` · ${l.segmento}` : ""}
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><Label className="text-xs">Segmento</Label>
            <Select value={l.segmento ?? ""} onValueChange={(v) => set("segmento", v)}><SelectTrigger aria-label="Segmento"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{SEGMENTOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">{porteLabel(l.segmento)}</Label><Input inputMode="numeric" value={l.porte ?? ""} onChange={(e) => set("porte", n(e.target.value))} /></div>
          <div><Label className="text-xs">Fluxo de pessoas/dia</Label>
            <Select value={l.fluxo ?? ""} onValueChange={(v) => set("fluxo", v as any)}><SelectTrigger aria-label="Fluxo"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="baixo">Baixo</SelectItem><SelectItem value="medio">Médio</SelectItem><SelectItem value="alto">Alto</SelectItem></SelectContent></Select></div>
          <div className="col-span-2"><Label className="text-xs">Banheiros (feminino / masculino / PNE)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input aria-label="Banheiros femininos" inputMode="numeric" value={l.banheiros_f ?? ""} onChange={(e) => set("banheiros_f", n(e.target.value))} />
              <Input aria-label="Banheiros masculinos" inputMode="numeric" value={l.banheiros_m ?? ""} onChange={(e) => set("banheiros_m", n(e.target.value))} />
              <Input aria-label="Banheiros PNE" inputMode="numeric" value={l.banheiros_pne ?? ""} onChange={(e) => set("banheiros_pne", n(e.target.value))} />
            </div></div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><Checkbox checked={!!l.cozinha} onCheckedChange={(v) => set("cozinha", !!v)} />Tem cozinha</label>
          <div className="col-span-2"><Label className="text-xs">Problema principal</Label>
            <Select value={l.problema ?? ""} onValueChange={(v) => set("problema", v)}><SelectTrigger aria-label="Problema principal"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{PROBLEMAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Produtos que usa hoje</Label><Input maxLength={200} value={l.produtos_atuais ?? ""} onChange={(e) => set("produtos_atuais", e.target.value)} /></div>
          <div><Label className="text-xs">Compra de quem</Label><Input maxLength={100} value={l.fornecedor ?? ""} onChange={(e) => set("fornecedor", e.target.value)} /></div>
          <div className="col-span-2"><Label className="text-xs">Quem decide</Label><Input maxLength={100} value={l.decisor ?? ""} onChange={(e) => set("decisor", e.target.value)} placeholder="Nome e cargo" /></div>
          <Button type="button" className="col-span-2" variant="outline" disabled={saving} onClick={salvar}>Salvar levantamento</Button>
        </div>
      )}
      {mix.length > 0 && (l.segmento || l.problema) && (
        <div className="rounded-md bg-muted/40 p-2 text-sm space-y-1">
          <p className="font-medium flex items-center gap-1"><Lightbulb className="h-4 w-4" />Sugestão de mix</p>
          {mix.map((m) => <p key={m.linha}><strong>{m.linha}</strong> <span className="text-muted-foreground">— {m.motivo}</span></p>)}
        </div>
      )}
    </section>
  );
}
