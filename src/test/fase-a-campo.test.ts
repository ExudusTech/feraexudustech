import { describe, expect, it } from "vitest";
import {
  aparelhosCompativeis,
  escolherProduto,
  familiasDoProduto,
  limparRascunho,
  produtosCompativeis,
  RASCUNHO_JSON_SCHEMA,
  rotuloProduto,
  type ProdutoCompat,
} from "../../supabase/functions/_shared/coleta";
import { isAtrasada, ordenarHoje, porConsultor } from "@/lib/hoje";
import { acoesEtiqueta, avisoEtiquetaSubstituida, MOTIVOS_TROCA_ETIQUETA } from "../../supabase/functions/_shared/etiquetas";

describe("Fase A — 1) Aparelho duplicado na escolha (por ID + código/SKU)", () => {
  const catalogo: ProdutoCompat[] = [
    { id: "d1", name: "DISP MOD TOA ROLO HANDS FREE BR/PR", codigo_fabricante: "28125816", brand: "Kimberly", is_dispenser: true, dispenser_family_id: "fam-a" },
    { id: "d2", name: "DISP MOD TOA ROLO HANDS FREE BR/PR", codigo_fabricante: "30224734", brand: "Kimberly", is_dispenser: true, dispenser_family_id: "fam-b" },
    { id: "d3", name: "DISP MOD TOA ROLO HANDS FREE BR/PR", sku: "SKU-999", is_dispenser: true, dispenser_family_id: "fam-a" },
    { id: "r1", name: "Toalha Rolo 200m", is_dispenser: false, compatible_dispenser_families: ["fam-a"] },
    { id: "r2", name: "Toalha Rolo 250m", is_dispenser: false, compatible_dispenser_families: ["fam-b"] },
  ];

  it("diferencia produtos de mesmo nome usando código de fábrica ou SKU", () => {
    expect(rotuloProduto(catalogo[0])).toBe("DISP MOD TOA ROLO HANDS FREE BR/PR (28125816 · Kimberly)");
    expect(rotuloProduto(catalogo[1])).toBe("DISP MOD TOA ROLO HANDS FREE BR/PR (30224734 · Kimberly)");
    expect(rotuloProduto(catalogo[2])).toBe("DISP MOD TOA ROLO HANDS FREE BR/PR (SKU-999)");
  });

  it("resolve produtos compatíveis pelo aparelho_id mesmo com nomes repetidos", () => {
    expect(produtosCompativeis(catalogo, catalogo[0].name, "d1").map((p) => p.id)).toEqual(["r1"]);
    expect(produtosCompativeis(catalogo, catalogo[1].name, "d2").map((p) => p.id)).toEqual(["r2"]);
  });

  it("preserva aparelho_id e produto_id no rascunho e mantém compatibilidade com rascunhos antigos sem id", () => {
    const novo = limparRascunho({ pontos: [{ local: "Banheiro", aparelho: "DISP MOD TOA", aparelho_id: "d2", produto: "Toalha Rolo 250m", produto_id: "r2", quantidade: "2" }] });
    expect(novo.pontos?.[0].aparelho_id).toBe("d2");
    expect(novo.pontos?.[0].produto_id).toBe("r2");

    const antigo = limparRascunho({ pontos: [{ local: "Banheiro", aparelho: "DISP MOD TOA", produto: "Toalha Rolo 200m", quantidade: "1" }] });
    expect(antigo.pontos?.[0].aparelho_id).toBeUndefined();
    expect(familiasDoProduto(catalogo, antigo.pontos?.[0].produto)).toEqual(["fam-a"]);
    expect(aparelhosCompativeis(catalogo, antigo.pontos?.[0].produto).map((d) => d.id)).toEqual(["d1", "d3"]);
    expect(escolherProduto({ produto: "Toalha Rolo 250m", produto_id: "r2" }, catalogo).aparelho_id).toBe("d2");
  });
});

