import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useProposalItems, useUpdateProposalItemPrice, type Proposal } from "@/hooks/use-proposals";
import { useConvertLeadToClient, MOTIVO_LABEL, type ConversionCandidate } from "@/hooks/use-lead-conversion";
import { CnpjGate, type CnpjStatus } from "@/components/agenda/MaterialPronto";
import ScheduleFormDialog from "@/components/ekkoa/ScheduleFormDialog";
import { FlaskConical, Truck } from "lucide-react";

type Tipo = "teste" | "definitiva";

/** Items of the proposal (price editable, blank = to fill) and the two "accepted" actions that open the existing booking flow. */
export default function ProposalAcceptPanel({ proposal, onDone }: { proposal: Proposal; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: itens = [] } = useProposalItems(proposal.id);
  const setPrice = useUpdateProposalItemPrice();
  const convert = useConvertLeadToClient();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [cnpj, setCnpj] = useState<CnpjStatus>({ ok: false });
  const [candidatos, setCandidatos] = useState<ConversionCandidate[] | null>(null);
  const [agendar, setAgendar] = useState<{ clientId: string; tipo: Tipo } | null>(null);
  const precisaConverter = !proposal.client_id && !!proposal.lead_id;
  const fechada = ["recusada", "expirada"].includes(proposal.status);

  const seguir = async (clientId: string, t: Tipo) => {
    await supabase.from("proposals").update({ status: "aceita", client_id: clientId }).eq("id", proposal.id);
    qc.invalidateQueries({ queryKey: ["proposals"] });
    setAgendar({ clientId, tipo: t });
  };
  const aceitar = async (t: Tipo, clienteExistente?: string) => {
    setTipo(t);
    if (!precisaConverter) { if (proposal.client_id) await seguir(proposal.client_id, t); else toast({ title: "Escolha o cliente da proposta antes", variant: "destructive" }); return; }
    if (!cnpj.ok && !clienteExistente) return; // CNPJ panel shows below
    const r = await convert.mutateAsync({ lead: { id: proposal.lead_id! }, clienteExistente });
    if (r.status === "duplicados") { setCandidatos(r.candidatos); return; }
    setCandidatos(null);
    await seguir(r.client_id, t);
  };

  return (
    <div className="space-y-3">
      <Label>Itens</Label>
      {itens.length === 0 && <p className="text-sm text-muted-foreground">Sem itens.</p>}
      <div className="space-y-2">
        {itens.map((i) => (
          <div key={i.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 min-w-0 truncate">{Number(i.quantity)}x {i.description}</span>
            <Input aria-label={`Preço ${i.description}`} className="w-28 h-8" type="number" step="0.01" min="0" placeholder="Preço"
              defaultValue={i.unit_price ?? ""} disabled={fechada}
              onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (i.unit_price ?? null)) setPrice.mutate({ item: i, price: v }); }} />
          </div>
        ))}
      </div>
      {itens.some((i) => i.unit_price == null) && <p className="text-xs text-warning">Itens sem preço: preencha antes de enviar ao cliente.</p>}

      {!fechada && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" size="sm" onClick={() => aceitar("teste")} disabled={convert.isPending}><FlaskConical className="h-4 w-4 mr-1" />Aceita — agendar instalação de teste</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => aceitar("definitiva")} disabled={convert.isPending}><Truck className="h-4 w-4 mr-1" />Aceita — venda direta (instalação definitiva)</Button>
        </div>
      )}
      {tipo && precisaConverter && !agendar && (
        <div className="space-y-2">
          <p className="text-sm">Ainda é lead: informe o CNPJ para virar cliente.</p>
          <CnpjGate target={{ kind: "lead", id: proposal.lead_id! }} onStatus={setCnpj} />
          <Button type="button" size="sm" disabled={!cnpj.ok || convert.isPending} onClick={() => aceitar(tipo)}>Converter em cliente e agendar</Button>
          {candidatos && (
            <div className="space-y-1 rounded-md border p-2">
              <p className="text-sm">Já existe cliente parecido. Usar um deles?</p>
              {candidatos.map((c) => (
                <Button key={c.id} type="button" size="sm" variant="outline" className="w-full justify-start" onClick={() => aceitar(tipo, c.id)}>
                  {c.name}{c.city ? ` · ${c.city}` : ""} ({MOTIVO_LABEL[c.motivo] ?? c.motivo})
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <ScheduleFormDialog open={!!agendar} onOpenChange={(o) => { if (!o) { setAgendar(null); onDone(); } }} defaultClientId={agendar?.clientId ?? null}
        preset={agendar ? { schedule_type: "visita_tecnica", schedule_subtype: "INSTALACAO", proposta_id: proposal.id,
          material: { operacao: agendar.tipo === "teste" ? "instalacao_teste" : "instalacao_definitiva", tipo_nota: "",
            itens: itens.map((i) => ({ product_id: i.product_id, descricao: i.description, quantidade: String(i.quantity) })) } } : null} />
    </div>
  );
}
