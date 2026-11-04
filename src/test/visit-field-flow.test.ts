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
    expect(faltasParaEncerrar(closing)).toEqual(["cadastrar um ponto ou tirar uma foto do equipamento", "resultado", "resumo", "próximo passo"]);

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
  it("follow-up needs a date; lost needs reason and confirmation", () => {
    const b = { ...closing, fotoObrigatoria: false, resultado: "boa", resumo: "ok ok" };
    expect(faltasParaEncerrar({ ...b, proximo: "follow_up" })).toEqual(["data do follow-up"]);
    expect(faltasParaEncerrar({ ...b, proximo: "perdido", motivoPerda: "preço" })).toEqual(["motivo e confirmação da perda"]);
    expect(faltasParaEncerrar({ ...b, proximo: "perdido", motivoPerda: "preço", confPerdido: true })).toEqual([]);
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
