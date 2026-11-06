import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useClients } from "@/hooks/use-clients";
import { useCreateProposal, useUpdateProposal, useProposalItems, useUpdateProposalItemPrice, type Proposal } from "@/hooks/use-proposals";
import { useAcceptProposalAndCreateOrder, useRejectProposal } from "@/hooks/use-proposal-automation";
import { AlertTriangle, CheckCircle2, ChevronDown, ShoppingCart } from "lucide-react";
import ProposalAcceptPanel from "@/components/comercial/ProposalAcceptPanel";
import ProposalPdfActions from "@/components/comercial/ProposalPdfActions";
import { statusBlocos, primeiroPendente, totalItem, BLOCOS, type BlocoId } from "@/lib/proposta-blocos";
import { cn } from "@/lib/utils";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; proposal?: Proposal | null }

const STATUS_OPTIONS = [
  { value: "rascunho", label: "Rascunho" }, { value: "enviada", label: "Enviada" }, { value: "aceita", label: "Aceita" },
  { value: "recusada", label: "Recusada" }, { value: "expirada", label: "Expirada" },
];
const TITULO: Record<BlocoId, string> = {
  cliente: "Cliente e contato", ambiente: "Solução por ambiente", produtos: "Produtos e preços", condicoes: "Condições", resumo: "Resumo e total",
};
const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Ponto = { id: string; local: string; aparelho: string | null; produto: string | null; quantidade: string | null };

function useResponsavel(p?: Proposal | null) {
  return useQuery({
    queryKey: ["proposta_responsavel", p?.id, p?.client_id, p?.lead_id],
    enabled: !!p && !!(p.client_id || p.lead_id),
    queryFn: async () => {
      const col = p!.client_id ? "client_id" : "lead_id";
      const { data } = await supabase.from("empresa_contatos").select("is_primary, pessoas(nome, telefone, email)")
        .eq(col, (p!.client_id || p!.lead_id)!).order("is_primary", { ascending: false }).limit(1);
      const pe = (data?.[0] as any)?.pessoas;
      if (pe?.nome) return { nome: pe.nome as string, contato: pe.telefone || pe.email || "" };
      if (p!.lead_id) {
        const { data: l } = await supabase.from("leads").select("contact_name, contact_phone, contact_email").eq("id", p!.lead_id).maybeSingle();
        if (l?.contact_name) return { nome: l.contact_name, contato: l.contact_phone || l.contact_email || "" };
      }
      return null;
    },
  });
}

function usePontos(proposalId: string | null, comodatoIds: string[]) {
  return useQuery({
    queryKey: ["proposta_pontos", proposalId, comodatoIds.join(",")],
    enabled: comodatoIds.length > 0,
    queryFn: async (): Promise<Ponto[]> => {
      const { data } = await supabase.from("comodatos")
        .select("id, localizacao_interna, aparelho_descricao, quantidade, refil:products!comodatos_refil_product_id_fkey(name), inv:products!comodatos_product_id_fkey(name)")
        .in("id", comodatoIds);
      return (data ?? []).map((c: any) => ({ id: c.id, local: c.localizacao_interna || "Ponto", aparelho: c.aparelho_descricao || c.inv?.name || null, produto: c.refil?.name || null, quantidade: c.quantidade }));
    },
  });
}

function Bloco({ id, aberto, pronto, onToggle, resumo, children }: { id: BlocoId; aberto: boolean; pronto: boolean; onToggle: () => void; resumo?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border", pronto ? "border-border" : "border-warning/60")}>
      <button type="button" onClick={onToggle} aria-expanded={aberto} className="flex w-full items-center gap-2 p-3 text-left">
        {pronto ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="pronto" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-label="pendente" />}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{TITULO[id]}</span>
          {resumo && !aberto && <span className="block truncate text-xs text-muted-foreground">{resumo}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && <div className="space-y-3 border-t p-3">{children}</div>}
    </section>
  );
}

