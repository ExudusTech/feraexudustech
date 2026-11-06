import { describe, expect, it } from "vitest";
import { checkinBloqueadoPorNota, resumoNotasAmanha } from "../../supabase/functions/_shared/prontidao";
import { exigeColeta, limparRascunho, pendenciasColeta, resumoColeta } from "../../supabase/functions/_shared/coleta";
import { mergePermissions, routeAllowed } from "@/lib/permissions";
import { ASSIGNABLE_ROLES } from "../../supabase/functions/_shared/roles";

describe("05/11 — check-in sem nota", () => {
  const op = { exige_nota: true, nota_status: "pendente", checkin_liberado_em: null };
  it("bloqueia por padrão quando a operação exige nota e ela não foi anexada", () => {
    expect(checkinBloqueadoPorNota(op, true)).toBe(true);
    expect(checkinBloqueadoPorNota(op, undefined)).toBe(true);
  });
  it("libera com nota anexada, exceção do gestor ou organização desligada", () => {
    expect(checkinBloqueadoPorNota({ ...op, nota_status: "anexada" }, true)).toBe(false);
    expect(checkinBloqueadoPorNota({ ...op, checkin_liberado_em: "2026-11-05T10:00:00Z" }, true)).toBe(false);
    expect(checkinBloqueadoPorNota(op, false)).toBe(false);
  });
  it("operação sem material não exige nota", () => {
    expect(checkinBloqueadoPorNota({ exige_nota: false, nota_status: "nao_exigida" }, true)).toBe(false);
  });
});

describe("05/11 — papel Faturamento", () => {
  it("faturamento vê Tarefas; financeiro não recebe tarefas de nota", () => {
    expect(routeAllowed(mergePermissions(["faturamento"]), "/tarefas")).toBe(true);
    expect(routeAllowed(mergePermissions(["financeiro"]), "/tarefas")).toBe(false);
    expect(routeAllowed(mergePermissions(["financeiro", "faturamento"]), "/financeiro")).toBe(true);
    expect(ASSIGNABLE_ROLES).toContain("faturamento");
  });
});

describe("05/11 — aviso único das 17h", () => {
  it("uma mensagem com a lista e os links", () => {
    const msg = resumoNotasAmanha("2026-11-06", [
      { id: "a", codigo: "OC-000010", hora: "09:00", cliente: "Pousada X", tipo_nota: "venda" },
      { id: "b", codigo: "OC-000011", hora: "14:00", cliente: "Clínica Y", tipo_nota: "remessa_comodato" },
    ]);
    expect(msg).toContain("06/11/2026");
    expect(msg).toContain(": 2");
    expect(msg).toContain("#OC-000010");
    expect(msg).toContain("agenda?agendamento=b");
  });
});

describe("Lote 15 — coleta", () => {
  it("tipos comerciais exigem coleta; técnicos não", () => {
    expect(exigeColeta("primeira_visita")).toBe(true);
    expect(exigeColeta("venda_direta")).toBe(true);
    expect(exigeColeta("manutencao_preventiva")).toBe(false);
  });
  it("primeira visita vazia lista tudo que falta", () => {
    const p = pendenciasColeta("primeira_visita", {});
    expect(p).toEqual(expect.arrayContaining(["Nome do contato", "Quem decide a compra", "Fluxo de pessoas", "Queixas / dores do cliente"]));
  });
  it("produto oferecido sem reação e próximo passo sem data viram pendência", () => {
    const p = pendenciasColeta("manutencao_preventiva", { produtos_oferecidos: [{ produto: "Ekkoa" }], proximos_passos: [{ tipo: "proposta" }] });
    expect(p).toEqual(["Você ofereceu Ekkoa — o que o cliente achou?", 'Qual a data para "Enviar proposta"?']);
  });
  it("rascunho completo não tem pendências e o resumo leva o número da ocorrência", () => {
    const r = limparRascunho({ contato: { nome: "Ana" }, decisor: { nome: "Carlos" }, pontos: [{ local: "Banheiro F", aparelho: "Dispenser", produto: "Sabonete", quantidade: 2 }],
      fluxo_pessoas: "200/dia", dores: ["odor"], concorrente: "Marca Z", produtos_oferecidos: [{ produto: "Ekkoa", reacao: "gostou" }],
      proximos_passos: [{ tipo: "teste", data: "2026-11-12" }] });
    expect(pendenciasColeta("primeira_visita", r)).toEqual([]);
    expect(resumoColeta("OC-000123", r)).toMatch(/^#OC-000123 · Contato: Ana/);
  });
  it("data inválida no próximo passo é descartada (fica pendente)", () => {
    const r = limparRascunho({ proximos_passos: [{ tipo: "retorno", data: "amanhã" }] });
    expect(r.proximos_passos?.[0].data).toBeUndefined();
  });
});
