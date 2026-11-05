import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), refresh: vi.fn(async () => ({})), signOut: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke }, auth: { refreshSession: mocks.refresh, signOut: mocks.signOut }, storage: { from: () => ({}) } },
}));

import { visitAction, VisitActionError } from "@/lib/visit-exec";
import { baseAction } from "@/lib/base-instalada";
import { faltasParaEncerrar, readDraft, writeDraft, clearDraft } from "@/lib/visit-draft";

const httpError = (status: number, body: Record<string, unknown> = {}) =>
  ({ data: null, error: { context: new Response(JSON.stringify(body), { status }) } });

const closing = { finished: false, resultado: "", resumo: "", proximo: "", pendingPoints: 0, totalPoints: 0, fotoObrigatoria: true, fotos: 0 };

beforeEach(() => { mocks.invoke.mockReset(); mocks.refresh.mockClear(); mocks.signOut.mockClear(); localStorage.clear(); });

describe("consultant field flow: start → new point with photo → evaluate → next step → close", () => {
  it("runs end to end, surviving an expired session without signing out", async () => {
    const calls: string[] = [];
    let expiredOnce = true;
    mocks.invoke.mockImplementation(async (fn: string, { body }: { body: Record<string, unknown> }) => {
      calls.push(`${fn}:${body.action}`);
      if (body.action === "ponto_novo" && expiredOnce) { expiredOnce = false; return httpError(401, { error: "Não autorizado" }); }
      if (body.action === "checkout") return { data: { ok: true, duracao_min: 42 }, error: null };
      return { data: { ok: true, id: "p1", pedido_id: null }, error: null };
    });

    await visitAction({ id: "s1", action: "checkin", sem_permissao: true, justificativa: "Atendimento no rio" });
    // Before any point: the footer lists everything missing.
    expect(faltasParaEncerrar(closing)).toEqual(["cadastrar um ponto ou tirar uma foto do equipamento", "resultado", "próximo passo"]);

    const ponto = await baseAction<{ id: string }>({ action: "ponto_novo", schedule_id: "s1", localizacao_interna: "Banheiro", foto_path: "org/s1/x.jpg" });
    expect(ponto.id).toBe("p1");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(faltasParaEncerrar({ ...closing, totalPoints: 1, pendingPoints: 1 })[0]).toBe("avaliar 1 ponto");

    await baseAction({ action: "avaliar", schedule_id: "s1", comodato_id: "p1", estado: "verde" });
    const ready = { ...closing, totalPoints: 1, pendingPoints: 0, resultado: "concluida", resumo: "Tudo ok", proximo: "follow_up", dataAlvo: "2027-02-01" };
    expect(faltasParaEncerrar(ready)).toEqual([]);

    const r = await visitAction<{ duracao_min: number }>({ id: "s1", action: "checkout", resultado: "concluida", resumo: "Tudo ok", proximo: "follow_up", data_alvo: "2027-02-01" });
    expect(r.duracao_min).toBe(42);
    expect(calls).toEqual(["visita-acoes:checkin", "base-instalada:ponto_novo", "base-instalada:ponto_novo", "base-instalada:avaliar", "visita-acoes:checkout"]);
  });

  it("shows the server's Portuguese message for validation errors", async () => {
    mocks.invoke.mockResolvedValue(httpError(400, { error: "Informe o local interno do ponto" }));
    await expect(baseAction({ action: "ponto_novo" })).rejects.toThrow("Informe o local interno do ponto");
  });

  it("a session that stays expired gives a clear message and still never signs out", async () => {
    mocks.invoke.mockResolvedValue(httpError(401, { error: "Não autorizado" }));
    const err = await baseAction({ action: "ponto_novo" }).catch((e) => e);
    expect(err).toBeInstanceOf(VisitActionError);
    expect(err.message).toMatch(/sessão precisou ser renovada/);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});

describe("closing requirements", () => {
  it("return needs a date; lost needs only a reason", () => {
    const b = { ...closing, fotoObrigatoria: false, resultado: "boa", resumo: "" };
    expect(faltasParaEncerrar({ ...b, proximo: "follow_up" })).toEqual(["data do retorno"]);
    expect(faltasParaEncerrar({ ...b, proximo: "perdido", motivoPerda: "" })).toEqual(["motivo da perda"]);
    expect(faltasParaEncerrar({ ...b, proximo: "perdido", motivoPerda: "preço" })).toEqual([]);
  });
  it("counts several pending points", () => {
    expect(faltasParaEncerrar({ ...closing, pendingPoints: 3, totalPoints: 3 })[0]).toBe("avaliar 3 pontos");
  });
});

describe("local draft", () => {
  it("keeps the new point form (with uploaded photo) until it is saved", () => {
    writeDraft("pt-novo:s1", { local: "Banheiro", foto: "org/s1/x.jpg" });
    expect(readDraft<{ foto: string }>("pt-novo:s1")?.foto).toBe("org/s1/x.jpg");
    clearDraft("pt-novo:s1");
    expect(readDraft("pt-novo:s1")).toBeNull();
  });
});

import { faltasDetalhadas } from "@/lib/visit-draft";
import { refisCompativeis, MANUTENCOES } from "@/lib/base-instalada";
import { RESULT_LABEL, validateCheckout } from "@/lib/visit-exec";
import { pendentesAnteriores, porConsultor } from "@/lib/hoje";

describe("ajustes do teste em campo 04/11", () => {
  const base = { finished: false, resultado: "concluida", resumo: "", proximo: "plano", pendingPoints: 0, totalPoints: 1, fotoObrigatoria: true, fotos: 0, tecnico: true };
  it("resumo é opcional no encerramento", () => {
    expect(faltasDetalhadas(base)).toEqual([]);
    expect(validateCheckout({ status: "em_atendimento", resultado: "concluida", resumo: "", proximo: "novo_agendamento", commercial: false, fotos: 0, precisa_foto: false })).toBeNull();
  });
  it("manutenção sem plano pede só a frequência e aponta para a seção", () => {
    expect(faltasDetalhadas({ ...base, proximo: "" })).toEqual([{ label: "frequência da próxima visita", alvo: "proximo" }]);
  });
  it("ponto pendente leva à lista de pontos", () => {
    expect(faltasDetalhadas({ ...base, pendingPoints: 1 })[0]).toEqual({ label: "avaliar 1 ponto", alvo: "pontos" });
  });
  it("perdido comercial exige só o motivo", () => {
    expect(faltasDetalhadas({ ...base, tecnico: false, resultado: "boa", proximo: "perdido", motivoPerda: "Preço" })).toEqual([]);
  });
  it("rótulo curto para concluída com problema e checklist com aparelho trocado/problema", () => {
    expect(RESULT_LABEL.com_problema).toBe("Com problema");
    expect(MANUTENCOES).toEqual(["refil_reposto", "limpeza", "aparelho_trocado", "problema"]);
  });
  it("refil compatível: especificação > família > mesma marca", () => {
    const disp = { id: "d", name: "DISPENSER MOD INTERFOLIADO - TOALHA", brand: "SUZANO", dispenser_family_id: "f1" };
    const refis = [
      { id: "a", brand: "SUZANO", specifications: { dispenser: "Dispenser MOD Interfoliado - Toalha" } },
      { id: "b", brand: "KLEEN", compatible_dispenser_families: ["f1"] },
      { id: "c", brand: "EKKOA" },
    ];
    expect(refisCompativeis(disp, refis).lista.map((r) => r.id)).toEqual(["a"]);
    expect(refisCompativeis({ ...disp, name: "Outro" }, refis).lista.map((r) => r.id)).toEqual(["b"]);
    const ekkoa = refisCompativeis({ id: "e", name: "APARELHO X", brand: "EKKOA" }, refis);
    expect(ekkoa).toEqual({ lista: [refis[2]], mapeado: false });
  });
  it("Hoje mostra visitas antigas ainda abertas e agrupa por consultor", () => {
    const mk = (id: string, d: string, st: string, a: string | null = "u1") => ({ id, scheduled_date: d, status: st, assigned_to: a } as any);
    const list = [mk("8261", "2026-11-03", "em_atendimento"), mk("x", "2026-11-02", "concluido"), mk("y", "2026-11-01", "agendado"), mk("z", "2026-11-04", "agendado")];
    expect(pendentesAnteriores(list, "2026-11-04").map((s) => s.id)).toEqual(["8261", "y"]);
    const g = porConsultor([mk("1", "2026-11-04", "agendado", "u2"), mk("2", "2026-11-04", "agendado", null), mk("3", "2026-11-04", "agendado", "u1")], new Map([["u1", "Marcos"], ["u2", "Arilson"]]));
    expect(g.map((x) => x.nome)).toEqual(["Arilson", "Marcos", "Sem responsável"]);
  });
});

import { horasAberta, duracaoComTermino, sugestaoTermino } from "@/lib/visit-exec";
import { acaoRevisitaErro } from "@/lib/base-instalada";
import { scheduleEvent, scheduleMessage, serviceLabel } from "../../supabase/functions/_shared/schedule-notify";
import { defaultEventsFor } from "@/hooks/use-team-notifications";

describe("complemento 04/11", () => {
  it("revisita: OK sem foto; atenção/defeito exige o que foi feito", () => {
    expect(acaoRevisitaErro("verde", false, false)).toBeNull();
    expect(acaoRevisitaErro("amarelo", false, false)).toMatch(/o que foi feito/);
    expect(acaoRevisitaErro("vermelho", false, true)).toBeNull();
    expect(acaoRevisitaErro("amarelo", true, false)).toBeNull();
  });
  it("manutenção mostra 'Manutenção' e não avisa na criação pelo próprio consultor", () => {
    expect(serviceLabel("manutencao", "MANUTENCAO")).toBe("Manutenção");
    expect(scheduleEvent("manutencao", "MANUTENCAO", "campo")).toBeNull();
    expect(scheduleEvent("manutencao", "MANUTENCAO", "manual", true)).toBeNull();
    expect(scheduleEvent("manutencao", "MANUTENCAO", "manual", false)).toBe("agendamento_tecnico");
    expect(scheduleMessage("agendamento_tecnico", { id: "1", schedule_type: "manutencao", schedule_subtype: "MANUTENCAO", link_path: "/x" })).toMatch(/^🔧 Nova manutenção agendada/);
  });
  it("visita aberta desde ontem é sinalizada e pede o término real", () => {
    const now = new Date("2026-11-04T15:00:00Z");
    expect(horasAberta("2026-11-03T18:00:00Z", now)).toBe(21);
    expect(horasAberta("2026-11-04T13:00:00Z", now)).toBeNull();
    expect(duracaoComTermino("2026-11-03T18:00:00Z", null, now)).toEqual({ error: "Informe o horário real de término da visita" });
    expect(duracaoComTermino("2026-11-03T18:00:00Z", "16:00", now)).toEqual({ min: 60 });
    expect(sugestaoTermino("2026-11-03T18:00:00Z", 60)).toBe("16:00");
  });
  it("gestor e super admin já vêm com os eventos de campo marcados", () => {
    expect(defaultEventsFor(["gestor"], [])).toEqual(["visita_concluida", "checkin_fora_do_local", "visita_atrasada", "visita_aberta", "prontidao_pendente", "tarefa_nota_d1"]);
    expect(defaultEventsFor(["faturamento"], [])).toEqual(["tarefa_nota_criada", "tarefa_nota_d1"]);
    expect(defaultEventsFor(["financeiro"], [])).toEqual([]);
    expect(defaultEventsFor(["vendedor"], [])).toEqual([]);
  });
});
