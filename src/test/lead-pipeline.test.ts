import { describe, expect, it } from "vitest";
import { buildColumns } from "@/lib/lead-pipeline";
const st = (id: string, ordem: number, chave: string | null, ativo = true) => ({ id, nome: id, ordem, tipo: "aberta", chave, ativo });
const stages = [st("perdido", 80, "perdido"), st("novo", 10, "novo"), st("qualif", 20, "qualificado"), st("teste", 60, "teste_amostra", false)];
describe("lead pipeline columns", () => {
  it("shows only active stages in configured order", () => {
    expect(buildColumns(stages, []).map(c => c.stage?.id)).toEqual(["novo", "qualif", "perdido"]);
  });
  it("places leads by stage_id and counts them per column", () => {
    const cols = buildColumns(stages, [{ id: "a", stage: "novo", stage_id: "qualif" }, { id: "b", stage: "novo", stage_id: "qualif" }]);
    expect(cols.find(c => c.stage?.id === "qualif")!.leads).toHaveLength(2);
  });
  it("maps leads without stage_id from the old stage (fechado_perdido → Perdido)", () => {
    const cols = buildColumns(stages, [{ id: "a", stage: "fechado_perdido", stage_id: null }]);
    expect(cols.find(c => c.stage?.id === "perdido")!.leads.map(l => l.id)).toEqual(["a"]);
  });
  it("keeps leads of a deactivated stage visible in 'Sem etapa ativa'", () => {
    const cols = buildColumns(stages, [{ id: "a", stage: "em_teste", stage_id: "teste" }]);
    expect(cols.at(-1)!.stage).toBeNull();
    expect(cols.at(-1)!.leads.map(l => l.id)).toEqual(["a"]);
  });
});
