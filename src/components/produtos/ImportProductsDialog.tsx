import { useState, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import { useImportProducts, useProducts, type ImportProductInput } from "@/hooks/use-products";
import ExcelJS from "exceljs";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldKey =
  | "name" | "sku" | "category" | "brand" | "fornecedor" | "unit"
  | "price" | "cost" | "stock" | "min_stock" | "description";

interface ParsedRow extends Partial<Record<FieldKey, any>> {
  name: string;
  sku: string;
  valid: boolean;
  error?: string;
  action: "insert" | "update" | "skip";
}

const COLUMN_MAP: Record<string, FieldKey> = {
  nome: "name", name: "name", produto: "name", "nome do produto": "name", descricao_produto: "name",
  sku: "sku", código: "sku", codigo: "sku", cod: "sku", "cod.": "sku",
  "codigo do produto": "sku", "código do produto": "sku", "codigo produto": "sku", "código produto": "sku",
  referencia: "sku", referência: "sku",
  categoria: "category", category: "category", grupo: "category",
  marca: "brand", brand: "brand", fabricante: "brand",
  fornecedor: "fornecedor", supplier: "fornecedor", "fornecedor/parceiro": "fornecedor",
  unidade: "unit", unit: "unit", un: "unit", "unid": "unit", "unid.": "unit",
  preço: "price", preco: "price", price: "price", "preço venda": "price", "preco venda": "price",
  "preço de venda": "price", valor: "price",
  custo: "cost", cost: "cost", "preço custo": "cost", "preco custo": "cost", "custo unitário": "cost",
  estoque: "stock", stock: "stock", quantidade: "stock", qtd: "stock",
  "estoque mínimo": "min_stock", "estoque minimo": "min_stock", min_stock: "min_stock", "qtd mínima": "min_stock",
  descrição: "description", descricao: "description", description: "description", observação: "description",
};

const NUMERIC: FieldKey[] = ["price", "cost", "stock", "min_stock"];

function normalizeHeader(h: string) {
  return h.toLowerCase().trim().replace(/\s+/g, " ");
}

function cellToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const v = value as any;
    if (typeof v.text === "string") return v.text.trim();
    if (typeof v.result !== "undefined") return String(v.result).trim();
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join("").trim();
    if (typeof v.hyperlink === "string") return String(v.text ?? v.hyperlink).trim();
    return "";
  }
  // Códigos numéricos do Excel precisam virar texto sem notação científica
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  return String(value).trim();
}

