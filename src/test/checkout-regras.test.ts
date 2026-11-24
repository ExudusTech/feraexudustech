import { describe, expect, it } from "vitest";
import {
  checkoutBloqueadoAlertMessage,
  checkoutBloqueadoMensagem,
  evaluateCheckoutLocation,
  posicaoWhatsapp,
  visitaAbertaMensagem,
  WA_LOCALIZACAO_MIN,
} from "../../supabase/functions/_shared/visit-exec";
import { faltasDetalhadas } from "@/lib/visit-draft";
import { TEAM_EVENTS, MANAGER_DEFAULT_EVENTS } from "@/hooks/use-team-notifications";

const CLIENTE = { lat: -22.8805, lng: -42.0195 };
const CHECKIN_FORA = { lat: -22.9000, lng: -42.0500 }; // ~3.8 km do cliente
const LONGE = { lat: -22.9500, lng: -42.1000 }; // longe de ambos

describe("Regra 1: check-out no local", () => {
  it("permite check-out dentro do raio do cliente/lead", () => {
    const r = evaluateCheckoutLocation({ lat: -22.8808, lng: -42.0196 }, CLIENTE, null, false, 300, false);
    expect(r.ok).toBe(true);
    expect(r.referencia).toBe("cliente");
    expect(r.distancia_m).toBeLessThanOrEqual(300);
  });

  it("recusa check-out fora do raio do cliente/lead", () => {
    const r = evaluateCheckoutLocation(LONGE, CLIENTE, null, false, 300, false);
    expect(r.ok).toBe(false);
    expect(r.fora_do_raio).toBe(true);
    expect(r.distancia_m).toBeGreaterThan(300);
    expect(checkoutBloqueadoMensagem(r.distancia_m)).toContain("Check-out bloqueado");
    expect(checkoutBloqueadoMensagem(r.distancia_m)).toContain("km");
  });

  it("recusa check-out sem localização e orienta WhatsApp da Flora", () => {
    const r = evaluateCheckoutLocation(null, CLIENTE, null, false, 300, false);
    expect(r.ok).toBe(false);
    expect(r.sem_localizacao).toBe(true);
    expect(checkoutBloqueadoMensagem(null)).toContain("WhatsApp da Flora");
  });

  it("permite check-out dentro do raio do próprio check-in quando visita comercial iniciou fora do local com justificativa", () => {
    const r = evaluateCheckoutLocation({ lat: -22.9002, lng: -42.0501 }, CLIENTE, CHECKIN_FORA, true, 300, false);
    expect(r.ok).toBe(true);
    expect(r.referencia).toBe("checkin");
  });

  it("não usa posição do check-in quando não foi visita comercial fora do local com justificativa", () => {
    const r = evaluateCheckoutLocation({ lat: -22.9002, lng: -42.0501 }, CLIENTE, CHECKIN_FORA, false, 300, false);
    expect(r.ok).toBe(false);
    expect(r.fora_do_raio).toBe(true);
  });

  it("fallback do WhatsApp vale por 30 min para o mesmo consultor", () => {
    const now = Date.now();
    const ok = posicaoWhatsapp({ wa_latitude: CLIENTE.lat, wa_longitude: CLIENTE.lng, wa_localizacao_em: new Date(now - 10 * 60_000).toISOString(), wa_localizacao_por: "u1" }, "u1", now);
    expect(ok).toEqual(CLIENTE);
    const exp = posicaoWhatsapp({ wa_latitude: CLIENTE.lat, wa_longitude: CLIENTE.lng, wa_localizacao_em: new Date(now - (WA_LOCALIZACAO_MIN + 1) * 60_000).toISOString(), wa_localizacao_por: "u1" }, "u1", now);
    expect(exp).toBeNull();
  });

  it("evento checkout_fora_do_local existe na lista de avisos da equipe e no padrão do gestor", () => {
    expect(TEAM_EVENTS.checkout_fora_do_local).toBe("Check-out fora do local");
    expect(MANAGER_DEFAULT_EVENTS).toContain("checkout_fora_do_local");
    const msg = checkoutBloqueadoAlertMessage({ id: "v1", cliente: "Padaria", consultor: "João", tipo: "Manutenção", distancia: 1500 });
    expect(msg).toContain("Check-out bloqueado fora do local");
    expect(msg).toContain("1,5 km");
  });
});

describe("Regra 2: liberação pelo gestor", () => {
  it("permite check-out mesmo fora do raio ou sem GPS quando liberado pelo gestor", () => {
    const r1 = evaluateCheckoutLocation(LONGE, CLIENTE, null, false, 300, true);
    expect(r1.ok).toBe(true);
    expect(r1.liberado).toBe(true);
    const r2 = evaluateCheckoutLocation(null, CLIENTE, null, false, 300, true);
    expect(r2.ok).toBe(true);
    expect(r2.liberado).toBe(true);
  });
});

describe("Regra 3: uma visita aberta por vez", () => {
  it("formata mensagem com código #OC e cliente", () => {
    expect(visitaAbertaMensagem({ ocorrencia_codigo: "OC-0042", cliente: "Hotel Mar" }))
      .toBe("Encerre a visita #OC-0042 (Hotel Mar) antes de iniciar outra");
  });
});

describe("Regra 4: informações obrigatórias antes do check-out (coleta)", () => {
  it("bloqueia encerramento na tela enquanto coleta não está confirmada ou tem pendências", () => {
    const f1 = faltasDetalhadas({ finished: false, resultado: "boa", resumo: "", proximo: "coleta", pendingPoints: 0, totalPoints: 0, fotoObrigatoria: false, fotos: 0, comColeta: true, coletaConfirmada: false, coletaPendencias: ["Nome do contato"] });
    expect(f1.map((x) => x.label)).toContain("Nome do contato");
    expect(f1[0].alvo).toBe("coleta");

    const f2 = faltasDetalhadas({ finished: false, resultado: "boa", resumo: "", proximo: "coleta", pendingPoints: 0, totalPoints: 0, fotoObrigatoria: false, fotos: 0, comColeta: true, coletaConfirmada: false, coletaPendencias: [] });
    expect(f2.map((x) => x.label)).toContain("confirmar a coleta");

    const f3 = faltasDetalhadas({ finished: false, resultado: "boa", resumo: "", proximo: "coleta", pendingPoints: 0, totalPoints: 0, fotoObrigatoria: false, fotos: 0, comColeta: true, coletaConfirmada: true, coletaPendencias: [] });
    expect(f3).toHaveLength(0);
  });
});