import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, Package, Upload, AlertTriangle, LayoutGrid, List } from "lucide-react";
import { Card } from "@/components/ui/card";

import { useProducts, useDeleteProduct, type Product } from "@/hooks/use-products";
import { usePermissions } from "@/hooks/use-permissions";
import ProductFormDialog from "@/components/produtos/ProductFormDialog";
import ImportProductsDialog from "@/components/produtos/ImportProductsDialog";

export default function Produtos() {
  const { data: products = [], isLoading } = useProducts();
  const deleteProduct = useDeleteProduct();
  const { isAdmin, role } = usePermissions();
  const canEditProducts = isAdmin || role === "gestor";
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = products.filter((p) =>
    [p.name, p.sku, p.category, p.brand].some((f) => f?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleEdit = (p: Product) => { setSelected(p); setDialogOpen(true); };
  const handleNew = () => { setSelected(null); setDialogOpen(true); };
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <AppLayout
      title="Produtos"
      subtitle="Catálogo de produtos"
      actions={canEditProducts ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-2" />Importar</Button>
          <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />Novo Produto</Button>
        </div>
      ) : undefined}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar produtos..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex border rounded-md">
            <Button variant={view === "table" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setView("table")}><List className="h-4 w-4" /></Button>
            <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setView("grid")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center space-y-2">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p>{search ? "Nenhum produto encontrado." : "Nenhum produto cadastrado."}</p>
              {!search && (
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={handleNew}>Adicionar produto</Button>
                  <Button variant="outline" onClick={() => setImportOpen(true)}>Importar planilha</Button>
                </div>
              )}
            </div>
          </div>
        ) : view === "table" ? (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead><TableHead>SKU</TableHead><TableHead>Categoria</TableHead>
                  <TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => handleEdit(p)}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.sku || "—"}</TableCell>
                    <TableCell>{p.category || "—"}</TableCell>
                    <TableCell className="font-medium">{fmt(p.price)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {p.stock} {p.unit}
                        {p.stock <= p.min_stock && p.min_stock > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canEditProducts && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(p)}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((p) => (
              <Card key={p.id} className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleEdit(p)}>
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                    </div>
                    <Badge variant={p.is_active ? "default" : "secondary"} className="text-xs">{p.is_active ? "Ativo" : "Inativo"}</Badge>
                  </div>
                  {p.category && <p className="text-xs text-muted-foreground">{p.category}</p>}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="font-semibold text-sm">{fmt(p.price)}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {p.stock} {p.unit}
                      {p.stock <= p.min_stock && p.min_stock > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ProductFormDialog open={dialogOpen} onOpenChange={setDialogOpen} product={selected} />
      <ImportProductsDialog open={importOpen} onOpenChange={setImportOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteProduct.mutate(deleteId); setDeleteId(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
