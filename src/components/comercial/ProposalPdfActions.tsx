import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useProposalItems, type Proposal } from "@/hooks/use-proposals";
import { FileDown, Mail, MessageCircle } from "lucide-react";

type Gerado = { url: string; numero: number; cliente: string; contato?: { email?: string | null; telefone?: string | null } };

const waNumber = (tel?: string | null) => { const d = (tel ?? "").replace(/\D/g, ""); return d.length >= 10 ? (d.startsWith("55") ? d : "55" + d) : ""; };

/** "Gerar PDF" (server-side, private file + signed link) and "Enviar ao cliente" via WhatsApp (wa.me) or e-mail (mailto). */
export default function ProposalPdfActions({ proposal, falta, beforeGenerate }: { proposal: Proposal; falta?: string; beforeGenerate?: () => Promise<void> }) {
  const qc = useQueryClient();
  const { data: itens = [] } = useProposalItems(proposal.id);
  const [gerado, setGerado] = useState<Gerado | null>(null);
  const [loading, setLoading] = useState(false);
  const semPreco = itens.filter((i) => i.unit_price == null).length;

  const gerar = async () => {
    setLoading(true);
    try { await beforeGenerate?.(); } catch { setLoading(false); return; }
    const { data, error } = await supabase.functions.invoke("proposta-pdf", { body: { proposal_id: proposal.id } });
    setLoading(false);
    if (error || !data?.url) {
      let msg = "Não foi possível gerar o PDF";
      try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep default */ }
      toast({ title: msg, variant: "destructive" }); return;
    }
    setGerado(data); qc.invalidateQueries({ queryKey: ["proposals"] });
    toast({ title: "PDF gerado" });
  };
  const msg = gerado ? `Olá! Segue a proposta comercial Nº ${gerado.numero} da NitsClean para ${gerado.cliente}: ${gerado.url}` : "";
  const wa = gerado ? `https://wa.me/${waNumber(gerado.contato?.telefone)}?text=${encodeURIComponent(msg)}` : "";
  const mail = gerado ? `mailto:${gerado.contato?.email ?? ""}?subject=${encodeURIComponent(`Proposta comercial Nº ${gerado.numero} — NitsClean`)}&body=${encodeURIComponent(msg)}` : "";

  const bloqueio = falta || (semPreco > 0 ? `Falta: preço de ${semPreco} ${semPreco === 1 ? "item" : "itens"}` : "");
  // Footer bar: the main action of the moment — "Gerar PDF" until generated, then "Enviar ao cliente".
  return (
    <div className="space-y-2">
      {!gerado ? (
        <Button type="button" className="w-full" onClick={gerar} disabled={loading || !!bloqueio}>
          <FileDown className="h-4 w-4 mr-1" />{loading ? "Gerando…" : bloqueio || "Gerar PDF"}
        </Button>
      ) : (
        <>
          <Button type="button" className="w-full" asChild><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />Enviar ao cliente</a></Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="outline" asChild><a href={gerado.url} target="_blank" rel="noreferrer">Abrir PDF</a></Button>
            <Button type="button" size="sm" variant="outline" asChild><a href={mail}><Mail className="h-4 w-4 mr-1" />E-mail</a></Button>
          </div>
        </>
      )}
    </div>
  );
}
