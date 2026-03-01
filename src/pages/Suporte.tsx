import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, HelpCircle, MessageSquare, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

import { useSupportTickets, useDeleteSupportTicket, useInternalMessages, useCreateInternalMessage, type SupportTicket } from "@/hooks/use-support";
import TicketFormDialog from "@/components/suporte/TicketFormDialog";

const PRIORITY_VARIANT: Record<string, "destructive" | "default" | "secondary"> = {
  urgente: "destructive", alta: "destructive", media: "default", baixa: "secondary",
};
const STATUS_VARIANT: Record<string, "destructive" | "default" | "secondary"> = {
  aberto: "secondary", em_andamento: "default", resolvido: "default", fechado: "secondary",
};

export default function Suporte() {
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [viewTicket, setViewTicket] = useState<SupportTicket | null>(null);
  const [newMessage, setNewMessage] = useState("");

  const { data: tickets = [], isLoading } = useSupportTickets();
  const deleteTicket = useDeleteSupportTicket();
  const { data: messages = [] } = useInternalMessages(viewTicket?.id);
  const createMessage = useCreateInternalMessage();

  const s = search.toLowerCase();
  const filtered = tickets.filter((t) => [t.title, t.ticket_number, t.category].some((f) => f?.toLowerCase().includes(s)));

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !viewTicket) return;
    await createMessage.mutateAsync({ body: newMessage, ticket_id: viewTicket.id });
    setNewMessage("");
  };

  return (
    <AppLayout
      title="Suporte"
      subtitle="Tickets de suporte e mensagens internas"
      actions={<Button onClick={() => { setSelectedTicket(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo Ticket</Button>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tickets..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center space-y-2">
                <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p>{search ? "Nenhum ticket encontrado." : "Nenhum ticket cadastrado."}</p>
                {!search && <Button variant="outline" onClick={() => { setSelectedTicket(null); setDialogOpen(true); }}>Criar primeiro ticket</Button>}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Título</TableHead><TableHead>Categoria</TableHead><TableHead>Prioridade</TableHead><TableHead>Status</TableHead><TableHead>Data</TableHead><TableHead className="w-10" />
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setViewTicket(t)}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell><Badge variant="secondary">{t.category}</Badge></TableCell>
                      <TableCell><Badge variant={PRIORITY_VARIANT[t.priority] || "secondary"}>{t.priority}</Badge></TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[t.status] || "secondary"}>{t.status}</Badge></TableCell>
                      <TableCell>{new Date(t.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedTicket(t); setDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Messages panel */}
        <div className="rounded-lg border bg-card flex flex-col h-[600px]">
          {viewTicket ? (
            <>
              <div className="p-4 border-b">
                <h3 className="font-semibold truncate">{viewTicket.title}</h3>
                <div className="flex gap-2 mt-1">
                  <Badge variant={STATUS_VARIANT[viewTicket.status] || "secondary"}>{viewTicket.status}</Badge>
                  <Badge variant={PRIORITY_VARIANT[viewTicket.priority] || "secondary"}>{viewTicket.priority}</Badge>
                </div>
                {viewTicket.description && <p className="text-sm text-muted-foreground mt-2">{viewTicket.description}</p>}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center mt-8">Nenhuma mensagem ainda.</p>
                ) : messages.map((m) => (
                  <div key={m.id} className="rounded-lg bg-muted p-3">
                    <p className="text-sm">{m.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t flex gap-2">
                <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Escreva uma mensagem..." rows={1} className="min-h-[40px]" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}} />
                <Button size="icon" onClick={handleSendMessage} disabled={createMessage.isPending || !newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center space-y-2">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="text-sm">Selecione um ticket para ver mensagens</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <TicketFormDialog open={dialogOpen} onOpenChange={setDialogOpen} ticket={selectedTicket} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteTicket.mutate(deleteId); setDeleteId(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