describe("Fase A — 3) Tela Hoje: atrasadas e em andamento primeiro, sem duplicar", () => {
  const mk = (id: string, start_time: string, status: string, assigned_to = "u1", scheduled_date = "2026-11-24"): any =>
    ({ id, start_time, status, assigned_to, scheduled_date, title: id });

  it("identifica visita atrasada somente quando passou do horário sem check-in", () => {
    expect(isAtrasada(mk("1", "08:40:00", "agendado"), "2026-11-24", "09:00")).toBe(true);
    expect(isAtrasada(mk("2", "08:40:00", "em_atendimento"), "2026-11-24", "09:00")).toBe(false);
    expect(isAtrasada(mk("3", "09:20:00", "agendado"), "2026-11-24", "09:00")).toBe(false);
    expect(isAtrasada(mk("4", "08:00:00", "concluido"), "2026-11-24", "09:00")).toBe(false);
  });

  it("ordena 1º atrasadas e em andamento, 2º demais de hoje por horário", () => {
    const list = [
      mk("futura-10", "10:00:00", "agendado"),
      mk("concluida-08", "08:00:00", "concluido"),
      mk("atrasada-0840", "08:40:00", "agendado"),
      mk("em-andamento-0920", "09:20:00", "em_atendimento"),
      mk("cancelada", "08:10:00", "cancelado"),
    ];
    expect(ordenarHoje(list, "2026-11-24", "09:15").map((s) => s.id)).toEqual([
      "atrasada-0840",
      "em-andamento-0920",
      "concluida-08",
      "futura-10",
    ]);
    const grupos = porConsultor(list, new Map([["u1", "Marcos"]]), "2026-11-24", "09:15");
    expect(grupos[0].itens.map((s) => s.id)).toEqual(["atrasada-0840", "em-andamento-0920", "concluida-08", "futura-10"]);
  });
});

describe("Fase A — 4) Troca de etiqueta danificada (vigência do número)", () => {
  it("oferece trocar_etiqueta para aparelhos ativos/em teste do local e formata o aviso de substituída", () => {
    expect(acoesEtiqueta("manutencao_preventiva", { status: "ATIVO", deste_local: true }).acoes).toContain("trocar_etiqueta");
    expect(acoesEtiqueta("manutencao_preventiva", { status: "EM_TESTE", deste_local: true }).acoes).toContain("trocar_etiqueta");
    expect(acoesEtiqueta("manutencao_preventiva", { status: "ENCERRADO", deste_local: false }).acoes).not.toContain("trocar_etiqueta");
    expect(avisoEtiquetaSubstituida("2026-11-24T14:00:00Z", 125)).toBe("Etiqueta substituída em 24/11 — este aparelho agora é o nº 000125");
    expect([...MOTIVOS_TROCA_ETIQUETA]).toEqual(["molhou", "rasgou", "ilegivel", "sumiu", "outro"]);
  });
});

describe("Fase A — 5) Contato e decisor com telefone e e-mail", () => {
  it("preserva telefone e e-mail de contato e decisor no rascunho e no schema de extração", () => {
    const r = limparRascunho({
      contato: { nome: "Ana", cargo: "Gerente", telefone: "(22) 99999-1111", email: "ana@hotel.com" },
      decisor: { nome: "Carlos", cargo: "Diretor", telefone: "(22) 98888-2222", email: "carlos@hotel.com" },
    });
    expect(r.contato).toEqual({ nome: "Ana", cargo: "Gerente", telefone: "(22) 99999-1111", email: "ana@hotel.com" });
    expect(r.decisor).toEqual({ nome: "Carlos", cargo: "Diretor", telefone: "(22) 98888-2222", email: "carlos@hotel.com" });
    expect(RASCUNHO_JSON_SCHEMA.properties.decisor.required).toEqual(["nome", "cargo", "telefone", "email"]);
  });
});