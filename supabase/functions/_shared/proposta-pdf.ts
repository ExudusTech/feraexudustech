// Commercial proposal PDF (A4) rendered server-side with pdf-lib. Pure: data in, bytes out (testable without network).
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

export interface PropostaConfig {
  slogan: string; experiencia: string;
  txt_empresa: string; txt_parcerias: string; txt_tecnologia: string; txt_consultoria: string; faixa: string;
  validade_dias: number; forma_pagamento: string; prazo_entrega: string; periodicidade_manutencao: string;
  whatsapp: string; site: string; instagram: string;
}

export const DEFAULT_PROPOSTA_CONFIG: PropostaConfig = {
  slogan: "Inovação, este é o nosso papel!",
  experiencia: "Mais de 20 anos de experiência em higienização profissional",
  txt_empresa: "A Nit's Clean oferece soluções logísticas eficientes e produtos de limpeza de alta qualidade. São mais de 20 anos no mercado, com parcerias sólidas com os líderes do setor e filial em Búzios atendendo toda a Região dos Lagos.",
  txt_parcerias: "Trabalhamos com marcas líderes de mercado, garantindo qualidade, desempenho e reposição confiável.",
  txt_tecnologia: "Sistemas e equipamentos que aumentam a eficiência, reduzem o desperdício e otimizam o consumo de produtos.",
  txt_consultoria: "Consultores dedicados acompanham sua operação de perto, de forma presencial ou virtual.",
  faixa: "Logística ágil, atendimento personalizado e entrega em até 24 horas.",
  validade_dias: 10, forma_pagamento: "Boleto bancário, 28 dias", prazo_entrega: "Até 24 horas após o aceite",
  periodicidade_manutencao: "Mensal",
  whatsapp: "(22) 99266-8769", site: "www.nitsclean.com.br", instagram: "@nitsclean",
};

export function mergeConfig(c: unknown): PropostaConfig {
  const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PROPOSTA_CONFIG } as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_PROPOSTA_CONFIG)) {
    const v = o[k];
    if (k === "validade_dias") { const n = Number(v); if (Number.isFinite(n) && n > 0) out[k] = Math.round(n); }
    else if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out as unknown as PropostaConfig;
}

export interface PropostaPdfData {
  numero: number; data: string; validade: string;
  cliente: { razao: string; cnpj?: string | null; responsavel?: { nome?: string | null; email?: string | null; telefone?: string | null } };
  consultor: { nome?: string | null; telefone?: string | null };
  ambientes: { local: string; aparelho?: string | null; produto?: string | null; quantidade?: string | null }[];
  itens: { descricao: string; quantidade: number; preco: number; desconto: number; total: number }[];
  comodatos: { descricao: string; quantidade: number }[];
  descontoGeralPct: number; subtotal: number; total: number;
  condicoes: { forma_pagamento: string; prazo_entrega: string; periodicidade: string; validade_dias: number };
  parceiros: string[];
  config: PropostaConfig;
}

/** Brand partners shown on the PDF: active catalog brands, never Multi Química. */
export function parceirosAtivos(brands: (string | null | undefined)[], max = 12): string[] {
  const seen = new Map<string, string>(); const count = new Map<string, number>();
  for (const b of brands) {
    const name = (b ?? "").trim(); if (!name) continue;
    const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key.includes("multiquimica")) continue;
    if (!seen.has(key)) seen.set(key, name);
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => (count.get(b[0]) ?? 0) - (count.get(a[0]) ?? 0)).slice(0, max).map(([, n]) => n);
}

