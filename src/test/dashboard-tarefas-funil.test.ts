import { describe, expect, it } from "vitest";
import { tarefasDoPainel, rotuloTarefa, type TarefaPainelRow } from "@/lib/tarefas-painel";
import { funilPorEtapa, type PipelineStage } from "@/lib/lead-pipeline";
import { mergePermissions, routeAllowed, type AppRole } from "@/lib/permissions";

const tarefa = (numero: number, prazo: string, extra: Partial<TarefaPainelRow> = {}): TarefaPainelRow =>
  ({ id: `t${numero}`, numero, empresa_nome: `Empresa ${numero}`, tipo_nota: "remessa_teste", acao: "emitir", data_visita: "2026-11-24", prazo, ...extra });

describe("Dashboard → Tarefas Pendentes", () => {
  const agora = new Date("2026-11-23T21:00:00Z");
  it("ordena por prazo e mostra no máximo 6", () => {
    const rows = [9, 3, 7, 1, 5, 8, 2, 4].map((n) => tarefa(n, `2026-11-${String(20 + n).padStart(2, "0")}T12:00:00Z`));
    const r = tarefasDoPainel(rows, agora);
    expect(r.map((t) => t.numero)).toEqual([1, 2, 3, 4, 5, 7]);
  });
  it("prazo já passado fica marcado como vencido; futuro não", () => {
    const r = tarefasDoPainel([tarefa(1, "2026-11-23T20:59:00Z"), tarefa(2, "2026-11-23T21:01:00Z")], agora);
    expect(r.map((t) => t.atrasada)).toEqual([true, false]);
  });
  it("rótulo traz o tipo de nota e, quando não é emissão simples, a ação", () => {
    expect(rotuloTarefa("emitir", "devolucao_remessa")).toBe("Devolução de Simples Remessa (só equipamento)");
    expect(rotuloTarefa("cancelar", "devolucao_remessa")).toMatch(/ · Devolução de Simples Remessa/);
  });
  it.each<[AppRole, boolean]>([["gestor", true], ["faturamento", true], ["admin", true], ["vendedor", false], ["financeiro", false]])(
    "%s acessa /tarefas (vê o card com dados): %s", (role, esperado) => {
      expect(routeAllowed(mergePermissions([role]), "/tarefas")).toBe(esperado);
    });
});

describe("Dashboard → Funil de Leads usa as etapas atuais da organização", () => {
  const st = (id: string, nome: string, ordem: number, chave: string | null, ativo = true): PipelineStage => ({ id, nome, ordem, tipo: "aberta", chave, ativo });
  const stages = [
    st("s5", "Teste/amostra", 50, "teste_amostra"), st("s1", "Novo", 10, "novo"), st("s3", "Visita agendada", 30, null),
    st("s4", "Visita realizada", 40, null), st("s9", "Antiga", 90, null, false), st("s6", "Ganho", 60, "ganho"),
  ];
  const leads = [
    { id: "a", stage: "novo", stage_id: "s1" }, { id: "b", stage: "qualificacao", stage_id: "s3" }, { id: "c", stage: "qualificacao", stage_id: "s3" },
    { id: "d", stage: "qualificacao", stage_id: "s4" }, { id: "e", stage: "em_teste", stage_id: "s5" },
    { id: "f", stage: "em_teste", stage_id: null }, // sem stage_id → equivalência do legado (Teste/amostra)
    { id: "g", stage: "fechado_ganho", stage_id: null }, // → Ganho
    { id: "h", stage: "qualificacao", stage_id: "s9" }, // etapa desativada → Sem etapa
    { id: "i", stage: "desconhecido", stage_id: null }, // sem equivalência → Sem etapa
  ];
  const funil = funilPorEtapa(stages, leads);
  it("barras na ordem configurada, com o nome de cada etapa", () => {
    expect(funil.map((b) => b.name)).toEqual(["Novo", "Visita agendada", "Visita realizada", "Teste/amostra", "Ganho", "Sem etapa"]);
  });
  it("conta por stage_id, cai no legado sem stage_id, e o resto vai para Sem etapa", () => {
    expect(funil.map((b) => b.quantidade)).toEqual([1, 2, 1, 2, 1, 2]);
  });
  it("a soma das barras bate com o total de leads", () => {
    expect(funil.reduce((s, b) => s + b.quantidade, 0)).toBe(leads.length);
  });
  it("sem leads órfãos não aparece a barra Sem etapa", () => {
    expect(funilPorEtapa(stages, leads.slice(0, 5)).map((b) => b.name)).not.toContain("Sem etapa");
  });
});