export default function ProposalFormDialog({ open, onOpenChange, proposal }: Props) {
  const { data: clients = [] } = useClients();
  const createProposal = useCreateProposal();
  const updateProposal = useUpdateProposal();
  const acceptAndCreateOrder = useAcceptProposalAndCreateOrder();
  const rejectProposal = useRejectProposal();
  const setItem = useUpdateProposalItemPrice();
  const { data: itens = [] } = useProposalItems(proposal?.id ?? null);
  const { data: resp } = useResponsavel(proposal);
  const comIds = useMemo(() => itens.map((i) => i.comodato_id).filter(Boolean) as string[], [itens]);
  const { data: pontos = [] } = usePontos(proposal?.id ?? null, comIds);

  const vazio = { title: "", description: "", client_id: "", status: "rascunho", total_value: 0, discount_percent: 0, discount_value: 0, final_value: 0,
    valid_until: "", notes: "", forma_pagamento: "", prazo_entrega: "", periodicidade_manutencao: "" };
  const [form, setForm] = useState(vazio);

  useEffect(() => {
    if (proposal) {
      setForm({ title: proposal.title, description: proposal.description || "", client_id: proposal.client_id || "", status: proposal.status,
        total_value: proposal.total_value, discount_percent: proposal.discount_percent, discount_value: proposal.discount_value, final_value: proposal.final_value,
        valid_until: proposal.valid_until || "", notes: proposal.notes || "", forma_pagamento: proposal.forma_pagamento || "",
        prazo_entrega: proposal.prazo_entrega || "", periodicidade_manutencao: proposal.periodicidade_manutencao || "" });
    } else setForm(vazio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, open]);

  // Items drive the total when the proposal has items; otherwise the manual value is kept.
  const somaItens = itens.reduce((a, i) => a + Number(i.total_price ?? 0), 0);
  const total = itens.length ? somaItens : form.total_value;
  const desconto = total * (form.discount_percent / 100);
  const final = total - desconto;

  const isEdit = !!proposal;
  const st = statusBlocos({
    temEmpresa: !!(form.client_id || proposal?.lead_id),
    temResponsavel: !!resp || (!isEdit && !!form.client_id),
    pontos, itens,
  });

  const [aberto, setAberto] = useState<BlocoId | null>("cliente");
  const prev = useRef<Record<BlocoId, boolean> | null>(null);
  useEffect(() => { if (open) { setAberto(primeiroPendente(st.pronto) ?? "resumo"); prev.current = null; } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, proposal?.id]);
  // When the open block becomes ready, collapse it and open the next pending one.
  useEffect(() => {
    const p = prev.current; prev.current = st.pronto;
    if (p && aberto && !p[aberto] && st.pronto[aberto]) {
      const next = BLOCOS.slice(BLOCOS.indexOf(aberto) + 1).find((b) => !st.pronto[b]) ?? primeiroPendente(st.pronto);
      setAberto(next ?? null);
    }
  }, [st.pronto, aberto]);
  const toggle = (b: BlocoId) => setAberto((a) => (a === b ? null : b));

  const payload = () => ({ ...form, total_value: total, discount_value: desconto, final_value: final, client_id: form.client_id || null, valid_until: form.valid_until || null,
    forma_pagamento: form.forma_pagamento || null, prazo_entrega: form.prazo_entrega || null, periodicidade_manutencao: form.periodicidade_manutencao || null });
  const salvar = (fechar = true) => {
    if (proposal) return updateProposal.mutateAsync({ id: proposal.id, ...payload() }).then(() => { if (fechar) onOpenChange(false); });
    return createProposal.mutateAsync(payload()).then(() => onOpenChange(false));
  };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); salvar().catch(() => undefined); };
  const handleAccept = async () => { if (!proposal) return; await acceptAndCreateOrder.mutateAsync(proposal); onOpenChange(false); };
  const handleReject = async () => { if (!proposal) return; await rejectProposal.mutateAsync(proposal.id); onOpenChange(false); };

  const canAccept = isEdit && proposal.status === "enviada";
  const canReject = isEdit && (proposal.status === "enviada" || proposal.status === "rascunho");
  const isPending = createProposal.isPending || updateProposal.isPending || acceptAndCreateOrder.isPending || rejectProposal.isPending;
  const fechada = isEdit && ["recusada", "expirada"].includes(proposal.status);
  const empresa = proposal?.clients?.name || clients.find((c) => c.id === form.client_id)?.name
    || (proposal?.leads ? `${proposal.leads.empresa_nome || proposal.leads.company || proposal.leads.title} (lead)` : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl gap-3 pb-0 sm:pb-0">
        <DialogHeader>
          <DialogTitle>{proposal ? `Proposta${proposal.numero ? ` Nº ${String(proposal.numero).padStart(4, "0")}` : ""}` : "Nova Proposta"}</DialogTitle>
        </DialogHeader>

        {isEdit && proposal.status === "aceita" && (
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <ShoppingCart className="h-4 w-4" /><span>Proposta aceita.</span>
          </div>
        )}

        <form id="proposta-form" onSubmit={handleSubmit} className="min-w-0 space-y-3">
          <Bloco id="cliente" aberto={aberto === "cliente"} pronto={st.pronto.cliente} onToggle={() => toggle("cliente")}
            resumo={[empresa, resp?.nome].filter(Boolean).join(" · ")}>
            <div className="space-y-2"><Label>Título *</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            {proposal?.lead_id && !proposal.client_id
              ? <p className="text-sm"><span className="text-muted-foreground">Lead: </span>{empresa}</p>
              : <div className="space-y-2"><Label>Cliente</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select></div>}
            {isEdit && (resp
              ? <p className="text-sm"><span className="text-muted-foreground">Responsável: </span>{resp.nome}{resp.contato ? ` · ${resp.contato}` : ""}</p>
              : <p className="text-sm text-warning">Sem responsável: cadastre um contato na empresa (Leads/Clientes).</p>)}
          </Bloco>

          {isEdit && (
            <Bloco id="ambiente" aberto={aberto === "ambiente"} pronto={st.pronto.ambiente} onToggle={() => toggle("ambiente")}
              resumo={pontos.length ? `${pontos.length} ponto(s)` : "Sem pontos (seção omitida no PDF)"}>
              {pontos.length === 0 && <p className="text-sm text-muted-foreground">Sem pontos ligados à proposta.</p>}
              {pontos.map((p) => (
                <div key={p.id} className="rounded-md border p-2 text-sm">
                  <p className="font-medium">{p.local}</p>
                  <p className={cn(!p.aparelho && "text-warning")}>Aparelho: {p.aparelho || "faltando"}</p>
                  <p className={cn(!p.produto && "text-warning")}>Produto/refil: {p.produto || "faltando"}</p>
                  <p className="text-muted-foreground">Qtd: {p.quantidade || "1"}</p>
                </div>
              ))}
            </Bloco>
          )}

          {isEdit && (
            <Bloco id="produtos" aberto={aberto === "produtos"} pronto={st.pronto.produtos} onToggle={() => toggle("produtos")}
              resumo={itens.length ? `${itens.length} item(ns)${st.semPreco ? ` · ${st.semPreco} sem preço` : ""}` : "Sem itens"}>
              {itens.length === 0 && <p className="text-sm text-muted-foreground">Sem itens.</p>}
              {itens.map((i) => (
                <div key={i.id} className={cn("space-y-2 rounded-md border p-2", i.unit_price == null && "border-warning/60")}>
                  <p className="text-sm font-medium break-words">{i.description}</p>
                  <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
                    <div><Label className="text-xs">Qtd</Label><div className="flex h-9 items-center rounded-md border bg-muted px-2 text-sm">{Number(i.quantity)}</div></div>
                    <div><Label className="text-xs">Preço un.</Label>
                      <Input aria-label={`Preço ${i.description}`} type="number" inputMode="decimal" step="0.01" min="0" placeholder="Preço" disabled={fechada}
                        defaultValue={i.unit_price ?? ""} onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (i.unit_price ?? null)) setItem.mutate({ item: i, price: v }); }} /></div>
                    <div><Label className="text-xs">Desc. %</Label>
                      <Input aria-label={`Desconto ${i.description}`} type="number" inputMode="decimal" step="0.1" min="0" max="100" disabled={fechada}
                        defaultValue={Number(i.discount_percent ?? 0)} onBlur={(e) => { const d = Number(e.target.value || 0); if (d !== Number(i.discount_percent ?? 0)) setItem.mutate({ item: i, price: i.unit_price, discount: d }); }} /></div>
                  </div>
                  <p className="text-right text-sm">{i.unit_price == null ? <span className="text-warning">Falta preço</span> : fmt(totalItem(i.unit_price, Number(i.quantity), Number(i.discount_percent ?? 0)) ?? 0)}</p>
                </div>
              ))}
            </Bloco>
          )}

          <Bloco id="condicoes" aberto={aberto === "condicoes"} pronto={st.pronto.condicoes} onToggle={() => toggle("condicoes")}
            resumo="Em branco usa o padrão de Configurações">
            <div className="space-y-2"><Label>Validade</Label>
              <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              <p className="text-xs text-muted-foreground">Em branco: padrão de Configurações (10 dias).</p></div>
            <div className="space-y-2"><Label>Forma de pagamento</Label>
              <Input placeholder="Padrão de Configurações" value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} /></div>
            <div className="space-y-2"><Label>Prazo de entrega</Label>
              <Input placeholder="Padrão de Configurações" value={form.prazo_entrega} onChange={(e) => setForm({ ...form, prazo_entrega: e.target.value })} /></div>
            <div className="space-y-2"><Label>Manutenção dos aparelhos</Label>
              <Input placeholder="Padrão de Configurações" value={form.periodicidade_manutencao} onChange={(e) => setForm({ ...form, periodicidade_manutencao: e.target.value })} /></div>
          </Bloco>

          <Bloco id="resumo" aberto={aberto === "resumo"} pronto={st.pronto.resumo} onToggle={() => toggle("resumo")} resumo={fmt(final)}>
            {!itens.length && <div className="space-y-2"><Label>Valor total</Label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={form.total_value} onChange={(e) => setForm({ ...form, total_value: +e.target.value })} /></div>}
            <div className="space-y-2"><Label>Desconto geral (%)</Label>
              <Input type="number" inputMode="decimal" step="0.1" min="0" max="100" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: +e.target.value })} /></div>
            <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmt(total)}</span></div>
              <div className="flex justify-between"><span>Desconto</span><span>- {fmt(desconto)}</span></div>
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{fmt(final)}</span></div>
            </div>
            <div className="space-y-2"><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </Bloco>

          {isEdit && (
            <ProposalAcceptPanel proposal={proposal} onDone={() => onOpenChange(false)}
              onReject={canReject ? handleReject : undefined} onAcceptOrder={canAccept ? handleAccept : undefined} />
          )}
        </form>

        {/* Fixed footer with the main action of the moment */}
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
          {isEdit && !fechada && <ProposalPdfActions proposal={proposal} falta={st.falta} beforeGenerate={() => salvar(false)} />}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button type="submit" form="proposta-form" variant={isEdit ? "secondary" : "default"} disabled={isPending}>{proposal ? "Salvar" : "Criar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
