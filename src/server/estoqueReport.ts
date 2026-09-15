/**
 * estoqueReport.ts
 * ---------------------------------------------------------------------------
 * Gerador do "Relatório de Controle de Estoque" (Munago) em PDF — mesma
 * identidade visual do recolhimentoReport.ts (capa escura/dourada + tabela
 * clara), adaptado pra inventário de peças em vez de recolhimentos.
 * Motor de PDF (Puppeteer) compartilhado em pdfEngine.ts.
 * ---------------------------------------------------------------------------
 */

import { launchBrowser, renderHtmlToPdf } from "./pdfEngine.js";

export interface EstoqueRecord {
  codigo: string;
  descricao: string;
  marca: string;
  endereco: string;
  unidade: string;
  custo: number;
  venda: number;
  status: string;
  qtdVision: number;
  qtdFisico: number;
}

export interface BuildEstoqueReportOptions {
  generatedAt?: Date;
  title?: string;
  lede?: string;
}

function fmtMoney(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function logoSvg(size = 40): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo-icon">
    <path d="M32 4C19.85 4 10 13.85 10 26c0 16 22 34 22 34s22-18 22-34C54 13.85 44.15 4 32 4z" fill="url(#pinGrad)"/>
    <path d="M22.5 27.5l6 6.5 12.5-13.5" stroke="#0c0c0b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <defs>
      <linearGradient id="pinGrad" x1="10" y1="4" x2="54" y2="60" gradientUnits="userSpaceOnUse">
        <stop stop-color="#f0c869"/>
        <stop offset="1" stop-color="#c9971f"/>
      </linearGradient>
    </defs>
  </svg>`;
}

const diff = (r: EstoqueRecord) => r.qtdFisico - r.qtdVision;

export function buildEstoqueReportHtml(records: EstoqueRecord[], opts: BuildEstoqueReportOptions = {}): string {
  const generatedAt = opts.generatedAt ?? new Date();
  const generatedAtStr = generatedAt
    .toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    })
    .replace(",", " às");

  const totalItens = records.length;
  const valorEstoque = records.reduce((s, r) => s + r.custo * r.qtdFisico, 0);
  const divergentes = records.filter((r) => diff(r) !== 0);
  const sobras = divergentes.filter((r) => diff(r) > 0);
  const faltas = divergentes.filter((r) => diff(r) < 0);
  const valorSobras = sobras.reduce((s, r) => s + diff(r) * r.venda, 0);
  const valorFaltas = faltas.reduce((s, r) => s + diff(r) * r.venda, 0);

  // Top marcas por valor em estoque (custo x qtd físico) — mesmo papel do
  // "por unidade" no relatório de recolhimento, só que aqui é por marca.
  const marcaAgg: Record<string, { count: number; valor: number }> = {};
  for (const r of records) {
    const key = r.marca || "Sem marca";
    if (!marcaAgg[key]) marcaAgg[key] = { count: 0, valor: 0 };
    marcaAgg[key].count += 1;
    marcaAgg[key].valor += r.custo * r.qtdFisico;
  }
  const topMarcas = Object.entries(marcaAgg)
    .sort((a, b) => b[1].valor - a[1].valor)
    .slice(0, 6);
  const maxMarcaValor = Math.max(1, ...topMarcas.map(([, v]) => v.valor));

  function kpiCard(label: string, value: string, sub: string, cls = ""): string {
    return `<div class="kpi ${cls}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`;
  }

  function marcaBar([marca, v]: [string, { count: number; valor: number }]): string {
    const pct = (v.valor / maxMarcaValor) * 100;
    return `<div class="unit-row">
      <div class="unit-name">${escapeHtml(marca)}</div>
      <div class="unit-bar-track"><div class="unit-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="unit-figures"><span class="unit-count">${v.count} itens</span><span class="unit-valor">R$ ${fmtMoney(v.valor)}</span></div>
    </div>`;
  }

  const coverHtml = `
  <section class="cover">
    <div class="cover-top">
      <div class="brand">
        ${logoSvg(56)}
        <div class="brand-text">
          <div class="brand-name">Munago</div>
          <div class="brand-sub">Sistema de Controle e Recolhimento</div>
        </div>
      </div>
      <div class="cover-meta">
        <div>Gerado em ${generatedAtStr}</div>
      </div>
    </div>

    <h1 class="cover-title">${escapeHtml(opts.title ?? "Relatório de Controle\nde Estoque").split("\n").join("<br/>")}</h1>
    <p class="cover-lede">${escapeHtml(opts.lede ?? "Inventário de peças — quantidade Vision (sistema) x físico (contagem).")}</p>

    <div class="kpi-grid">
      ${kpiCard("Total de itens", `${totalItens}`, "no inventário")}
      ${kpiCard("Valor em estoque", `R$ ${fmtMoney(valorEstoque)}`, "custo × qtd. física", "kpi-primary")}
      ${kpiCard("Divergências", `${divergentes.length}`, "físico ≠ Vision", "kpi-wait")}
      ${kpiCard("Sobras", `R$ ${fmtMoney(valorSobras)}`, `${sobras.length} itens`, "kpi-ok")}
      ${kpiCard("Faltas", `R$ ${fmtMoney(valorFaltas)}`, `${faltas.length} itens`, "kpi-confirmed")}
    </div>

    ${topMarcas.length > 0 ? `
    <div class="panel unit-panel">
      <div class="unit-panel-title">Maiores valores por marca</div>
      ${topMarcas.map(marcaBar).join("")}
    </div>
    ` : ""}

    <div class="cover-footer">Documento gerado automaticamente a partir do inventário de estoque Munago · Todos os valores em Reais (R$)</div>
  </section>`;

  const sortedRecords = [...records].sort((a, b) => a.descricao.localeCompare(b.descricao));

  const trs = sortedRecords
    .map((r) => {
      const d = diff(r);
      const diffCls = d > 0 ? "diff-pos" : d < 0 ? "diff-neg" : "diff-zero";
      const statusCls = r.status === "Ativo" ? "st-ok" : "st-wait";
      return `<tr>
        <td class="col-codigo">${escapeHtml(r.codigo || "—")}</td>
        <td class="col-desc">
          <div class="fq-name">${escapeHtml(r.descricao)}</div>
          <div class="fq-cnpj">${escapeHtml(r.marca || "—")}${r.endereco ? ` · ${escapeHtml(r.endereco)}` : ""}</div>
        </td>
        <td class="col-valor">R$ ${fmtMoney(r.custo)}</td>
        <td class="col-valor">R$ ${fmtMoney(r.venda)}</td>
        <td class="col-status"><span class="pill ${statusCls}">${escapeHtml(r.status)}</span></td>
        <td class="col-qtd">${r.qtdVision}</td>
        <td class="col-qtd">${r.qtdFisico}</td>
        <td class="col-qtd ${diffCls}">${d > 0 ? `+${d}` : d}</td>
      </tr>`;
    })
    .join("");

  const sectionHtml = `
  <section class="unit-section">
    <div class="unit-header">
      <div class="unit-header-left">
        ${logoSvg(22)}
        <span class="unit-header-title">Itens do Estoque</span>
      </div>
      <div class="unit-header-right">
        <span>${totalItens} itens</span>
        <span class="dot">•</span>
        <span>R$ ${fmtMoney(valorEstoque)}</span>
      </div>
    </div>
    <table class="report-table">
      <thead>
        <tr>
          <th class="col-codigo">Código</th>
          <th class="col-desc">Descrição</th>
          <th class="col-valor">Custo</th>
          <th class="col-valor">Venda</th>
          <th class="col-status">Status</th>
          <th class="col-qtd">Vision</th>
          <th class="col-qtd">Físico</th>
          <th class="col-qtd">Dif.</th>
        </tr>
      </thead>
      <tbody>
        ${trs}
      </tbody>
    </table>
  </section>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Relatório de Controle de Estoque — Munago</title>
<style>
${REPORT_CSS}
</style>
</head>
<body>
${coverHtml}
${sectionHtml}
<div class="footer-strip">
  <span>Munago · Sistema de Controle e Recolhimento</span>
  <span>Relatório gerado em ${generatedAtStr} · ${totalItens} itens · R$ ${fmtMoney(valorEstoque)}</span>
</div>
</body>
</html>`;
}

