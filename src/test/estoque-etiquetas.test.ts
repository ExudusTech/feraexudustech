import { describe, expect, it } from "vitest";
import { acoesEtiqueta, faixaErro, formatEtiqueta, layoutEtiquetas, numeroEmLote, parseEtiqueta, proximoInicio, usoDoLote, waLink, waNumero, WHATSAPP_PADRAO } from "../../supabase/functions/_shared/etiquetas";
import { ajusteErro, contagemBase, deltaAjuste, disponivel, emAlerta, reservasEstoque } from "../../supabase/functions/_shared/estoque";
import { planoEstoqueDemo } from "../../supabase/functions/_shared/demo-cenario";
import { DEFAULT_PROPOSTA_CONFIG } from "@/lib/proposta-config";
import { mergePermissions, routeAllowed } from "@/lib/permissions";

describe("etiqueta numerada: número e URL", () => {
  it("lê o número do QR (URL /q/) ou digitado, sempre com 6 dígitos", () => {
    expect(parseEtiqueta("https://fera.exudustech.com.br/q/000123")).toBe(123);
    expect(parseEtiqueta("000045")).toBe(45);
    expect(parseEtiqueta(" 1234 ")).toBe(1234);
    expect(formatEtiqueta(123)).toBe("000123");
  });
  it("recusa o que não é etiqueta", () => {
    expect(parseEtiqueta("0")).toBeNull();
    expect(parseEtiqueta("1234567")).toBeNull();
    expect(parseEtiqueta("https://exemplo.com/abc")).toBeNull();
    expect(parseEtiqueta("")).toBeNull();
  });
});

describe("QR público → WhatsApp da Flora", () => {
  it("usa o WhatsApp da proposta em PDF com 55 na frente", () => {
    expect(waNumero("(22) 99266-8769")).toBe("5522992668769");
    expect(WHATSAPP_PADRAO).toBe(DEFAULT_PROPOSTA_CONFIG.whatsapp);
  });
  it("monta o link do WhatsApp com o texto codificado", () => {
    expect(waLink("5522992668769", "Olá!")).toBe("https://wa.me/5522992668769?text=Ol%C3%A1!");
  });
});

describe("lotes de etiquetas (o Fera controla a numeração)", () => {
  it("só aceita número de lote liberado (ou da faixa de demonstração)", () => {
    const lotes = [{ inicio: 1, fim: 500 }];
    expect(numeroEmLote(320, lotes)).toBe(true);
    expect(numeroEmLote(501, lotes)).toBe(false);
    expect(numeroEmLote(900003, [])).toBe(true);
  });
  it("mostra usados × disponíveis por lote", () => {
    expect(usoDoLote({ inicio: 1, fim: 500 }, [3, 7, 501, 900001])).toEqual({ total: 500, usados: 2, disponiveis: 498 });
  });
});

describe("PDF de etiquetas para gráfica", () => {
  it("5×3 cm cabe 3×9 = 27 por folha A4 com margem de corte", () => {
    expect(layoutEtiquetas(50, 30)).toMatchObject({ colunas: 3, linhas: 9, porPagina: 27 });
  });
  it("faixa já gerada não se repete e há limite por vez", () => {
    const ja = [{ inicio: 1, fim: 1000 }];
    expect(faixaErro(500, 1500, ja)).toBe("Faixa já gerada: 000001 a 001000");
    expect(faixaErro(1001, 2000, ja)).toBeNull();
    expect(faixaErro(1, 2001, [])).toBe("Gere no máximo 2000 etiquetas por vez");
    expect(proximoInicio([...ja, { inicio: 900001, fim: 900050 }])).toBe(1001);
  });
});

describe("escanear dentro da ocorrência aberta", () => {
  it("número livre na instalação: instalar e ativar", () => {
    expect(acoesEtiqueta("instalacao_teste", null).acoes[0]).toBe("instalar");
  });
  it("aparelho ativo deste cliente na manutenção: avaliar, trocar de ponto, substituir, retirar", () => {
    expect(acoesEtiqueta(null, { status: "ATIVO", deste_local: true }).acoes).toEqual(["avaliar", "trocar_ponto", "substituir", "retirar"]);
    expect(acoesEtiqueta("substituicao", { status: "ATIVO", deste_local: true }).acoes[0]).toBe("substituir");
  });
  it("aparelho em teste não é retirado pelo QR (a nota de devolução devolve ao estoque)", () => {
    const r = acoesEtiqueta(null, { status: "EM_TESTE", deste_local: true });
    expect(r.acoes).not.toContain("retirar");
    expect(r.aviso).toMatch(/não aprovado/);
  });
  it("etiqueta de outro cliente é recusada; aparelho de volta ao estoque pode ser reinstalado", () => {
    expect(acoesEtiqueta(null, { status: "ATIVO", deste_local: false }).acoes).toEqual([]);
    expect(acoesEtiqueta("instalacao_definitiva", { status: "ENCERRADO", deste_local: false }).acoes).toEqual(["instalar"]);
    expect(acoesEtiqueta("instalacao_teste", { status: "SEPARADO", deste_local: true }).acoes).toEqual(["instalar"]);
  });
});

