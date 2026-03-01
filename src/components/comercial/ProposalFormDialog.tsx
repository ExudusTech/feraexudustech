import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useClients } from "@/hooks/use-clients";
import { useCreateProposal, useUpdateProposal, type Proposal } from "@/hooks/use-proposals";
import { useAcceptProposalAndCreateOrder, useRejectProposal } from "@/hooks/use-proposal-automation";
import { CheckCircle, XCircle, ShoppingCart } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal?: Proposal | null;
}

const STATUS_OPTIONS = [
  { value: "rascunho", label: "Rascunho" },
  { value: "enviada", label: "Enviada" },
  { value: "aceita", label: "Aceita" },
  { value: "recusada", label: "Recusada" },
  { value: "expirada", label: "Expirada" },
];

export default function ProposalFormDialog({ open, onOpenChange, proposal }: Props) {
  const { data: clients = [] } = useClients();
  const createProposal = useCreateProposal();
  const updateProposal = useUpdateProposal();
  const acceptAndCreateOrder = useAcceptProposalAndCreateOrder();
  const rejectProposal = useRejectProposal();

  const [form, setForm] = useState({
    title: "", description: "", client_id: "", status: "rascunho",
    total_value: 0, discount_percent: 0, discount_value: 0, final_value: 0,
    valid_until: "", notes: "",
  });

  useEffect(() => {
    if (proposal) {
      setForm({
        title: proposal.title, description: proposal.description || "",
        client_id: proposal.client_id || "", status: proposal.status,
        total_value: proposal.total_value, discount_percent: proposal.discount_percent,
        discount_value: proposal.discount_value, final_value: proposal.final_value,
        valid_until: proposal.valid_until || "", notes: proposal.notes || "",
      });
    } else {
      setForm({ title: "", description: "", client_id: "", status: "rascunho", total_value: 0, discount_percent: 0, discount_value: 0, final_value: 0, valid_until: "", notes: "" });
    }
  }, [proposal, open]);

  useEffect(() => {
    const disc = form.total_value * (form.discount_percent / 100);
    setForm((f) => ({ ...f, discount_value: disc, final_value: f.total_value - disc }));
  }, [form.total_value, form.discount_percent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, client_id: form.client_id || null, valid_until: form.valid_until || null };
    if (proposal) {
      updateProposal.mutate({ id: proposal.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      createProposal.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const handleAccept = async () => {
    if (!proposal) return;
    await acceptAndCreateOrder.mutateAsync(proposal);
    onOpenChange(false);
  };

  const handleReject = async () => {
    if (!proposal) return;
    await rejectProposal.mutateAsync(proposal.id);
    onOpenChange(false);
  };

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const isEdit = !!proposal;
  const canAccept = isEdit && proposal.status === "enviada";
  const canReject = isEdit && (proposal.status === "enviada" || proposal.status === "rascunho");
  const isPending = createProposal.isPending || updateProposal.isPending || acceptAndCreateOrder.isPending || rejectProposal.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{proposal ? "Editar Proposta" : "Nova Proposta"}</DialogTitle>
        </DialogHeader>

        {/* Workflow Actions */}
        {isEdit && (canAccept || canReject) && (
          <>
          <div className="flex flex-wrap gap-2">
              {canAccept && (
                <Button type="button" size="sm" onClick={handleAccept} disabled={isPending}>
                  <CheckCircle className="h-4 w-4 mr-1" />Aceitar & Gerar Pedido
                </Button>
              )}
              {canReject && (
                <Button type="button" size="sm" variant="destructive" onClick={handleReject} disabled={isPending}>
                  <XCircle className="h-4 w-4 mr-1" />Rejeitar
                </Button>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Show linked order info */}
        {isEdit && proposal.status === "aceita" && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-muted-foreground text-sm">
            <ShoppingCart className="h-4 w-4" />
            <span>Proposta aceita — pedido gerado automaticamente.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Valor Total</Label>
              <Input type="number" step="0.01" min="0" value={form.total_value} onChange={(e) => setForm({ ...form, total_value: +e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Desconto (%)</Label>
              <Input type="number" step="0.1" min="0" max="100" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: +e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Valor Final</Label>
              <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm font-medium">{fmt(form.final_value)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Validade</Label>
              <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {proposal ? "Salvar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
