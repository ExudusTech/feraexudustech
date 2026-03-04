import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import { useCreateProductsBatch, type Product } from "@/hooks/use-products";
import ExcelJS from "exceljs";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  name: string;
  sku?: string;
  category?: string;
  brand?: string;
  unit?: string;
  price?: number;
  cost?: number;
  stock?: number;
  min_stock?: number;
  description?: string;
  valid: boolean;
  error?: string;
}

const COLUMN_MAP: Record<string, keyof Omit<ParsedRow, "valid" | "error">> = {
  nome: "name", name: "name", produto: "name",
  sku: "sku", código: "sku", codigo: "sku", cod: "sku",
  categoria: "category", category: "category",
  marca: "brand", brand: "brand",
  unidade: "unit", unit: "unit", un: "unit",
  preço: "price", preco: "price", price: "price", "preço venda": "price", valor: "price",
  custo: "cost", cost: "cost", "preço custo": "cost",
  estoque: "stock", stock: "stock", quantidade: "stock", qtd: "stock",
  "estoque mínimo": "min_stock", "estoque minimo": "min_stock", min_stock: "min_stock",
  descrição: "description", descricao: "description", description: "description",
};

function mapColumns(headers: string[]): Record<number, keyof Omit<ParsedRow, "valid" | "error">> {
  const map: Record<number, keyof Omit<ParsedRow, "valid" | "error">> = {};
  headers.forEach((h, i) => {
    const key = h.toLowerCase().trim();
    if (COLUMN_MAP[key]) map[i] = COLUMN_MAP[key];
  });
  return map;
}

export default function ImportProductsDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const batchCreate = useCreateProductsBatch();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();

      if (file.name.endsWith(".csv")) {
        await workbook.csv.load(buffer);
      } else {
        await workbook.xlsx.load(buffer);
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount < 2) { setRows([]); setParsing(false); return; }

      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? "");
      });

      const colMap = mapColumns(headers);

      const parsed: ParsedRow[] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const item: any = {};
        Object.entries(colMap).forEach(([idx, key]) => {
          const cell = row.getCell(Number(idx) + 1);
          const val = cell.value;
          if (["price", "cost"].includes(key)) item[key] = parseFloat(String(val)) || 0;
          else if (["stock", "min_stock"].includes(key)) item[key] = parseInt(String(val)) || 0;
          else item[key] = val != null ? String(val).trim() : undefined;
        });

        const valid = !!item.name;
        parsed.push({ ...item, valid, error: valid ? undefined : "Nome obrigatório" } as ParsedRow);
      });

      setRows(parsed);
    } catch {
      setRows([]);
    }
    setParsing(false);
  };

  const validRows = rows.filter((r) => r.valid);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    await batchCreate.mutateAsync(validRows.map(({ valid, error, ...r }) => r as Partial<Product>));
    onOpenChange(false);
    setRows([]);
    setFileName("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setRows([]); setFileName(""); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Produtos</DialogTitle>
          <DialogDescription>
            Envie um arquivo Excel (.xlsx, .xls) ou CSV com as colunas: Nome, SKU, Categoria, Marca, Unidade, Preço, Custo, Estoque, Estoque Mínimo, Descrição.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            {parsing ? (
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
            ) : fileName ? (
              <div className="space-y-2">
                <FileSpreadsheet className="h-8 w-8 mx-auto text-primary" />
                <p className="text-sm font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">{rows.length} linhas · {validRows.length} válidas</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">Clique para selecionar arquivo</p>
                <p className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</p>
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg border max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Estoque</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i} className={!r.valid ? "bg-destructive/5" : ""}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.name || "—"}</TableCell>
                      <TableCell>{r.sku || "—"}</TableCell>
                      <TableCell>{r.category || "—"}</TableCell>
                      <TableCell>{r.price != null ? `R$ ${r.price.toFixed(2)}` : "—"}</TableCell>
                      <TableCell>{r.stock ?? "—"}</TableCell>
                      <TableCell>
                        {r.valid ? (
                          <Badge variant="default">OK</Badge>
                        ) : (
                          <div className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-xs">{r.error}</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 50 && <p className="text-xs text-muted-foreground text-center py-2">Mostrando 50 de {rows.length} linhas</p>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={validRows.length === 0 || batchCreate.isPending}>
              {batchCreate.isPending ? "Importando..." : `Importar ${validRows.length} produtos`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
