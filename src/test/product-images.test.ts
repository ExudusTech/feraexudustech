import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { planImageMatches, reactivationStatus, productImagePath, buildImagePreview, podeEnviarFotoCliente } from "@/lib/product-images";

const products = [
  { id: "1", sku: "NC-DIV-036", image_url: null, name: "A" },
  { id: "2", sku: "NC-SUZ-005", image_url: "org/NC-SUZ-005.jpg", name: "B" },
];
describe("bulk image matching", () => {
  it("matches file name without extension to SKU (case-insensitive)", () => {
    const plan = planImageMatches([{ name: "nc-div-036.JPG" }], products);
    expect(plan.novos.map((j) => j.product.id)).toEqual(["1"]);
  });
  it("existing image goes to substituir (needs confirmation), never novos", () => {
    const plan = planImageMatches([{ name: "NC-SUZ-005.jpg" }], products);
    expect(plan.novos).toEqual([]); expect(plan.substituir.map((j) => j.product.id)).toEqual(["2"]);
  });
  it("files without matching SKU are listed", () => {
    const plan = planImageMatches([{ name: "NC-EKK-999.jpg" }, { name: "NC-DIV-036.pdf" }], products);
    expect(plan.semSku.map((f) => f.name)).toEqual(["NC-EKK-999.jpg", "NC-DIV-036.pdf"]);
  });
  it("stores path under the organization folder", () => {
    expect(productImagePath("org1", "NC-DIV-036", "1", "jpeg")).toBe("org1/NC-DIV-036.jpg");
  });
});
describe("reactivation", () => {
  it("partner catalog item returns to sob_encomenda", () => {
    expect(reactivationStatus({ specifications: { origem: "catalogo_diversey_2026-09" } })).toBe("sob_encomenda");
  });
  it("own item returns to estoque", () => { expect(reactivationStatus({ specifications: {} })).toBe("estoque"); });
});

describe("bulk image preview", () => {
  const dims = (m: Record<string, [number, number]>) => (f: { name: string }) => m[f.name] ? { width: m[f.name][0], height: m[f.name][1] } : null;
  it("500 px on the longest side allows sending to client; smaller stays internal", () => {
    expect(podeEnviarFotoCliente(500, 300)).toBe(true);
    expect(podeEnviarFotoCliente(300, 500)).toBe(true);
    expect(podeEnviarFotoCliente(499, 499)).toBe(false);
  });
  it("cards carry product, size and warnings", () => {
    const items = buildImagePreview(
      [{ name: "NC-DIV-036.png" }, { name: "NC-SUZ-005.jpg" }, { name: "3833.png" }],
      products,
      dims({ "NC-DIV-036.png": [1200, 900], "NC-SUZ-005.jpg": [400, 300], "3833.png": [1000, 1000] }),
    );
    expect(items[0]).toMatchObject({ codigo: "NC-DIV-036", podeEnviar: true, warnings: [] });
    expect(items[0].product?.id).toBe("1");
    expect(items[1].warnings).toEqual(["ja_tem_imagem", "pequena"]);
    expect(items[1].podeEnviar).toBe(false);
    expect(items[2].warnings).toEqual(["nao_encontrado"]);
  });
  it("numeric SKU like 3833.png matches", () => {
    const items = buildImagePreview([{ name: "3833.png" }], [{ id: "9", sku: "3833", image_url: null, name: "X" }], dims({ "3833.png": [900, 900] }));
    expect(items[0].product?.id).toBe("9");
  });
  it("second file for the same product is flagged as repeated", () => {
    const items = buildImagePreview([{ name: "NC-DIV-036.png" }, { name: "nc-div-036.jpg" }], products, dims({ "NC-DIV-036.png": [900, 900], "nc-div-036.jpg": [900, 900] }));
    expect(items[1].warnings).toContain("repetido");
  });
});