// Mesma identidade visual do recolhimentoReport.ts (mesmas classes .cover/
// .kpi/.panel/.report-table etc), com colunas próprias (.col-codigo,
// .col-qtd) no lugar das de recolhimento.
const REPORT_CSS = `
@page {
  size: 297mm 210mm;
  margin: 0;
}

:root {
  --ink: #16181c;
  --ink-soft: #565c66;
  --ink-faint: #8b909b;
  --gold: #c9971f;
  --gold-light: #f0c869;
  --navy: #10131a;
  --line: #e4e2dc;
  --paper: #fbfaf7;
  --ok-bg: #e7f4ec; --ok-fg: #1c7a44;
  --wait-bg: #fbf1de; --wait-fg: #9a6a10;
  --confirmed-bg: #e8edfb; --confirmed-fg: #33459c;
}

* { box-sizing: border-box; }

html, body {
  margin: 0; padding: 0;
  font-family: 'Inter', -apple-system, 'Segoe UI', Arial, sans-serif;
  color: var(--ink);
  background: var(--paper);
  font-size: 12px;
}

.cover {
  width: 297mm; height: 210mm;
  background: radial-gradient(120% 140% at 15% 0%, #1c2030 0%, #0c0c0b 55%, #0a0a09 100%);
  color: #f4f1e9;
  padding: 16mm 18mm 12mm;
  position: relative;
  display: flex;
  flex-direction: column;
  page-break-after: always;
}

.cover-top { display: flex; justify-content: space-between; align-items: flex-start; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-name { font-size: 22px; font-weight: 700; letter-spacing: 0.3px; color: #f7efd9; }
.brand-sub { font-size: 10.5px; color: #b9b2a0; margin-top: 1px; }
.cover-meta { text-align: right; font-size: 10.5px; color: #b9b2a0; line-height: 1.7; }

.cover-title {
  font-size: 34px; font-weight: 700; line-height: 1.18;
  margin: 20px 0 6px; color: #ffffff; letter-spacing: -0.3px;
}
.cover-lede { font-size: 12.5px; color: #c9c3b3; margin: 0 0 18px; max-width: 460px; }

.kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
.kpi {
  background: rgba(255,255,255,0.045);
  border: 1px solid rgba(240, 200, 105, 0.18);
  border-radius: 10px;
  padding: 12px 13px;
}
.kpi-primary { background: linear-gradient(160deg, rgba(240,200,105,0.16), rgba(240,200,105,0.04)); border-color: rgba(240,200,105,0.45); }
.kpi-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #c9c3b3; margin-bottom: 6px; }
.kpi-value { font-size: 18px; font-weight: 700; color: #ffffff; }
.kpi-primary .kpi-value { color: var(--gold-light); }
.kpi-sub { font-size: 9.5px; color: #8f8977; margin-top: 4px; }

.panel {
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 14px 18px 12px;
}
.unit-panel { display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.unit-panel-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #b9b2a0; margin-bottom: 10px; }
.unit-row { display: flex; align-items: center; gap: 14px; padding: 7px 0; }
.unit-name { width: 140px; font-size: 12px; font-weight: 600; color: #f0ede3; }
.unit-bar-track { flex: 1; height: 9px; background: rgba(255,255,255,0.08); border-radius: 5px; overflow: hidden; }
.unit-bar-fill { height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-light)); border-radius: 5px; }
.unit-figures { width: 190px; display: flex; justify-content: space-between; font-size: 11px; flex-shrink: 0; }
.unit-count { color: #a9a390; }
.unit-valor { color: #f0ede3; font-weight: 600; font-variant-numeric: tabular-nums; }

.cover-footer { margin-top: auto; padding-top: 12px; font-size: 9px; color: #6f6a5c; border-top: 1px solid rgba(255,255,255,0.08); }

.unit-section { padding: 8mm 12mm 10mm; }

.unit-header {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--navy); color: #f4f1e9; border-radius: 8px; padding: 8px 14px; margin-bottom: 6px;
}
.unit-header-left { display: flex; align-items: center; gap: 9px; }
.unit-header-title { font-size: 14px; font-weight: 700; letter-spacing: 0.2px; }
.unit-header-right { font-size: 10.5px; color: #d8c592; display: flex; gap: 8px; align-items: center; }
.unit-header-right .dot { color: #6b6558; }

table.report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.report-table thead { display: table-header-group; }
.report-table tr { page-break-inside: avoid; }

.report-table th {
  text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px;
  color: var(--ink-soft); border-bottom: 1.5px solid var(--navy); padding: 5px 8px 5px; background: #eeece5;
}
.report-table td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 10.5px; overflow: hidden; }
.report-table tbody tr:nth-child(even) { background: #f2f1eb; }

.col-codigo { width: 13%; font-variant-numeric: tabular-nums; color: var(--ink-faint); }
.col-desc { width: 37%; }
.col-valor { width: 10%; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.col-status { width: 10%; }
.col-qtd { width: 7%; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
th.col-valor, th.col-qtd { text-align: right; }

.diff-pos { color: var(--ok-fg); }
.diff-neg { color: #b3352f; }
.diff-zero { color: var(--ink-faint); font-weight: 400; }

.fq-name { font-weight: 600; color: var(--ink); }
.fq-cnpj { font-size: 9px; color: var(--ink-faint); margin-top: 1px; }

.pill { display: inline-block; font-size: 9.5px; font-weight: 600; padding: 2.5px 8px; border-radius: 20px; white-space: nowrap; }
.st-ok { background: var(--ok-bg); color: var(--ok-fg); }
.st-wait { background: var(--wait-bg); color: var(--wait-fg); }
.st-confirmed { background: var(--confirmed-bg); color: var(--confirmed-fg); }

.footer-strip { display: flex; justify-content: space-between; font-size: 8.5px; color: var(--ink-faint); padding: 4mm 12mm 0; }
`;

export async function generateEstoqueReportPdf(
  records: EstoqueRecord[],
  opts: BuildEstoqueReportOptions = {}
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const html = buildEstoqueReportHtml(records, opts);
    return await renderHtmlToPdf(browser, html, "estoqueReport");
  } finally {
    await browser.close();
  }
}
