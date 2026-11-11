import { describe, expect, it } from "vitest";
import { cidadeChave, cidadeOficial, parseImportRows, periodicidadeAtivacao, areaDoCliente } from "../../supabase/functions/_shared/base-instalada";
import { planejarAtivacoes, maxPorDiaValido } from "../../supabase/functions/_shared/ativacao";
import { checkinBloqueadoAlertMessage, checkinBloqueadoMensagem, formatDistancia, nextMaintenance, permiteCheckinForaDoLocal } from "../../supabase/functions/_shared/visit-exec";
import { cnpjDemo } from "../../supabase/functions/_shared/demo-cenario";

const CNPJ = cnpjDemo(7); // valid check digits

describe("importar carteira (Ordem A)", () => {
  const linha = (o: Record<string, string>) => ({ "Nome": "", "CNPJ": "", "Endereço": "", "Bairro": "", "Cidade": "", "CEP": "", "Contato": "", "Telefone": "", "E-mail": "", "Segmento": "", ...o });
  it("lê as colunas da planilha do gestor", () => {
    const [r] = parseImportRows([linha({ "Nome": "Padaria Sol", "CNPJ": CNPJ, "Endereço": "Rua A, 10", "Bairro": "Centro", "Cidade": "Búzios", "CEP": "28950000",
      "Contato": "Ana", "Telefone": "(22) 99876-5432", "E-mail": "ana@sol.com", "Segmento": "Padaria" })], []);
    expect(r).toMatchObject({ cliente: "Padaria Sol", cnpj: CNPJ, endereco: "Rua A, 10", bairro: "Centro", cidade: "Armação dos Búzios", cep: "28950-000",
      contato: "Ana", telefone: "22998765432", email: "ana@sol.com", segmento: "Padaria", geocodificavel: true, frequencia: "" });
    expect(r.erro).toBeUndefined();
  });
  it("usa a razão social quando não há nome e aceita CNPJ vazio", () => {
    const [r] = parseImportRows([{ "Razão social": "Sol Comércio Ltda", "Cidade": "Cabo Frio" }], []);
    expect(r.cliente).toBe("Sol Comércio Ltda"); expect(r.cnpj).toBeUndefined(); expect(r.erro).toBeUndefined();
    expect(r.avisos).toContain("Sem endereço/CEP: a localização vem do primeiro check-in");
  });
  it("CNPJ inválido não bloqueia: entra sem CNPJ com aviso", () => {
    const [r] = parseImportRows([linha({ "Nome": "Bar X", "Cidade": "Cabo Frio", "CNPJ": "11.111.111/1111-11" })], []);
    expect(r.erro).toBeUndefined(); expect(r.cnpj).toBeUndefined(); expect(r.avisos).toContain("CNPJ inválido: importado sem CNPJ");
  });
  it("deduplica por CNPJ mesmo com outro nome", () => {
    const [r] = parseImportRows([linha({ "Nome": "Nome Novo", "Cidade": "Cabo Frio", "CNPJ": CNPJ })], [{ id: "c1", name: "Outro Nome", city: "Saquarema", document: CNPJ }]);
    expect(r.erro).toBe("Cliente já cadastrado"); expect(r.duplicado_de).toBe("c1");
  });
  it("deduplica por nome + cidade com apelido de cidade", () => {
    const r = parseImportRows([linha({ "Nome": "Pousada Mar", "Cidade": "Buzios/RJ" }), linha({ "Nome": "pousada mar", "Cidade": "Arraial" })],
      [{ id: "c2", name: "Pousada Mar", city: "Armação dos Búzios" }]);
    expect(r[0].erro).toBe("Cliente já cadastrado");
    expect(r[1].erro).toBeUndefined();
  });
  it("mesmo cliente duas vezes na planilha entra uma vez", () => {
    const r = parseImportRows([linha({ "Nome": "Bar Y", "Cidade": "Arraial" }), linha({ "Nome": "BAR Y", "Cidade": "Arraial do Cabo" })], []);
    expect(r[0].erro).toBeUndefined(); expect(r[1].erro).toBe("Repetido na planilha");
  });
  it("apelidos de cidade", () => {
    expect(cidadeChave("Búzios")).toBe(cidadeChave("Armação dos Búzios"));
    expect(cidadeOficial("sao pedro")).toBe("São Pedro da Aldeia");
    expect(cidadeOficial("Macaé - RJ")).toBe("Macaé");
    expect(areaDoCliente([{ name: "Búzios", city: "Armação dos Búzios" }], null, "Buzios")?.name).toBe("Búzios");
  });
});

