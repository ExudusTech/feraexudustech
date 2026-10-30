import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { planImageMatches, reactivationStatus, productImagePath } from "@/lib/product-images";

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
