import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import ClientFormDialog from "@/components/crm/ClientFormDialog";
import { useClients, useDeleteClient, type Client } from "@/hooks/use-clients";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, Users } from "lucide-react";

export default function Clientes() {
  const { data: clients = [], isLoading } = useClients();
  const deleteClient = useDeleteClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = clients.filter((c) =>
    [c.name, c.email, c.phone, c.company].some((f) => f?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleEdit = (c: Client) => { setSelectedClient(c); setDialogOpen(true); };
  const handleNew = () => { setSelectedClient(null); setDialogOpen(true); };

  return (
    <AppLayout
      title="Clientes"
      subtitle="Gerencie sua base de clientes"
      actions={<Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>}
    >
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar clientes..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
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
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => handleEdit(c)}>
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
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(c)}>
                            <Pencil className="h-4 w-4 mr-2" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(c.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />Excluir
                          </DropdownMenuItem>
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

      <ClientFormDialog open={dialogOpen} onOpenChange={setDialogOpen} client={selectedClient} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteClient.mutate(deleteId); setDeleteId(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
