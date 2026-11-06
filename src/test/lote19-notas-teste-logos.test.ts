import { describe, expect, it } from "vitest";
import { TIPO_NOTA_LABEL, TAREFA_ACAO_LABEL } from "../../supabase/functions/_shared/prontidao";
import { itensDevolucaoRemessa, itensInstalacaoDefinitiva, precisaResultadoTeste } from "../../supabase/functions/_shared/teste-notas";
import { encaixarLogo, logosVisiveis, marcasSoInativas, parseLogos } from "../../supabase/functions/_shared/proposta-logos";

const ORG = "11111111-1111-1111-1111-111111111111";

describe("notas do teste (06/11)", () => {
  it("envio do teste é Simples Remessa (teste)", () => {
    expect(TIPO_NOTA_LABEL.remessa_teste).toBe("Simples Remessa (teste)");
  });
  it("visita de retorno de lead com aparelho em teste pergunta o resultado; a própria instalação não", () => {
    expect(precisaResultadoTeste({ lead_id: "l", client_id: null, operacao_material: null }, 1)).toBe(true);
    expect(precisaResultadoTeste({ lead_id: "l", client_id: null, operacao_material: "instalacao_teste" }, 1)).toBe(false);
    expect(precisaResultadoTeste({ lead_id: "l", client_id: "c" }, 1)).toBe(false);
    expect(precisaResultadoTeste({ lead_id: "l" }, 0)).toBe(false);
  });
  it("não aprovado: NF de Devolução de Simples Remessa só do equipamento", () => {
    expect(TAREFA_ACAO_LABEL.devolucao_remessa).toBe("NF de Devolução de Simples Remessa");
    const itens = itensDevolucaoRemessa([{ id: "c1", product_id: "p1", produto: "Dispenser Ekkoa", quantidade: "2" }]);
    expect(itens).toEqual([{ product_id: "p1", descricao: "Dispenser Ekkoa", quantidade: "2", comodato_id: "c1", local: null }]);
  });
  it("aceite: aparelho em teste não é levado de novo; consumo segue", () => {
    const itens = [
      { product_id: "disp", is_dispenser: true, comodato_id: null },
      { product_id: "disp", is_dispenser: true, comodato_id: null },
      { product_id: "refil", is_dispenser: false, comodato_id: null },
      { product_id: "x", is_dispenser: true, comodato_id: "c9" },
    ];
    const r = itensInstalacaoDefinitiva(itens, [{ id: "c1", product_id: "disp" }, { id: "c9", product_id: "x" }]);
    expect(r).toEqual([{ product_id: "disp", is_dispenser: true, comodato_id: null }, { product_id: "refil", is_dispenser: false, comodato_id: null }]);
  });
  it("aceite gera Baixar a Simples Remessa e Emitir NF de Comodato", () => {
    expect(TAREFA_ACAO_LABEL.baixar_remessa).toBe("Baixar a Simples Remessa");
    expect(TAREFA_ACAO_LABEL.emitir_comodato).toBe("Emitir NF de Comodato do aparelho");
  });
});

describe("logos na proposta", () => {
  const logos = parseLogos([
    { id: "a", path: `${ORG}/proposta/a.png`, marca: "Neve", grupo: "produtos", ordem: 1 },
    { id: "b", path: `${ORG}/proposta/b.png`, marca: "Suzano", grupo: "destaque", ordem: 2 },
    { id: "c", path: `${ORG}/proposta/c.png`, marca: "Diversey", grupo: "destaque", ordem: 1 },
    { id: "d", path: `${ORG}/proposta/d.png`, marca: "Multi Química", grupo: "parceiros", ordem: 1 },
    { id: "e", path: `${ORG}/proposta/e.png`, marca: "Ekkoa", grupo: "parceiros", ordem: 1 },
    { id: "x", path: `outra/proposta/x.png`, marca: "X", grupo: "destaque", ordem: 1 },
  ], ORG);
  it("rejeita caminho de outra organização", () => { expect(logos.map((l) => l.id)).not.toContain("x"); });
  it("ordem: Destaque, Parceiros, Marcas de produto; nunca Multi Química nem marca inativa", () => {
    expect(logosVisiveis(logos).map((l) => l.marca)).toEqual(["Diversey", "Suzano", "Ekkoa", "Neve"]);
    expect(logosVisiveis(logos, ["Neve"]).map((l) => l.marca)).toEqual(["Diversey", "Suzano", "Ekkoa"]);
  });
  it("marca só inativa no catálogo é inativa", () => {
    expect(marcasSoInativas([{ brand: "Neve", is_active: false }, { brand: "Scott", is_active: false }, { brand: "Scott", is_active: true }])).toEqual(["Neve"]);
  });
  it("logo pequeno não é ampliado além da largura nativa e mantém proporção", () => {
    const f = encaixarLogo(200, 100, 300, 60);
    expect(f.w).toBeLessThanOrEqual(150);
    expect(f.w / f.h).toBeCloseTo(2);
    const g = encaixarLogo(1200, 300, 150, 50);
    expect(g.w).toBeLessThanOrEqual(150); expect(g.h).toBeLessThanOrEqual(50); expect(g.w / g.h).toBeCloseTo(4);
  });
});
