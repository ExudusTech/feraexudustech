import { describe, it, expect } from "vitest";
import { aplicaFiltro, rotularAutores, type Service } from "@/lib/atendimento-metrics";

const svc: Service = { config: { dias: [0,1,2,3,4,5,6], inicio: "00:00", fim: "23:59", timezone: "America/Sao_Paulo" } as any, closed: [], city: null, amarelo: 10, vermelho: 30 };
const base = { lead_id: null, tipo: "transferencia", canal: "WHATSAPP", resultado: null, assumido_em: null, resolvido_em: null, responsavel_id: null, assumido_por: null };
const now = new Date("2026-11-03T15:00:00Z");
const items = [
  { ...base, id: "a", status: "aberto", relogio_inicia_em: "2026-11-03T14:58:00Z", aberto_em: "2026-11-03T14:58:00Z" },
  { ...base, id: "b", status: "aberto", relogio_inicia_em: "2026-11-03T13:00:00Z", aberto_em: "2026-11-03T13:00:00Z" },
  { ...base, id: "c", status: "encerrado_sem_resposta", resultado: "sem_resposta", relogio_inicia_em: "2026-10-01T13:00:00Z", aberto_em: "2026-10-01T13:00:00Z", assumido_em: "2026-10-01T13:01:00Z", responsavel_id: "u1" },
];

describe("filtros de atendimento", () => {
  it("status encerrado_sem_resposta mostra só esses", () => {
    expect(aplicaFiltro(items, { dim: "status", valor: "encerrado_sem_resposta", label: "" }, svc, now).map((i) => i.id)).toEqual(["c"]);
  });
  it("em atraso agora = abertos não verdes", () => {
    expect(aplicaFiltro(items, { dim: "atraso", valor: "", label: "" }, svc, now).map((i) => i.id)).toEqual(["b"]);
  });
  it("respeita período e responsável", () => {
    expect(aplicaFiltro(items, { dim: "canal", valor: "WHATSAPP", label: "", desde: "2026-11-01T00:00:00Z" }, svc, now)).toHaveLength(2);
    expect(aplicaFiltro(items, { dim: "canal", valor: "WHATSAPP", label: "", owner: "u1" }, svc, now).map((i) => i.id)).toEqual(["c"]);
  });
});

describe("autor das mensagens", () => {
  it("envio do Fera vira nome, avisos viram sistema, resto Flora", () => {
    const r = rotularAutores([
      { autor: "Cliente", texto: "oi", quando: "2026-11-03T11:06:00Z" },
      { autor: "Flora", texto: "Bom dia, aqui é o Arilson", quando: "2026-11-03T11:07:00Z" },
      { autor: "Flora", texto: "👤 Atendimento transferido — X", quando: "2026-11-03T11:07:10Z" },
      { autor: "Flora", texto: "Posso ajudar?", quando: "2026-11-03T09:00:00Z" },
    ], [{ quem: "Arilson", quando: "2026-11-03T11:07:02Z" }]);
    expect(r.map((m) => m.autor)).toEqual(["Cliente", "Arilson", "Aviso do sistema", "Flora"]);
  });
});