/** Brazilian phone display: 5522992668769 -> (22) 99266-8769. Unknown shapes are returned as typed. */
export function fmtTel(v?: string | null): string {
  if (!v) return ""; let d = v.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

export const itensSemPreco = (itens: { unit_price: number | null }[]) => itens.filter((i) => i.unit_price == null).length;

const NAVY = rgb(0x18 / 255, 0x28 / 255, 0x59 / 255);
const TEAL = rgb(0x02 / 255, 0x51 / 255, 0x59 / 255);
const GREEN = rgb(0x91 / 255, 0xbf / 255, 0x4b / 255);
const LIGHT = rgb(0x5e / 255, 0xb5 / 255, 0xbf / 255);
const INK = rgb(0.13, 0.15, 0.2);
const MUTED = rgb(0.42, 0.46, 0.52);
const LINE = rgb(0.88, 0.9, 0.93);
const SOFT = rgb(0.95, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);
const W = 595.28, H = 841.89, M = 50;

const brl = (v: number) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
// Helvetica is WinAnsi: keep Latin-1 + common punctuation, drop anything else.
const WIN = new Set("–—‘’“”•…€".split(""));
const clean = (s: string) => [...(s ?? "")].map((c) => (c.charCodeAt(0) <= 0xff || WIN.has(c) ? c : "")).join("").replace(/[\r\t]/g, " ");

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) <= max) line = t;
      else { if (line) out.push(line); line = w; while (font.widthOfTextAtSize(line, size) > max && line.length > 1) { let i = line.length - 1; while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > max) i--; out.push(line.slice(0, i)); line = line.slice(i); } }
    }
    out.push(line);
  }
  return out;
}