describe("visitas de ativação em lote", () => {
  // 2026-11-16 is a Monday. Route Cabo Frio: Monday and Wednesday; Búzios: Tuesday.
  const areas = [{ name: "Cabo Frio", city: "Cabo Frio", dia_semana: "2ª feira e 4ª feira", horario_inicio: "08:00", horario_fim: "18:00" },
    { name: "Búzios", city: "Armação dos Búzios", dia_semana: "3ª feira", horario_inicio: "09:00", horario_fim: "12:00" }];
  const cf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, nome: `Cliente ${String(i).padStart(2, "0")}`, cidade: "Cabo Frio" }));
  it("marca no próximo dia de rota da região do cliente", () => {
    const [l] = planejarAtivacoes({ clientes: [{ id: "b", nome: "Bar", cidade: "Búzios" }], areas, desde: "2026-11-16", ocupados: [] });
    expect(l).toMatchObject({ data: "2026-11-17", hora: "09:00", regiao: "Búzios" });
  });
  it("no máximo 8 por dia por padrão; o 9º vai para o próximo dia de rota", () => {
    const r = planejarAtivacoes({ clientes: cf(9), areas, desde: "2026-11-16", ocupados: [] });
    expect(r.filter((l) => l.data === "2026-11-16")).toHaveLength(8);
    expect(r[8].data).toBe("2026-11-18");
  });
  it("N configurável", () => {
    const r = planejarAtivacoes({ clientes: cf(3), areas, desde: "2026-11-16", ocupados: [], maxPorDia: 2 });
    expect(r.map((l) => l.data)).toEqual(["2026-11-16", "2026-11-16", "2026-11-18"]);
    expect(maxPorDiaValido("")).toBe(8); expect(maxPorDiaValido(0)).toBe(8); expect(maxPorDiaValido(5)).toBe(5);
  });
  it("conta ativações já marcadas do consultor no dia", () => {
    const r = planejarAtivacoes({ clientes: cf(1), areas, desde: "2026-11-16", ocupados: [], ativacoesExistentes: { "2026-11-16": 8 } });
    expect(r[0].data).toBe("2026-11-18");
  });
  it("pula feriado da cidade e bloqueio do Google, mas não feriado de outra cidade", () => {
    const r = planejarAtivacoes({ clientes: cf(1), areas, desde: "2026-11-16", ocupados: [], feriados: [{ date: "2026-11-16", city: "Cabo Frio" }, { date: "2026-11-18", city: null }] });
    expect(r[0].data).toBe("2026-11-23");
    const s = planejarAtivacoes({ clientes: cf(1), areas, desde: "2026-11-16", ocupados: [], feriados: [{ date: "2026-11-16", city: "Saquarema" }] });
    expect(s[0].data).toBe("2026-11-16");
  });
  it("não choca com a agenda do consultor nem com o Google", () => {
    const busyGoogle = { start: Date.parse("2026-11-17T09:00:00-03:00"), end: Date.parse("2026-11-17T10:00:00-03:00") };
    const [l] = planejarAtivacoes({ clientes: [{ id: "b", nome: "Bar", cidade: "Búzios" }], areas, desde: "2026-11-16",
      ocupados: [{ data: "2026-11-17", inicio: "10:00", fim: "11:00" }], google: [busyGoogle] });
    expect(l).toMatchObject({ data: "2026-11-17", hora: "11:00" });
  });
  it("cidade sem região de rota fica de fora com motivo", () => {
    const [l] = planejarAtivacoes({ clientes: [{ id: "x", nome: "Longe", cidade: "Macaé" }], areas, desde: "2026-11-16", ocupados: [] });
    expect(l.data).toBeUndefined(); expect(l.erro).toMatch(/região/);
  });
});

describe("ativação: periodicidade ao encerrar", () => {
  it("7/15/30/60 dias viram plano e periodicidade dos pontos", () => {
    expect(periodicidadeAtivacao(7)).toMatchObject({ frequencia: "semanal", periodicidade_manut: "semanal" });
    expect(periodicidadeAtivacao(15)).toMatchObject({ frequencia: "quinzenal" });
    expect(periodicidadeAtivacao(30)).toMatchObject({ frequencia: "mensal" });
    expect(periodicidadeAtivacao(60)).toMatchObject({ frequencia: "personalizada", intervalo_dias: 60, periodicidade_manut: "bimestral" });
    expect(periodicidadeAtivacao(45)).toBeNull();
  });
  it("próxima manutenção semanal/quinzenal em dias", () => {
    expect(nextMaintenance("2026-11-16", "semanal")).toBe("2026-11-23");
    expect(nextMaintenance("2026-11-16", "quinzenal")).toBe("2026-12-01");
  });
});

describe("check-in fora do local (Ordem A)", () => {
  it("só a visita comercial pode começar fora do local", () => {
    expect(permiteCheckinForaDoLocal("visita_comercial", "PROSPECCAO", "primeira_visita")).toBe(true);
    expect(permiteCheckinForaDoLocal("visita_comercial", null, null)).toBe(true);
    expect(permiteCheckinForaDoLocal("manutencao", "MANUTENCAO", "manutencao_preventiva")).toBe(false);
    expect(permiteCheckinForaDoLocal("manutencao", "MANUTENCAO", "ativacao_base")).toBe(false);
    expect(permiteCheckinForaDoLocal("visita_tecnica", "INSTALACAO", "instalacao_teste")).toBe(false);
    expect(permiteCheckinForaDoLocal("entrega", null, "entrega")).toBe(false);
    expect(permiteCheckinForaDoLocal("manutencao", "MANUTENCAO", "substituicao")).toBe(false);
    expect(permiteCheckinForaDoLocal("manutencao", "OUTRO", "coleta_devolucao")).toBe(false);
    expect(permiteCheckinForaDoLocal("visita_tecnica", "DIAGNOSTICO", null)).toBe(false);
  });
  it("distâncias em km, abaixo de 1 km em metros", () => {
    expect(formatDistancia(312_400)).toBe("312 km");
    expect(formatDistancia(850)).toBe("850 m");
    expect(formatDistancia(1_400)).toBe("1,4 km");
  });
  it("mensagem e aviso ao gestor trazem a distância", () => {
    expect(checkinBloqueadoMensagem(312_000, "A visita de manutenção")).toMatch(/312 km/);
    expect(checkinBloqueadoAlertMessage({ id: "s", cliente: "Bar", consultor: "Ana", tipo: "Manutenção", distancia: 312_000 })).toMatch(/Distância: 312 km/);
  });
});