function parseNumber(value: unknown): number | null {
  const txt = cellToText(value).replace(/[^\d,.-]/g, "");
  if (!txt) return null;
  const normalized = txt.includes(",") ? txt.replace(/\./g, "").replace(",", ".") : txt;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export default function ImportProductsDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [detected, setDetected] = useState<FieldKey[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importProducts = useImportProducts();
  const { data: products = [] } = useProducts();

  const existingSkus = useMemo(
    () => new Set(products.filter((p) => p.sku).map((p) => String(p.sku).trim())),
    [products]
  );

  const reset = () => {
    setRows([]); setDetected([]); setFileName(""); setFileError(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileError(null);
    setParsing(true);
    setRows([]);
    setDetected([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();

      if (file.name.toLowerCase().endsWith(".csv")) {
        await workbook.csv.read(new Blob([buffer]).stream() as any);
      } else {
        await workbook.xlsx.load(buffer);
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount < 2) {
        setFileError("A planilha está vazia ou não possui linhas de dados.");
        setParsing(false);
        return;
      }

      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = cellToText(cell.value);
      });

      // Mapeia SOMENTE as colunas presentes no arquivo
      const colMap: Record<number, FieldKey> = {};
      headers.forEach((h, i) => {
        const key = COLUMN_MAP[normalizeHeader(h)];
        if (key && !Object.values(colMap).includes(key)) colMap[i] = key;
      });
      const present = Object.values(colMap);

      if (!present.includes("name") || !present.includes("sku")) {
        const faltando = [
          !present.includes("name") ? "Produto/Nome" : null,
          !present.includes("sku") ? "Código/SKU" : null,
        ].filter(Boolean).join(" e ");
        setFileError(
          `Coluna obrigatória não encontrada: ${faltando}. Cabeçalhos lidos: ${headers.filter(Boolean).join(", ") || "nenhum"}.`
        );
        setParsing(false);
        return;
      }

      const parsed: ParsedRow[] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const item: any = {};
        Object.entries(colMap).forEach(([idx, key]) => {
          const raw = row.getCell(Number(idx) + 1).value;
          if (NUMERIC.includes(key)) {
            const n = parseNumber(raw);
            if (n != null) item[key] = key === "stock" || key === "min_stock" ? Math.round(n) : n;
          } else {
            const txt = cellToText(raw);
            if (txt) item[key] = txt;
          }
        });

        const name = item.name ?? "";
        const sku = item.sku ?? "";
        if (!name && !sku) return; // linha totalmente vazia

        let error: string | undefined;
        if (!name) error = "Nome do produto obrigatório";
        else if (!sku) error = "Código (SKU) obrigatório";

        const valid = !error;
        parsed.push({
          ...item,
          name,
          sku,
          valid,
          error,
          action: !valid ? "skip" : existingSkus.has(sku) ? "update" : "insert",
        });
      });

      // SKUs duplicados dentro do próprio arquivo
      const seen = new Set<string>();
      parsed.forEach((r) => {
        if (!r.valid) return;
        if (seen.has(r.sku)) { r.valid = false; r.action = "skip"; r.error = "Código duplicado na planilha"; }
        else seen.add(r.sku);
      });

      if (parsed.length === 0) setFileError("Nenhuma linha de dados encontrada na planilha.");

      setDetected(present);
      setRows(parsed);
    } catch (err) {
      setFileError("Não foi possível ler o arquivo. Verifique se é um .xlsx, .xls ou .csv válido.");
      setRows([]);
    }
    setParsing(false);
  };

  const validRows = rows.filter((r) => r.valid);
  const inserts = validRows.filter((r) => r.action === "insert").length;
  const updates = validRows.filter((r) => r.action === "update").length;
  const invalid = rows.length - validRows.length;

  const FIELD_LABELS: Record<FieldKey, string> = {
    name: "Produto", sku: "Código (SKU)", category: "Categoria", brand: "Marca",
    fornecedor: "Fornecedor", unit: "Unidade", price: "Preço", cost: "Custo",
    stock: "Estoque", min_stock: "Estoque mínimo", description: "Descrição",
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    const items: ImportProductInput[] = validRows.map((r) => ({
      name: r.name,
      sku: r.sku,
      category: r.category ?? null,
      brand: r.brand ?? null,
      fornecedor: r.fornecedor ?? null,
      description: r.description ?? null,
      unit: r.unit ?? null,
      price: r.price ?? null,
      cost: r.cost ?? null,
      stock: r.stock ?? null,
      min_stock: r.min_stock ?? null,
    }));
    await importProducts.mutateAsync({ items, fileName });
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Produtos</DialogTitle>
          <DialogDescription>
            Obrigatórias apenas duas colunas: <strong>Produto (nome)</strong> e <strong>Código (SKU)</strong>.
            As demais são opcionais e o sistema considera somente as colunas presentes no seu arquivo:
            Fornecedor, Categoria, Marca, Unidade, Preço, Custo, Estoque, Estoque Mínimo e Descrição.
            Produtos com código já cadastrado são atualizados; os campos ausentes na planilha são preservados.
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
                {!fileError && (
                  <p className="text-xs text-muted-foreground">
                    {rows.length} linhas · {inserts} novos · {updates} atualizações
                    {invalid > 0 ? ` · ${invalid} ignoradas` : ""}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">Clique para selecionar arquivo</p>
                <p className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</p>
              </div>
            )}
          </div>

          {fileError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {detected.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Colunas identificadas na planilha:</p>
              <div className="flex flex-wrap gap-1.5">
                {detected.map((f) => (
                  <Badge key={f} variant="secondary" className="text-xs">{FIELD_LABELS[f]}</Badge>
                ))}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded-lg border max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    {detected.includes("fornecedor") && <TableHead>Fornecedor</TableHead>}
                    {detected.includes("category") && <TableHead>Categoria</TableHead>}
                    {detected.includes("brand") && <TableHead>Marca</TableHead>}
                    {detected.includes("price") && <TableHead>Preço</TableHead>}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i} className={!r.valid ? "bg-destructive/5" : ""}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                      <TableCell className="font-medium">{r.name || "—"}</TableCell>
                      {detected.includes("fornecedor") && <TableCell className="text-xs text-muted-foreground">{r.fornecedor || "—"}</TableCell>}
                      {detected.includes("category") && <TableCell>{r.category || "—"}</TableCell>}
                      {detected.includes("brand") && <TableCell>{r.brand || "—"}</TableCell>}
                      {detected.includes("price") && <TableCell>{r.price != null ? `R$ ${r.price.toFixed(2)}` : "—"}</TableCell>}
                      <TableCell>
                        {r.valid ? (
                          <Badge variant={r.action === "insert" ? "default" : "secondary"}>
                            {r.action === "insert" ? "Novo" : "Atualizar"}
                          </Badge>
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

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {validRows.length > 0 ? `${inserts} novos · ${updates} atualizações` : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleImport} disabled={validRows.length === 0 || importProducts.isPending}>
                {importProducts.isPending ? "Importando..." : `Importar ${validRows.length} produtos`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
