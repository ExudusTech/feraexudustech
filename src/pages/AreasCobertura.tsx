import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import EkkoaCoverageAreaFormDialog from "@/components/ekkoa/EkkoaCoverageAreaFormDialog";
import { useEkkoaCoverageAreas, useDeleteEkkoaCoverageArea, type EkkoaCoverageArea } from "@/hooks/use-ekkoa-coverage-areas";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, MapPin } from "lucide-react";

function formatTime(t: string | null) {
  if (!t) return "";
  return t.slice(0, 5).replace(":", "h");
}

export default function AreasCobertura() {
  const { data: areas = [], isLoading } = useEkkoaCoverageAreas();
  const deleteArea = useDeleteEkkoaCoverageArea();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<EkkoaCoverageArea | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const s = search.toLowerCase();
  const filtered = areas.filter((a) => [a.name, a.city, a.state, a.dia_semana].some((f) => f?.toLowerCase().includes(s)));

  return (
    <AppLayout
      title="Áreas de Cobertura"
      subtitle="Gestão de áreas de cobertura geográfica"
      actions={<Button onClick={() => { setSelected(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova Área</Button>}
    >
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar áreas..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center space-y-2">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p>{search ? "Nenhuma área encontrada." : "Nenhuma área cadastrada."}</p>
              {!search && <Button variant="outline" onClick={() => { setSelected(null); setDialogOpen(true); }}>Adicionar primeira área</Button>}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Dia da Semana</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>CEP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const horario = a.horario_inicio && a.horario_fim
                    ? `entre ${formatTime(a.horario_inicio)} e ${formatTime(a.horario_fim)}`
                    : "—";
                  return (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => { setSelected(a); setDialogOpen(true); }}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.dia_semana || "—"}</TableCell>
                      <TableCell>{horario}</TableCell>
                      <TableCell>{a.state || "—"}</TableCell>
                      <TableCell>{a.zip_code_start ? `${a.zip_code_start}${a.zip_code_end ? ` - ${a.zip_code_end}` : ""}` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Ativo" : "Inativo"}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelected(a); setDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
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
      </div>

      <EkkoaCoverageAreaFormDialog open={dialogOpen} onOpenChange={setDialogOpen} area={selected} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir área?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteArea.mutate(deleteId); setDeleteId(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