export async function renderPropostaPdf(d: PropostaPdfData, logoBytes?: Uint8Array | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Proposta Comercial Nº ${d.numero} - ${d.cliente.razao}`);
  pdf.setAuthor("NitsClean");
  const R = await pdf.embedFont(StandardFonts.Helvetica);
  const B = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (logoBytes && logoBytes.length > 8) {
    try { logo = logoBytes[0] === 0x89 ? await pdf.embedPng(logoBytes) : logoBytes[0] === 0xff ? await pdf.embedJpg(logoBytes) : null; } catch { logo = null; }
  }
  const t = (p: PDFPage, s: string, x: number, y: number, size = 10, font = R, color = INK) => p.drawText(clean(s), { x, y, size, font, color });
  const right = (p: PDFPage, s: string, xr: number, y: number, size = 10, font = R, color = INK) => t(p, s, xr - font.widthOfTextAtSize(clean(s), size), y, size, font, color);
  const para = (p: PDFPage, s: string, x: number, y: number, max: number, size = 10, font = R, color = INK, lh = 1.45) => {
    for (const l of wrap(s, font, size, max)) { t(p, l, x, y, size, font, color); y -= size * lh; } return y;
  };
  const drawLogo = (p: PDFPage, x: number, yTop: number, maxW: number, maxH: number) => {
    if (!logo) { t(p, "NitsClean", x, yTop - maxH * 0.7, maxH * 0.6, B, TEAL); return; }
    const s = Math.min(maxW / logo.width, maxH / logo.height);
    p.drawImage(logo, { x, y: yTop - logo.height * s, width: logo.width * s, height: logo.height * s });
  };
  const num = `Nº ${String(d.numero).padStart(4, "0")}`;

  // 1) Cover
  {
    const p = pdf.addPage([W, H]);
    drawLogo(p, M, H - 60, 210, 90);
    p.drawRectangle({ x: M, y: H - 190, width: 46, height: 4, color: GREEN });
    t(p, d.config.slogan, M, H - 222, 22, B, NAVY);
    para(p, d.config.experiencia, M, H - 250, W - 2 * M, 13, R, TEAL);
    p.drawRectangle({ x: 0, y: 0, width: W, height: 430, color: NAVY });
    p.drawRectangle({ x: 0, y: 430, width: W, height: 6, color: GREEN });
    p.drawRectangle({ x: W - 150, y: 0, width: 150, height: 430, color: TEAL });
    p.drawRectangle({ x: W - 150, y: 0, width: 4, height: 430, color: LIGHT });
    t(p, "PROPOSTA", M, 330, 40, B, WHITE);
    t(p, "COMERCIAL", M, 286, 40, B, GREEN);
    p.drawRectangle({ x: M, y: 262, width: 60, height: 2, color: LIGHT });
    t(p, "PREPARADA PARA", M, 232, 9, B, LIGHT);
    let y = 212;
    for (const l of wrap(d.cliente.razao, B, 18, W - 2 * M - 160).slice(0, 3)) { t(p, l, M, y, 18, B, WHITE); y -= 24; }
    t(p, `${num}  ·  ${d.data}`, M, 70, 10, R, WHITE);
    t(p, `Válida até ${d.validade}`, M, 54, 10, R, LIGHT);
  }

  // Page frame for content pages
  let page!: PDFPage; let y = 0;
  const header = (p: PDFPage) => {
    drawLogo(p, M, H - 28, 90, 30);
    right(p, `Proposta Comercial ${num}`, W - M, H - 46, 9, B, NAVY);
    p.drawRectangle({ x: M, y: H - 70, width: W - 2 * M, height: 1, color: LINE });
    p.drawRectangle({ x: M, y: H - 71, width: 40, height: 3, color: GREEN });
  };
  const newPage = () => { page = pdf.addPage([W, H]); header(page); y = H - 105; };
  const ensure = (h: number) => { if (y - h < 70) newPage(); };
  const section = (title: string, kicker?: string) => {
    ensure(120);
    if (kicker) { t(page, kicker.toUpperCase(), M, y, 8, B, GREEN); y -= 20; }
    t(page, title, M, y, 17, B, NAVY); y -= 24;
  };

  // 2) Institutional
  newPage();
  t(page, "QUEM SOMOS", M, y, 8, B, GREEN); y -= 30;
  t(page, "Nit's Clean", M, y, 26, B, NAVY); y -= 26;
  y = para(page, d.config.txt_empresa, M, y, W - 2 * M, 11, R, INK, 1.55) - 22;
  const blocks: [string, string][] = [
    ["Parcerias com marcas líderes", d.config.txt_parcerias],
    ["Tecnologia", d.config.txt_tecnologia],
    ["Consultoria personalizada", d.config.txt_consultoria],
  ];
  for (const [title, body] of blocks) {
    const lines = wrap(body, R, 10.5, W - 2 * M - 34);
    let extra = 0;
    if (title.startsWith("Parcerias") && d.parceiros.length) extra = 14 + Math.ceil(d.parceiros.length / 4) * 26;
    const h = 46 + lines.length * 15 + extra;
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: SOFT });
    page.drawRectangle({ x: M, y: y - h, width: 4, height: h, color: GREEN });
    t(page, title, M + 20, y - 26, 13, B, TEAL);
    let yy = y - 46;
    for (const l of lines) { t(page, l, M + 20, yy, 10.5, R, INK); yy -= 15; }
    if (extra) {
      yy -= 6; const cw = (W - 2 * M - 40 - 18) / 4;
      d.parceiros.forEach((nome, i) => {
        const cx = M + 20 + (i % 4) * (cw + 6), cy = yy - Math.floor(i / 4) * 26;
        page.drawRectangle({ x: cx, y: cy - 8, width: cw, height: 20, color: WHITE, borderColor: LINE, borderWidth: 0.8 });
        let n = clean(nome).toUpperCase(); let s = 8;
        while (B.widthOfTextAtSize(n, s) > cw - 8 && s > 5.5) s -= 0.5;
        while (B.widthOfTextAtSize(n, s) > cw - 8 && n.length > 3) n = n.slice(0, -2) + "…";
        t(page, n, cx + (cw - B.widthOfTextAtSize(n, s)) / 2, cy - 1, s, B, NAVY);
      });
    }
    y -= h + 14;
  }
  // band
  const bandH = 64; const by = Math.max(80, y - bandH - 6);
  page.drawRectangle({ x: M, y: by, width: W - 2 * M, height: bandH, color: NAVY });
  page.drawRectangle({ x: M, y: by, width: W - 2 * M, height: 3, color: GREEN });
  const fl = wrap(d.config.faixa, B, 13, W - 2 * M - 40);
  fl.forEach((l, i) => t(page, l, M + (W - 2 * M - B.widthOfTextAtSize(l, 13)) / 2, by + bandH / 2 + (fl.length - 1) * 8 - i * 16 - 3, 13, B, WHITE));

  // 3) Proposal
  newPage();
  t(page, "PROPOSTA COMERCIAL", M, y, 8, B, GREEN);
  right(page, `${num}   ·   Emitida em ${d.data}   ·   Válida até ${d.validade}`, W - M, y, 8.5, R, MUTED);
  y -= 22;
  // client + consultant cards
  {
    const cw = (W - 2 * M - 14) / 2, h = 136, top = y;
    const card = (x: number, w: number, title: string, rows: [string, string][]) => {
      page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: LINE, borderWidth: 1, color: WHITE });
      page.drawRectangle({ x, y: top - 3, width: w, height: 3, color: title === "CLIENTE" ? TEAL : GREEN });
      t(page, title, x + 14, top - 22, 8, B, MUTED);
      let yy = top - 40;
      rows.forEach(([lab, val], i) => {
        if (i === 0) { for (const l of wrap(val, B, 11.5, w - 28).slice(0, 2)) { t(page, l, x + 14, yy, 11.5, B, NAVY); yy -= 15; } yy -= 2; return; }
        if (!val) return;
        t(page, lab, x + 14, yy, 8.5, B, MUTED);
        t(page, wrap(val, R, 9, w - 28 - 62)[0] ?? "", x + 14 + 62, yy, 9, R, INK); yy -= 13;
      });
    };
    const r = d.cliente.responsavel ?? {};
    card(M, cw, "CLIENTE", [["", d.cliente.razao], ["CNPJ", d.cliente.cnpj ?? ""], ["Responsável", r.nome ?? ""], ["E-mail", r.email ?? ""], ["Telefone", fmtTel(r.telefone)]]);
    card(M + cw + 14, cw, "CONSULTOR NITSCLEAN", [["", d.consultor.nome || "Equipe NitsClean"], ["Telefone", fmtTel(d.consultor.telefone)], ["WhatsApp", d.config.whatsapp], ...(siteVisivel(d.config.site) ? [["Site", d.config.site] as [string, string]] : [])]);
    y = top - h - 30;
  }

  type Col = { label: string; w: number; align?: "r" | "c" };
  const table = (cols: Col[], rows: string[][], opts: { bold?: number[] } = {}) => {
    const rowH = 24, total = cols.reduce((s, c) => s + c.w, 0), scale = (W - 2 * M) / total;
    const xs: number[] = []; let acc = M; for (const c of cols) { xs.push(acc); acc += c.w * scale; }
    const head = () => {
      page.drawRectangle({ x: M, y: y - rowH + 6, width: W - 2 * M, height: rowH, color: NAVY });
      cols.forEach((c, i) => { const cw = c.w * scale; const tx = c.align === "r" ? xs[i] + cw - 10 - B.widthOfTextAtSize(c.label, 8) : c.align === "c" ? xs[i] + (cw - B.widthOfTextAtSize(c.label, 8)) / 2 : xs[i] + 10; t(page, c.label, tx, y - 9, 8, B, WHITE); });
      y -= rowH;
    };
    ensure(rowH * 2 + 10); head();
    rows.forEach((row, ri) => {
      const wrapped = row.map((cell, i) => wrap(cell, opts.bold?.includes(i) ? B : R, 9, cols[i].w * scale - 20));
      const lines = Math.max(...wrapped.map((w) => w.length));
      const h = Math.max(rowH, 10 + lines * 12);
      if (y - h < 70) { newPage(); head(); }
      if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - h + 6, width: W - 2 * M, height: h, color: SOFT });
      wrapped.forEach((ls, i) => {
        const f = opts.bold?.includes(i) ? B : R; const cw = cols[i].w * scale;
        ls.forEach((l, li) => { const yy = y - 10 - li * 12; const tx = cols[i].align === "r" ? xs[i] + cw - 10 - f.widthOfTextAtSize(l, 9) : cols[i].align === "c" ? xs[i] + (cw - f.widthOfTextAtSize(l, 9)) / 2 : xs[i] + 10; t(page, l, tx, yy, 9, f, INK); });
      });
      y -= h;
      page.drawRectangle({ x: M, y: y + 6, width: W - 2 * M, height: 0.6, color: LINE });
    });
    y -= 18;
  };

  if (d.ambientes.length) {
    section("Solução por ambiente", "Pontos de higiene");
    table([{ label: "AMBIENTE", w: 3 }, { label: "APARELHO (COMODATO)", w: 3 }, { label: "PRODUTO / REFIL", w: 3.4 }, { label: "QTD", w: 1, align: "c" }],
      d.ambientes.map((a) => [a.local, a.aparelho || "-", a.produto || "-", a.quantidade || "-"]), { bold: [0] });
  }

  section("Produtos", "Investimento");
  table([{ label: "PRODUTO", w: 5 }, { label: "QTD", w: 1, align: "c" }, { label: "PREÇO UNIT.", w: 1.8, align: "r" }, { label: "DESC.", w: 1.1, align: "c" }, { label: "TOTAL", w: 1.9, align: "r" }],
    d.itens.map((i) => [i.descricao, String(i.quantidade).replace(".", ","), brl(i.preco), i.desconto ? `${String(i.desconto).replace(".", ",")}%` : "-", brl(i.total)]), { bold: [4] });
  {
    const hasDesc = d.descontoGeralPct > 0; const bh = hasDesc ? 82 : 56;
    ensure(bh + 10); y += 6;
    const bw = 250, bx = W - M - bw;
    page.drawRectangle({ x: bx, y: y - bh, width: bw, height: bh, color: TEAL });
    page.drawRectangle({ x: bx, y: y - bh, width: 5, height: bh, color: GREEN });
    let yy = y - 20;
    if (hasDesc) {
      t(page, "Subtotal", bx + 20, yy, 9, R, WHITE); right(page, brl(d.subtotal), W - M - 16, yy, 9, R, WHITE); yy -= 14;
      t(page, `Desconto (${String(d.descontoGeralPct).replace(".", ",")}%)`, bx + 20, yy, 9, R, WHITE); right(page, "- " + brl(d.subtotal - d.total), W - M - 16, yy, 9, R, WHITE); yy -= 10;
    }
    t(page, "TOTAL GERAL", bx + 20, y - bh + 20, 10, B, GREEN);
    right(page, brl(d.total), W - M - 16, y - bh + 17, 18, B, WHITE);
    y -= bh + 26;
  }

  if (d.comodatos.length) {
    section("Aparelhos em comodato", "Sem custo");
    table([{ label: "APARELHO", w: 6 }, { label: "QTD", w: 1, align: "c" }, { label: "VALOR", w: 2.4, align: "r" }],
      d.comodatos.map((c) => [c.descricao, String(c.quantidade), "sem custo (comodato)"]), { bold: [2] });
  }

  section("Condições comerciais");
  {
    const conds: [string, string][] = [
      ["Validade da proposta", `${d.condicoes.validade_dias} dias (até ${d.validade})`],
      ["Forma de pagamento", d.condicoes.forma_pagamento],
      ["Prazo de entrega", d.condicoes.prazo_entrega],
      ["Manutenção dos aparelhos", d.condicoes.periodicidade],
    ];
    const cw = (W - 2 * M - 12) / 2, h = 50;
    ensure(h * 2 + 20);
    conds.forEach(([k, v], i) => {
      const x = M + (i % 2) * (cw + 12), top = y - Math.floor(i / 2) * (h + 10);
      page.drawRectangle({ x, y: top - h, width: cw, height: h, color: SOFT });
      t(page, k.toUpperCase(), x + 14, top - 18, 7.5, B, TEAL);
      t(page, wrap(v, B, 10.5, cw - 28)[0] ?? "", x + 14, top - 36, 10.5, B, NAVY);
    });
    y -= 2 * (h + 10) + 20;
  }

  // 4) Acceptance
  ensure(210);
  section("Aceite da proposta");
  y = para(page, `Declaro estar de acordo com as condições desta proposta comercial ${num}.`, M, y, W - 2 * M, 10, R, MUTED) - 26;
  {
    const cw = (W - 2 * M - 30) / 2;
    const field = (x: number, yy: number, w: number, label: string) => { page.drawRectangle({ x, y: yy, width: w, height: 0.8, color: INK }); t(page, label, x, yy - 13, 8, B, MUTED); };
    field(M, y, cw, "NOME"); field(M + cw + 30, y, cw, "CARGO"); y -= 52;
    field(M, y, cw, "DATA"); field(M + cw + 30, y, cw, "ASSINATURA DO CLIENTE"); y -= 30;
  }

  // 5) Thank you
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WHITE });
    if (logo) { const s = Math.min(240 / logo.width, 110 / logo.height); drawLogo(p, (W - logo.width * s) / 2, H - 120, 240, 110); }
    else { const n = "NitsClean"; t(p, n, (W - B.widthOfTextAtSize(n, 40)) / 2, H - 200, 40, B, TEAL); }
    const ty = H - 330;
    const big = "Obrigado!"; t(p, big, (W - B.widthOfTextAtSize(big, 44)) / 2, ty, 44, B, NAVY);
    p.drawRectangle({ x: W / 2 - 30, y: ty - 22, width: 60, height: 4, color: GREEN });
    const sub = "Será um prazer cuidar da higiene do seu negócio."; t(p, sub, (W - R.widthOfTextAtSize(sub, 13)) / 2, ty - 52, 13, R, TEAL);
    p.drawRectangle({ x: 0, y: 0, width: W, height: 300, color: NAVY });
    p.drawRectangle({ x: 0, y: 300, width: W, height: 6, color: GREEN });
    const contatos: [string, string][] = [["WHATSAPP", d.config.whatsapp], ...(siteVisivel(d.config.site) ? [["SITE", d.config.site] as [string, string]] : []), ["INSTAGRAM", d.config.instagram]];
    const cw = (W - 2 * M) / 3;
    contatos.forEach(([k, v], i) => {
      const cx = M + i * cw + cw / 2;
      t(p, k, cx - B.widthOfTextAtSize(k, 8.5) / 2, 190, 8.5, B, GREEN);
      const vv = clean(v); let s = 13; while (B.widthOfTextAtSize(vv, s) > cw - 12 && s > 8) s -= 0.5;
      t(p, vv, cx - B.widthOfTextAtSize(vv, s) / 2, 168, s, B, WHITE);
    });
    const fx = clean(d.config.faixa); t(p, fx, (W - R.widthOfTextAtSize(fx, 10)) / 2, 80, 10, R, LIGHT);
  }

  // page numbers (skip cover and thanks)
  const pages = pdf.getPages();
  pages.forEach((p, i) => { if (i === 0 || i === pages.length - 1) return; right(p, `${i + 1} / ${pages.length}`, W - M, 34, 8, R, MUTED); t(p, "NitsClean" + (siteVisivel(d.config.site) ? " · " + d.config.site : ""), M, 34, 8, R, MUTED); });
  return await pdf.save();
}

/** The official site is not live yet: hide it when empty or still the default placeholder. */
export function siteVisivel(site: string | null | undefined): boolean {
  const v = (site ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return !!v && v !== "www.nitsclean.com.br" && v !== "nitsclean.com.br";
}
