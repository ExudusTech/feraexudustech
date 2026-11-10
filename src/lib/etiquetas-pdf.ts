import QRCode from "qrcode";
import { etiquetaUrl, formatEtiqueta, layoutEtiquetas } from "@/lib/etiquetas";

/** Print-shop PDF: A4 sheets of w×h mm labels (QR + big number + brand + "Fale com a Flora") with crop marks. Vector QR, no images. */
export async function gerarPdfEtiquetas(o: { inicio: number; fim: number; largura: number; altura: number; marca: string; onProgresso?: (p: number) => void }): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const { colunas, linhas, porPagina, x0, y0 } = layoutEtiquetas(o.largura, o.altura);
  const total = o.fim - o.inicio + 1;
  const pad = Math.max(1.5, o.altura * 0.07);
  const qr = o.altura - 2 * pad;
  const marcaCorte = (pagina: number) => {
    doc.setDrawColor("#000000"); doc.setLineWidth(0.2);
    const x1 = x0 + colunas * o.largura, y1 = y0 + linhas * o.altura;
    for (let i = 0; i <= colunas; i++) { const x = x0 + i * o.largura; doc.line(x, y0 - 6, x, y0 - 2); doc.line(x, y1 + 2, x, y1 + 6); }
    for (let j = 0; j <= linhas; j++) { const y = y0 + j * o.altura; doc.line(x0 - 6, y, x0 - 2, y); doc.line(x1 + 2, y, x1 + 6, y); }
    doc.setFontSize(6); doc.setTextColor("#787878");
    doc.text(`Etiquetas ${formatEtiqueta(o.inicio)}–${formatEtiqueta(o.fim)} · ${o.largura}×${o.altura} mm · folha ${pagina}`, x0, y1 + 9);
    doc.setTextColor("#000000");
  };
  for (let k = 0; k < total; k++) {
    const pos = k % porPagina;
    if (pos === 0) { if (k > 0) doc.addPage(); marcaCorte(Math.floor(k / porPagina) + 1); if (k > 0) { o.onProgresso?.(k / total); await new Promise((r) => setTimeout(r, 0)); } }
    const n = o.inicio + k;
    const x = x0 + (pos % colunas) * o.largura, y = y0 + Math.floor(pos / colunas) * o.altura;
    // QR (merged horizontal runs of dark modules).
    const m = QRCode.create(etiquetaUrl(n), { errorCorrectionLevel: "M" }).modules;
    const ms = qr / (m.size + 2);
    doc.setFillColor("#000000");
    for (let r = 0; r < m.size; r++) {
      let c = 0;
      while (c < m.size) {
        if (!m.data[r * m.size + c]) { c++; continue; }
        const ini = c; while (c < m.size && m.data[r * m.size + c]) c++;
        doc.rect(x + pad + (ini + 1) * ms, y + pad + (r + 1) * ms, (c - ini) * ms + 0.01, ms + 0.01, "F");
      }
    }
    // Text block to the right of the QR.
    const tx = x + pad + qr + pad, tw = o.largura - (tx - x) - pad;
    doc.setFont("helvetica", "bold"); doc.setFontSize(Math.max(6, o.altura * 0.28));
    doc.text(o.marca, tx, y + pad + o.altura * 0.2, { maxWidth: tw });
    doc.setFontSize(Math.min(o.altura * 0.9, tw / 1.2));
    doc.text(formatEtiqueta(n), tx, y + o.altura * 0.66, { maxWidth: tw });
    doc.setFont("helvetica", "normal"); doc.setFontSize(Math.max(5, o.altura * 0.22));
    doc.text("Fale com a Flora", tx, y + o.altura - pad - 0.5, { maxWidth: tw });
  }
  o.onProgresso?.(1);
  return doc.output("blob");
}
