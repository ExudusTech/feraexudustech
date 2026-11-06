import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useProposalItems, type Proposal } from "@/hooks/use-proposals";
import { useConvertLeadToClient, MOTIVO_LABEL, type ConversionCandidate } from "@/hooks/use-lead-conversion";
import { CnpjGate, type CnpjStatus } from "@/components/agenda/MaterialPronto";
import ScheduleFormDialog from "@/components/ekkoa/ScheduleFormDialog";
import { FlaskConical, Truck, ChevronDown, ShoppingCart, XCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Tipo = "teste" | "definitiva";

/** "Resultado da proposta" menu: test installation, accepted (convert), order, reject — opening the existing booking flow that open the existing booking flow. */
export default function ProposalAcceptPanel({ proposal, onDone, onReject, onAcceptOrder }: { proposal: Proposal; onDone: () => void; onReject?: () => void; onAcceptOrder?: () => void }) {
  const qc = useQueryClient();
  const { data: itens = [] } = useProposalItems(proposal.id);
  const convert = useConvertLeadToClient();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [cnpj, setCnpj] = useState<CnpjStatus>({ ok: false });
  const [candidatos, setCandidatos] = useState<ConversionCandidate[] | null>(null);
  const [agendar, setAgendar] = useState<{ clientId: string | null; leadId: string | null; tipo: Tipo } | null>(null);
  const precisaConverter = !proposal.client_id && !!proposal.lead_id;
  const preset = useMemo(() => agendar ? { schedule_type: "visita_tecnica", schedule_subtype: "INSTALACAO", proposta_id: proposal.id,
    material: { operacao: (agendar.tipo === "teste" ? "instalacao_teste" : "instalacao_definitiva") as "instalacao_teste" | "instalacao_definitiva", tipo_nota: "" as const,
      itens: itens.map((i) => ({ product_id: i.product_id, descricao: i.description, quantidade: String(i.quantity) })) } } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendar?.clientId, agendar?.leadId, agendar?.tipo, proposal.id]);
  const fechada = ["recusada", "expirada"].includes(proposal.status);

  const seguir = async (clientId: string, t: Tipo) => {
    await supabase.from("proposals").update({ status: "aceita", client_id: clientId }).eq("id", proposal.id);
    qc.invalidateQueries({ queryKey: ["proposals"] });
    setAgendar({ clientId, leadId: null, tipo: t });
  };
  // Test installation never converts: the booking stays on the lead (CNPJ on the lead for the shipping note).
  const agendarTeste = () => {
    setTipo("teste");
    if (proposal.client_id) { setAgendar({ clientId: proposal.client_id, leadId: null, tipo: "teste" }); return; }
    if (!proposal.lead_id) { toast({ title: "Escolha o cliente da proposta antes", variant: "destructive" }); return; }
    if (!cnpj.ok) return; // CNPJ panel shows below
    setAgendar({ clientId: null, leadId: proposal.lead_id, tipo: "teste" });
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
      {!fechada && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between" disabled={convert.isPending}>Resultado da proposta <ChevronDown className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(92vw,22rem)]">
            <DropdownMenuItem onClick={agendarTeste}><FlaskConical className="h-4 w-4 mr-2" />Agendar instalação de teste</DropdownMenuItem>
            <DropdownMenuItem onClick={() => aceitar("definitiva")}><Truck className="h-4 w-4 mr-2" />Proposta aceita — virar cliente</DropdownMenuItem>
            {onAcceptOrder && <DropdownMenuItem onClick={onAcceptOrder}><ShoppingCart className="h-4 w-4 mr-2" />Aceitar e gerar pedido</DropdownMenuItem>}
            {onReject && <DropdownMenuItem className="text-destructive" onClick={onReject}><XCircle className="h-4 w-4 mr-2" />Rejeitar</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {tipo && precisaConverter && !agendar && (
        <div className="space-y-2">
          <p className="text-sm">{tipo === "teste" ? "Informe o CNPJ para a nota de remessa (continua lead)." : "Ainda é lead: informe o CNPJ para virar cliente."}</p>
          <CnpjGate target={{ kind: "lead", id: proposal.lead_id! }} onStatus={setCnpj} />
          {tipo === "teste"
            ? <Button type="button" size="sm" disabled={!cnpj.ok} onClick={agendarTeste}>Agendar instalação de teste</Button>
            : <Button type="button" size="sm" disabled={!cnpj.ok || convert.isPending} onClick={() => aceitar(tipo)}>Converter em cliente e agendar</Button>}
          {candidatos && tipo !== "teste" && (
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

      <ScheduleFormDialog open={!!agendar} onOpenChange={(o) => { if (!o) { setAgendar(null); onDone(); } }} defaultClientId={agendar?.clientId ?? null} defaultLeadId={agendar?.leadId ?? null}
        preset={preset} />
    </div>
  );
}