describe("estoque de aparelhos", () => {
  const disp = new Set(["d1", "d2"]);
  const visitas = [
    { id: "s1", status: "agendado", scheduled_date: "2026-11-11", operacao_material: "instalacao_teste", itens: [{ product_id: "d1", quantidade: "2" }, { product_id: "refil", quantidade: "4" }] },
    { id: "s0", status: "agendado", scheduled_date: "2026-11-09", operacao_material: "instalacao_teste", itens: [{ product_id: "d1", quantidade: "5" }] },
    { id: "s2", status: "em_atendimento", scheduled_date: "2026-11-10", operacao_material: "instalacao_definitiva", itens: [{ product_id: "d2", quantidade: "3" }] },
  ];
  const aparelhos = [
    { id: "a1", product_id: "d1", status: "SEPARADO", etiqueta_numero: 900005, ocorrencia_schedule_id: "s1" },
    { id: "a2", product_id: "d2", status: "ATIVO", quantidade: "1", ocorrencia_schedule_id: "s2" },
  ];
  const ordens = [
    { id: "o1", status: "agendada", item_product_id: "d2", quantidade: "1", schedule_id: "s2" },
    { id: "o2", status: "em_andamento", item_product_id: "d2", quantidade: "1", schedule_id: null },
    { id: "o3", status: "em_andamento", item_product_id: "d2", quantidade: "1", resolvida_schedule_id: "x" },
  ];
  const r = reservasEstoque({ hoje: "2026-11-10", visitas, ordens, aparelhos, dispensers: disp });
  it("reserva os aparelhos das ocorrências futuras; o separado faz parte da reserva", () => {
    expect(r.get("d1")?.reservados).toBe(2);
    expect(r.get("d1")?.separados).toEqual([900005]);
    expect(r.has("refil")).toBe(false);
  });
  it("aparelho já instalado na ocorrência sai da reserva, sem contar duas vezes a substituição da mesma ocorrência", () => {
    // s2: 3 − 1 instalado = 2; o1 é da mesma ocorrência (não soma); o2 soma 1; o3 já resolvida.
    expect(r.get("d2")?.reservados).toBe(3);
  });
  it("disponível = estoque − reservados; alerta ≤ mínimo, e com mínimo 0 só se negativo", () => {
    expect(disponivel(3, 2)).toBe(1);
    expect(emAlerta(2, 2)).toBe(true);
    expect(emAlerta(3, 2)).toBe(false);
    expect(emAlerta(0, 0)).toBe(false);
    expect(emAlerta(-1, 0)).toBe(true);
  });
  it("em teste e instalados contam aparelhos", () => {
    const c = contagemBase([{ id: "1", product_id: "d1", status: "EM_TESTE", quantidade: "1" }, { id: "2", product_id: "d1", status: "ATIVO", quantidade: "2" }, { id: "3", product_id: "d1", status: "SEPARADO" }]);
    expect(c.get("d1")).toEqual({ em_teste: 1, instalados: 2 });
  });
  it("ajuste: entrada soma, saída subtrai, contagem define o saldo; motivo obrigatório", () => {
    expect(deltaAjuste("entrada", 5, 2)).toBe(5);
    expect(deltaAjuste("saida", 3, 2)).toBe(-3);
    expect(deltaAjuste("contagem", 7, 2)).toBe(5);
    expect(ajusteErro("entrada", 0, "compra")).toBe("Quantidade inválida");
    expect(ajusteErro("contagem", 0, "contagem mensal")).toBeNull();
    expect(ajusteErro("saida", 1, "")).toBe("Informe o motivo do ajuste");
  });
  it("demo: no máximo 8 aparelhos, alguns abaixo do mínimo", () => {
    const p = planoEstoqueDemo(["a", "a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    expect(p).toHaveLength(8);
    expect(new Set(p.map((x) => x.product_id)).size).toBe(8);
    expect(p.filter((x) => x.stock <= x.min_stock).length).toBeGreaterThanOrEqual(2);
  });
});

describe("tela do aparelho", () => {
  it("abre para a equipe, não para visitante", () => {
    for (const r of ["vendedor", "consultor_tecnico", "operacional", "gestor", "faturamento"]) expect(routeAllowed(mergePermissions([r]), "/aparelho/000123")).toBe(true);
    expect(routeAllowed(mergePermissions(["visitante"]), "/aparelho/000123")).toBe(false);
  });
});

describe("PDF de etiquetas (geração)", () => {
  it("30 etiquetas 5×3 cm saem em 2 folhas A4", async () => {
    const { gerarPdfEtiquetas } = await import("@/lib/etiquetas-pdf");
    const blob = await gerarPdfEtiquetas({ inicio: 1, fim: 30, largura: 50, altura: 30, marca: "NitsClean" });
    const txt = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blob); });
    expect((txt.match(/\/Type \/Page\b/g) ?? []).length).toBe(2);
  }, 30_000);
});
