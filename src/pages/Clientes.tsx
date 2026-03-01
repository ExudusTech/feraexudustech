import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import ClientFormDialog from "@/components/crm/ClientFormDialog";
import ClientVisitFormDialog from "@/components/crm/ClientVisitFormDialog";
import { useClients, useDeleteClient, type Client } from "@/hooks/use-clients";
import { useClientVisits, useDeleteClientVisit, type ClientVisit } from "@/hooks/use-client-visits";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, Users, CalendarCheck } from "lucide-react";

export default function Clientes() {
  const { data: clients = [], isLoading } = useClients();
  const { data: visits = [], isLoading: visitsLoading } = useClientVisits();
  const deleteClient = useDeleteClient();
  const deleteVisit = useDeleteClientVisit();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("clientes");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<ClientVisit | null>(null);
  const [deleteId, setDeleteId] = useState<{ type: string; id: string } | null>(null);

  const s = search.toLowerCase();
  const filtered = clients.filter((c) =>
    [c.name, c.email, c.phone, c.company].some((f) => f?.toLowerCase().includes(s))
  );
  const filteredVisits = visits.filter((v) =>
    [v.subject, v.visit_type, v.outcome].some((f) => f?.toLowerCase().includes(s))
  );

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  const handleNew = () => {
    if (tab === "visitas") {
      setSelectedVisit(null);
      setVisitDialogOpen(true);
    } else {
      setSelectedClient(null);
      setDialogOpen(true);
    }
  };

  return (
    <AppLayout
      title="Clientes"
      subtitle="Gerencie sua base de clientes e visitas"
      actions={<Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />{tab === "visitas" ? "Nova Visita" : "Novo Cliente"}</Button>}
    >
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSearch(""); }} className="space-y-4">
        <TabsList>
          <TabsTrigger value="clientes" className="gap-2"><Users className="h-4 w-4" />Clientes</TabsTrigger>
          <TabsTrigger value="visitas" className="gap-2"><CalendarCheck className="h-4 w-4" />Visitas</TabsTrigger>
        </TabsList>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <TabsContent value="clientes">
          {isLoading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center space-y-2">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p>{search ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}</p>
                {!search && <Button variant="outline" onClick={handleNew}>Adicionar primeiro cliente</Button>}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Telefone</TableHead>
                    <TableHead>Empresa</TableHead><TableHead>Cidade</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => { setSelectedClient(c); setDialogOpen(true); }}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                      <TableCell>{c.phone || "—"}</TableCell>
                      <TableCell>{c.company || "—"}</TableCell>
                      <TableCell>{c.city ? `${c.city}/${c.state}` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "active" ? "default" : "secondary"}>
                          {c.status === "active" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedClient(c); setDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId({ type: "client", id: c.id })}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="visitas">
          {visitsLoading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filteredVisits.length === 0 && visits.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center space-y-2">
                <CalendarCheck className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p>Nenhuma visita registrada.</p>
                <Button variant="outline" onClick={handleNew}>Registrar primeira visita</Button>
              </div>
            </div>
          ) : filteredVisits.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground"><p>Nenhum resultado encontrado.</p></div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead><TableHead>Data</TableHead><TableHead>Tipo</TableHead>
                    <TableHead>Assunto</TableHead><TableHead>Resultado</TableHead><TableHead>Próxima</TableHead><TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVisits.map((v) => (
                    <TableRow key={v.id} className="cursor-pointer" onClick={() => { setSelectedVisit(v); setVisitDialogOpen(true); }}>
                      <TableCell className="font-medium">{clientName(v.client_id)}</TableCell>
                      <TableCell>{new Date(v.visit_date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell><Badge variant="secondary">{v.visit_type}</Badge></TableCell>
                      <TableCell>{v.subject || "—"}</TableCell>
                      <TableCell>{v.outcome || "—"}</TableCell>
                      <TableCell>{v.next_visit_date ? new Date(v.next_visit_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedVisit(v); setVisitDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId({ type: "visit", id: v.id })}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClientFormDialog open={dialogOpen} onOpenChange={setDialogOpen} client={selectedClient} />
      <ClientVisitFormDialog open={visitDialogOpen} onOpenChange={setVisitDialogOpen} visit={selectedVisit} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteId?.type === "client") deleteClient.mutate(deleteId.id);
              else if (deleteId?.type === "visit") deleteVisit.mutate(deleteId.id);
              setDeleteId(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
