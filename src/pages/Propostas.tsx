import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, FileText, ShoppingCart } from "lucide-react";

import { useProposals, useDeleteProposal, type Proposal } from "@/hooks/use-proposals";
import { useOrders, useDeleteOrder, type Order } from "@/hooks/use-orders";
import ProposalFormDialog from "@/components/comercial/ProposalFormDialog";
import OrderFormDialog from "@/components/comercial/OrderFormDialog";

const PROPOSAL_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  enviada: { label: "Enviada", variant: "outline" },
  aceita: { label: "Aceita", variant: "default" },
  recusada: { label: "Recusada", variant: "destructive" },
  expirada: { label: "Expirada", variant: "secondary" },
};

const ORDER_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  confirmado: { label: "Confirmado", variant: "outline" },
  em_producao: { label: "Em Produção", variant: "outline" },
  enviado: { label: "Enviado", variant: "default" },
  entregue: { label: "Entregue", variant: "default" },
  cancelado: { label: "Cancelado", variant: "destructive" },
};

const PAYMENT_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  parcial: { label: "Parcial", variant: "outline" },
  pago: { label: "Pago", variant: "default" },
};

export default function Propostas() {
  const { data: proposals = [], isLoading: loadingP } = useProposals();
  const deleteProposal = useDeleteProposal();
  const { data: orders = [], isLoading: loadingO } = useOrders();
  const deleteOrder = useDeleteOrder();

  const [searchP, setSearchP] = useState("");
  const [searchO, setSearchO] = useState("");
  const [propDialogOpen, setPropDialogOpen] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedProp, setSelectedProp] = useState<Proposal | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "proposal" | "order"; id: string } | null>(null);

  const filteredP = proposals.filter((p) =>
    [p.title, p.clients?.name].some((f) => f?.toLowerCase().includes(searchP.toLowerCase()))
  );
  const filteredO = orders.filter((o) =>
    [o.order_number, o.clients?.name].some((f) => f?.toLowerCase().includes(searchO.toLowerCase()))
  );

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "proposal") deleteProposal.mutate(deleteTarget.id);
    else deleteOrder.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <AppLayout title="Comercial" subtitle="Propostas e Pedidos">
      <Tabs defaultValue="propostas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="propostas" className="gap-2"><FileText className="h-4 w-4" />Propostas</TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-2"><ShoppingCart className="h-4 w-4" />Pedidos</TabsTrigger>
        </TabsList>

        {/* PROPOSTAS TAB */}
        <TabsContent value="propostas" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar propostas..." className="pl-9" value={searchP} onChange={(e) => setSearchP(e.target.value)} />
            </div>
            <Button onClick={() => { setSelectedProp(null); setPropDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova Proposta</Button>
          </div>

          {loadingP ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filteredP.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center space-y-2">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p>{searchP ? "Nenhuma proposta encontrada." : "Nenhuma proposta cadastrada."}</p>
                {!searchP && <Button variant="outline" onClick={() => { setSelectedProp(null); setPropDialogOpen(true); }}>Criar primeira proposta</Button>}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead><TableHead>Cliente</TableHead><TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead><TableHead>Validade</TableHead><TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredP.map((p) => {
                    const st = PROPOSAL_STATUS[p.status] || { label: p.status, variant: "secondary" as const };
                    return (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => { setSelectedProp(p); setPropDialogOpen(true); }}>
                        <TableCell className="font-medium">{p.title}</TableCell>
                        <TableCell className="text-muted-foreground">{p.clients?.name || "—"}</TableCell>
                        <TableCell className="font-medium">{fmt(p.final_value)}</TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(p.valid_until)}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelectedProp(p); setPropDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ type: "proposal", id: p.id })}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* PEDIDOS TAB */}
        <TabsContent value="pedidos" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar pedidos..." className="pl-9" value={searchO} onChange={(e) => setSearchO(e.target.value)} />
            </div>
            <Button onClick={() => { setSelectedOrder(null); setOrderDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo Pedido</Button>
          </div>

          {loadingO ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filteredO.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center space-y-2">
                <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p>{searchO ? "Nenhum pedido encontrado." : "Nenhum pedido cadastrado."}</p>
                {!searchO && <Button variant="outline" onClick={() => { setSelectedOrder(null); setOrderDialogOpen(true); }}>Criar primeiro pedido</Button>}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead><TableHead>Pagamento</TableHead><TableHead>Entrega</TableHead><TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredO.map((o) => {
                    const st = ORDER_STATUS[o.status] || { label: o.status, variant: "secondary" as const };
                    const ps = PAYMENT_STATUS[o.payment_status || "pendente"] || { label: o.payment_status, variant: "secondary" as const };
                    return (
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => { setSelectedOrder(o); setOrderDialogOpen(true); }}>
                        <TableCell className="font-medium">{o.order_number || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{o.clients?.name || "—"}</TableCell>
                        <TableCell className="font-medium">{fmt(o.total_value)}</TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell><Badge variant={ps.variant}>{ps.label}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(o.delivery_date)}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelectedOrder(o); setOrderDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ type: "order", id: o.id })}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ProposalFormDialog open={propDialogOpen} onOpenChange={setPropDialogOpen} proposal={selectedProp} />
      <OrderFormDialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen} order={selectedOrder} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.type === "proposal" ? "proposta" : "pedido"}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
