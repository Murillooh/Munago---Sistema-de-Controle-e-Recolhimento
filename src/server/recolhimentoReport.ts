/**
 * recolhimentoReport.ts
 * ---------------------------------------------------------------------------
 * Gerador do "Relatório de Controle de Recolhimento" (Munago) em PDF.
 *
 * Este módulo é autocontido: monta o HTML do relatório (capa com KPIs +
 * gráficos, seguida das tabelas agrupadas por unidade) e renderiza em PDF
 * via Puppeteer (headless Chromium). Roda só no servidor — usa Node/Chromium,
 * não dá pra chamar isso do navegador.
 *
 * Dependências: puppeteer-core + @sparticuz/chromium (não "puppeteer" puro).
 * Puppeteer completo baixa ~300MB de Chromium embutido e não cabe no limite
 * de tamanho de função serverless da Vercel; @sparticuz/chromium é um binário
 * Linux enxuto feito pra isso. Em desenvolvimento local (Windows/Mac/Linux),
 * usa o Chrome/Edge já instalado na máquina — ver `launchBrowser()`.
 *
 * Uso básico:
 *
 *   import { generateRecolhimentoReportPdf, RecolhimentoRecord } from "./recolhimentoReport";
 *
 *   const records: RecolhimentoRecord[] = mapearDoBanco(rows);
 *   const pdfBuffer = await generateRecolhimentoReportPdf(records);
 *   res.setHeader("Content-Type", "application/pdf");
 *   res.send(pdfBuffer);
 * ---------------------------------------------------------------------------
 */

import { existsSync } from "fs";
import puppeteer, { Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// ============================================================================
// Tipos
// ============================================================================

/** Status possíveis de um lançamento de recolhimento. */
export type RecolhimentoStatus = "Recebida" | "Confirmada" | "Aguardando pagamento" | string;

/**
 * Um registro (linha) do relatório. Mapeie os campos do seu banco/Prisma
 * para esta forma antes de chamar `buildRecolhimentoReportHtml` /
 * `generateRecolhimentoReportPdf`.
 */
export interface RecolhimentoRecord {
  /** Razão social da franquia. */
  franquia: string;
  /** CNPJ (com ou sem máscara — a máscara é reaplicada na formatação). */
  cnpj: string;
  /** Centro de custo / unidade (ex.: "BARUERI", "CANINDÉ", "LIMÃO", "ZONA SUL"). */
  ccusto: string;
  /** Data de vencimento, formato dd/mm/aaaa. */
  vencimento: string;
  /** Data de vencimento original, se houve renegociação (opcional). */
  vencOrig?: string;
  /** Data em que o pagamento foi efetuado (opcional; ausente = não pago). */
  pagamento?: string;
  /** Valor do lançamento em Reais (número, não string). */
  valor: number;
  /** Status atual do lançamento. */
  status: RecolhimentoStatus;
  /** Competência de referência do recolhimento, formato "mmm/aa" (ex.: "jul/26"). */
  compRec: string;
  /** Competência em que o pagamento caiu, formato "mmm/aa" (opcional). */
  compPag?: string;
  /** Texto livre com o detalhamento do recolhimento (kits/tickets, datas, valores). */
  descricao: string;
}

export interface BuildReportOptions {
  /** Data/hora exibida como "Gerado em ..." (default: agora). */
  generatedAt?: Date;
  /** Ordem preferencial das unidades nas seções (as demais entram depois, em ordem de aparição). */
  unitOrder?: string[];
  /** Título principal do relatório. */
  title?: string;
  /** Subtítulo abaixo do título. */
  lede?: string;
}

interface AggBucket {
  count: number;
  valor: number;
}

// ============================================================================
// Helpers de formatação
// ============================================================================

function fmtMoney(v: number): string {
  const s = v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return s;
}

function fmtCnpj(cnpjRaw: string): string {
  const digits = (cnpjRaw || "").replace(/\D/g, "");
  if (digits.length !== 14) return cnpjRaw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MONTHS_PT: Record<string, string> = {
  jan: "Janeiro", fev: "Fevereiro", mar: "Março", abr: "Abril",
  mai: "Maio", jun: "Junho", jul: "Julho", ago: "Agosto",
  set: "Setembro", out: "Outubro", nov: "Novembro", dez: "Dezembro",
};

const MONTH_IDX: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function compLabel(c?: string): string {
  if (!c || c === "-") return "—";
  const [m, y] = c.split("/");
  return `${MONTHS_PT[m] ?? m}/${y}`;
}

// ============================================================================
// Status → cores (pill na tabela + barra na capa)
// ============================================================================

const STATUS_META: Record<string, { cls: string; label: string }> = {
  Recebida: { cls: "st-ok", label: "Recebida" },
  Confirmada: { cls: "st-confirmed", label: "Confirmada" },
  "Aguardando pagamento": { cls: "st-wait", label: "Aguardando pagamento" },
};

const STATUS_ORDER: string[] = ["Recebida", "Confirmada", "Aguardando pagamento"];

const STATUS_BAR_COLORS: Record<string, [string, string]> = {
  Recebida: ["#1c7a44", "#5fbf85"],
  Confirmada: ["#33459c", "#7a8ce0"],
  "Aguardando pagamento": ["#c9971f", "#f0c869"],
};

function statusPill(status: string): string {
  const meta = STATUS_META[status] ?? { cls: "st-wait", label: status };
  return `<span class="pill ${meta.cls}">${escapeHtml(meta.label)}</span>`;
}

// ============================================================================
// Ícone/logo (pin com check, gradiente dourado)
// ============================================================================

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

// ============================================================================
// Parser de descrição → "lead" (frase inicial) + "chips" (kits/tickets)
// ============================================================================

const YEAR_RE = /20\d{2}/;

function descricaoHtml(desc: string): string {
  const m = YEAR_RE.exec(desc || "");
  if (!m) {
    return `<span class="desc-lead">${escapeHtml(desc || "")}</span>`;
  }
  const cut = m.index + m[0].length;
  const lead = desc.slice(0, cut);
  let rest = desc.slice(cut).replace(/^[\s.:;-]+/, "");
  if (!rest) {
    return `<span class="desc-lead">${escapeHtml(lead)}</span>`;
  }
  const rawChips = rest.includes(";") ? rest.split(";") : [rest];
  const chips: string[] = [];
  for (let c of rawChips) {
    c = c.replace(/^[\s\-;,]+|[\s\-;,]+$/g, "");
    c = c.replace(/\s*-\s*/g, " · ");
    c = c.replace(/\s+/g, " ").trim();
    if (c) chips.push(c);
  }
  let out = `<span class="desc-lead">${escapeHtml(lead)}</span>`;
  if (chips.length) {
    out += `<div class="desc-tickets">${chips.map((c) => `<span class="ticket">${escapeHtml(c)}</span>`).join("")}</div>`;
  }
  return out;
}

// ============================================================================
// Agregações
// ============================================================================

function bump(bucket: Record<string, AggBucket>, key: string, valor: number) {
  if (!bucket[key]) bucket[key] = { count: 0, valor: 0 };
  bucket[key].count += 1;
  bucket[key].valor += valor;
}

// ============================================================================
// Construção do HTML
// ============================================================================

export function buildRecolhimentoReportHtml(
  records: RecolhimentoRecord[],
  opts: BuildReportOptions = {}
): string {
  const generatedAt = opts.generatedAt ?? new Date();
  // Sem timeZone explícito, isso usa o fuso do processo Node — na Vercel é
  // UTC, então o horário saía 3h à frente do horário do Brasil.
  const generatedAtStr = generatedAt.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).replace(",", " às");

  const totalValor = records.reduce((acc, x) => acc + x.valor, 0);
  const totalRegistros = records.length;
  const uniqueFranquias = new Set(records.map((x) => x.franquia)).size;

  const statusAgg: Record<string, AggBucket> = {};
  const unitAgg: Record<string, AggBucket> = {};
  const compAgg: Record<string, AggBucket> = {};

  for (const x of records) {
    bump(statusAgg, x.status, x.valor);
    bump(unitAgg, x.ccusto, x.valor);
    if (x.compRec && x.compRec !== "-") bump(compAgg, x.compRec, x.valor);
  }

  const compValues = Object.keys(compAgg).sort((a, b) => {
    const [ma, ya] = a.split("/");
    const [mb, yb] = b.split("/");
    if (ya !== yb) return ya.localeCompare(yb);
    return (MONTH_IDX[ma] ?? 0) - (MONTH_IDX[mb] ?? 0);
  });
  const periodoIni = compValues.length ? compLabel(compValues[0]) : "—";
  const periodoFim = compValues.length ? compLabel(compValues[compValues.length - 1]) : "—";
  const maxCompCount = Math.max(1, ...compValues.map((c) => compAgg[c].count));

  const DEFAULT_UNIT_ORDER = ["BARUERI", "CANINDÉ", "LIMÃO", "ZONA SUL"];
  const unitOrder = opts.unitOrder ?? DEFAULT_UNIT_ORDER;
  const unitsPresent = [
    ...unitOrder.filter((u) => unitAgg[u]),
    ...Object.keys(unitAgg).filter((u) => !unitOrder.includes(u)),
  ];

  const maxUnitValor = Math.max(1, ...Object.values(unitAgg).map((v) => v.valor));
  const maxStatusValor = Math.max(1, ...Object.values(statusAgg).map((v) => v.valor));

  const avgValor = totalRegistros ? totalValor / totalRegistros : 0;
  const maxEntry = records.reduce((a, b) => (b.valor > a.valor ? b : a), records[0]);

  function unitTitle(u: string): string {
    return u === "ZONA SUL" ? "Zona Sul" : u.charAt(0) + u.slice(1).toLowerCase();
  }

  // -- pequenos componentes ---------------------------------------------------

  function kpiCard(label: string, value: string, sub: string, cls = ""): string {
    return `<div class="kpi ${cls}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`;
  }

  function unitBar(unit: string): string {
    const v = unitAgg[unit];
    const pct = (v.valor / maxUnitValor) * 100;
    return `<div class="unit-row">
      <div class="unit-name">${escapeHtml(unitTitle(unit))}</div>
      <div class="unit-bar-track"><div class="unit-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="unit-figures"><span class="unit-count">${v.count} reg.</span><span class="unit-valor">R$ ${fmtMoney(v.valor)}</span></div>
    </div>`;
  }

  function statusBar(status: string): string {
    const v = statusAgg[status] ?? { count: 0, valor: 0 };
    const pct = (v.valor / maxStatusValor) * 100;
    const [c1, c2] = STATUS_BAR_COLORS[status] ?? ["#c9971f", "#f0c869"];
    return `<div class="unit-row">
      <div class="unit-name status-name">${escapeHtml(status)}</div>
      <div class="unit-bar-track"><div class="unit-bar-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,${c1},${c2})"></div></div>
      <div class="unit-figures"><span class="unit-count">${v.count} reg.</span><span class="unit-valor">R$ ${fmtMoney(v.valor)}</span></div>
    </div>`;
  }

  function compBar(comp: string): string {
    const v = compAgg[comp];
    const pct = Math.max((v.count / maxCompCount) * 100, 6);
    const m = comp.split("/")[0];
    const label = (MONTHS_PT[m] ?? m).slice(0, 3);
    return `<div class="comp-col">
      <div class="comp-track"><div class="comp-fill" style="height:${pct.toFixed(1)}%"></div></div>
      <div class="comp-count">${v.count}</div>
      <div class="comp-label">${escapeHtml(label)}</div>
    </div>`;
  }

  // -- capa --------------------------------------------------------------------

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
        <div>Período de referência: ${periodoIni} – ${periodoFim}</div>
      </div>
    </div>

    <h1 class="cover-title">${escapeHtml(opts.title ?? "Relatório de Controle\nde Recolhimento").split("\n").join("<br/>")}</h1>
    <p class="cover-lede">${escapeHtml(opts.lede ?? "Consolidação de taxas de recolhimento por franquia, unidade e competência.")}</p>

    <div class="kpi-grid">
      ${kpiCard("Total de registros", `${totalRegistros}`, `${uniqueFranquias} franquias distintas`)}
      ${kpiCard("Valor total", `R$ ${fmtMoney(totalValor)}`, "soma de todos os lançamentos", "kpi-primary")}
      ${kpiCard("Recebida", `R$ ${fmtMoney(statusAgg["Recebida"]?.valor ?? 0)}`, `${statusAgg["Recebida"]?.count ?? 0} registros`, "kpi-ok")}
      ${kpiCard("Confirmada", `R$ ${fmtMoney(statusAgg["Confirmada"]?.valor ?? 0)}`, `${statusAgg["Confirmada"]?.count ?? 0} registros`, "kpi-confirmed")}
      ${kpiCard("Aguardando pagamento", `R$ ${fmtMoney(statusAgg["Aguardando pagamento"]?.valor ?? 0)}`, `${statusAgg["Aguardando pagamento"]?.count ?? 0} registros`, "kpi-wait")}
    </div>

    <div class="cover-panels">
      <div class="panel unit-panel">
        <div class="unit-panel-title">Distribuição por unidade</div>
        ${unitsPresent.map(unitBar).join("")}
      </div>

      <div class="panel status-panel">
        <div class="unit-panel-title">Distribuição por status</div>
        ${STATUS_ORDER.filter((s) => statusAgg[s]).map(statusBar).join("")}
        <div class="stat-row-grid">
          <div class="stat-mini">
            <div class="stat-mini-label">Ticket médio</div>
            <div class="stat-mini-value">R$ ${fmtMoney(avgValor)}</div>
          </div>
          <div class="stat-mini">
            <div class="stat-mini-label">Maior lançamento</div>
            <div class="stat-mini-value">R$ ${fmtMoney(maxEntry?.valor ?? 0)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel comp-panel">
      <div class="unit-panel-title">Registros por competência</div>
      <div class="comp-strip">
        ${compValues.map(compBar).join("")}
      </div>
    </div>

    <div class="cover-footer">Documento gerado automaticamente a partir da base de recolhimento Munago · Todos os valores em Reais (R$)</div>
  </section>`;

  // -- seções (tabelas por unidade) --------------------------------------------

  function sortKey(x: RecolhimentoRecord): string {
    return `${x.franquia.toUpperCase()}|${x.vencimento}`;
  }

  const sectionsHtml = unitsPresent
    .map((unit) => {
      const rows = records.filter((x) => x.ccusto === unit).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
      const agg = unitAgg[unit];

      const trs = rows
        .map((x) => {
          const vencNote =
            x.vencOrig && x.vencOrig !== x.vencimento
              ? `<div class="cell-note">orig.: ${escapeHtml(x.vencOrig)}</div>`
              : "";
          const pagLine = x.pagamento && x.pagamento !== "-" ? x.pagamento : "—";
          const compLine = compLabel(x.compRec);
          const compPag = x.compPag && x.compPag !== "-" ? x.compPag : null;

          return `<tr>
            <td class="col-franquia">
              <div class="fq-name">${escapeHtml(x.franquia)}</div>
              <div class="fq-cnpj">${escapeHtml(fmtCnpj(x.cnpj))}</div>
            </td>
            <td class="col-venc">${escapeHtml(x.vencimento)}${vencNote}</td>
            <td class="col-valor">R$ ${fmtMoney(x.valor)}</td>
            <td class="col-status">${statusPill(x.status)}</td>
            <td class="col-pag">
              <div>${escapeHtml(pagLine)}</div>
              <div class="cell-note">comp. ${compLine}${compPag ? ` → pago ${escapeHtml(compPag)}` : ""}</div>
            </td>
            <td class="col-desc">${descricaoHtml(x.descricao)}</td>
          </tr>`;
        })
        .join("");

      return `
      <section class="unit-section">
        <div class="unit-header">
          <div class="unit-header-left">
            ${logoSvg(22)}
            <span class="unit-header-title">${escapeHtml(unitTitle(unit))}</span>
          </div>
          <div class="unit-header-right">
            <span>${agg.count} registros</span>
            <span class="dot">•</span>
            <span>R$ ${fmtMoney(agg.valor)}</span>
          </div>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th class="col-franquia">Franquia</th>
              <th class="col-venc">Vencimento</th>
              <th class="col-valor">Valor</th>
              <th class="col-status">Status</th>
              <th class="col-pag">Pagamento</th>
              <th class="col-desc">Descrição do recolhimento</th>
            </tr>
          </thead>
          <tbody>
            ${trs}
          </tbody>
        </table>
      </section>`;
    })
    .join("");

  // -- documento completo -------------------------------------------------------

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Relatório de Controle de Recolhimento — Munago</title>
<style>
${REPORT_CSS}
</style>
</head>
<body>
${coverHtml}
${sectionsHtml}
<div class="footer-strip">
  <span>Munago · Sistema de Controle e Recolhimento</span>
  <span>Relatório gerado em ${generatedAtStr} · ${totalRegistros} registros · R$ ${fmtMoney(totalValor)}</span>
</div>
</body>
</html>`;
}

// ============================================================================
// CSS (idêntico ao design aprovado: capa escura/dourada + tabelas claras)
// ============================================================================

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

/* ---------------- CAPA ---------------- */
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

.cover-panels { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; flex: 1; min-height: 0; }

.panel {
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 14px 18px 12px;
}
.unit-panel { display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.status-panel { display: flex; flex-direction: column; }
.unit-panel-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #b9b2a0; margin-bottom: 10px; }
.unit-row { display: flex; align-items: center; gap: 14px; padding: 7px 0; }
.unit-name { width: 90px; font-size: 12px; font-weight: 600; color: #f0ede3; }
.status-name { width: 135px; font-size: 11px; }
.unit-bar-track { flex: 1; height: 9px; background: rgba(255,255,255,0.08); border-radius: 5px; overflow: hidden; }
.unit-bar-fill { height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-light)); border-radius: 5px; }
.unit-figures { width: 190px; display: flex; justify-content: space-between; font-size: 11px; flex-shrink: 0; }
.unit-count { color: #a9a390; }
.unit-valor { color: #f0ede3; font-weight: 600; font-variant-numeric: tabular-nums; }

.stat-row-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);
}
.stat-mini-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; color: #a9a390; margin-bottom: 4px; }
.stat-mini-value { font-size: 15px; font-weight: 700; color: #f0ede3; font-variant-numeric: tabular-nums; }

.comp-panel { margin-top: 14px; }
.comp-strip { display: flex; align-items: flex-end; gap: 10px; height: 64px; }
.comp-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.comp-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.comp-fill { width: 100%; background: linear-gradient(180deg, var(--gold-light), var(--gold)); border-radius: 4px 4px 2px 2px; min-height: 4px; }
.comp-count { font-size: 10px; font-weight: 700; color: #f0ede3; margin-top: 4px; }
.comp-label { font-size: 9px; color: #a9a390; text-transform: uppercase; margin-top: 1px; }

.cover-footer { margin-top: 12px; font-size: 9px; color: #6f6a5c; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px; }

/* ---------------- SEÇÕES / TABELAS ---------------- */
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
.report-table td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 10.5px; }
.report-table tbody tr:nth-child(even) { background: #f2f1eb; }

.col-franquia { width: 20%; }
.col-venc { width: 9%; }
.col-valor { width: 9%; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.col-status { width: 13%; }
.col-pag { width: 11%; }
.col-desc { width: 38%; }
th.col-valor { text-align: right; }

.fq-name { font-weight: 600; color: var(--ink); }
.fq-cnpj { font-size: 9px; color: var(--ink-faint); font-variant-numeric: tabular-nums; margin-top: 1px; }
.cell-note { font-size: 9px; color: var(--ink-faint); margin-top: 2px; }

.pill { display: inline-block; font-size: 9.5px; font-weight: 600; padding: 2.5px 8px; border-radius: 20px; white-space: nowrap; }
.st-ok { background: var(--ok-bg); color: var(--ok-fg); }
.st-wait { background: var(--wait-bg); color: var(--wait-fg); }
.st-confirmed { background: var(--confirmed-bg); color: var(--confirmed-fg); }

.desc-lead { color: var(--ink); }
.desc-tickets { margin-top: 3px; display: flex; flex-wrap: wrap; gap: 3px; }
.ticket {
  font-family: 'SFMono-Regular', Consolas, monospace; font-size: 8.6px; color: #6b5410;
  background: #f5ecd4; border: 1px solid #e7d7a3; border-radius: 4px; padding: 1px 5px; white-space: nowrap;
}

.footer-strip { display: flex; justify-content: space-between; font-size: 8.5px; color: var(--ink-faint); padding: 4mm 12mm 0; }
`;

// ============================================================================
// Lançamento do Chromium: @sparticuz/chromium na Vercel/Lambda (Linux),
// Chrome/Edge instalado localmente em dev (Windows/Mac/Linux) — o binário
// do @sparticuz/chromium é Linux-only, não roda fora de serverless.
// ============================================================================

function findLocalChrome(): string | null {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/chromium-browser",
          "/usr/bin/chromium",
        ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

// Sem isso, o viewport padrão do puppeteer-core é 800x600px — bem menor que
// os 297mm (~1123px a 96dpi) da página em paisagem. Com o Chromium "shell"
// do @sparticuz/chromium (usado na Vercel), isso fez o layout calcular a
// largura de grid/flex com base nesse viewport pequeno, deixando a página
// impressa com a capa encolhida num canto e o resto em branco — o Chrome
// completo (usado no dev local) não tinha esse problema, então só apareceu
// em produção. Um viewport maior que o conteúdo remove essa ambiguidade.
const PRINT_VIEWPORT = { width: 1754, height: 1240 };

async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      defaultViewport: PRINT_VIEWPORT,
      headless: true,
    });
  }

  const localExecutable = process.env.PUPPETEER_EXECUTABLE_PATH || findLocalChrome();
  if (!localExecutable) {
    throw new Error(
      "Chrome/Edge não encontrado nesta máquina. Defina a variável de ambiente " +
      "PUPPETEER_EXECUTABLE_PATH apontando pro executável instalado."
    );
  }
  return puppeteer.launch({
    executablePath: localExecutable,
    headless: true,
    defaultViewport: PRINT_VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

// ============================================================================
// Renderização em PDF (Puppeteer)
// ============================================================================

/**
 * Renderiza o relatório em PDF (Buffer) a partir dos registros.
 * Abre e fecha um Chromium headless a cada chamada; se você gerar muitos
 * relatórios em sequência, considere manter um `browser` compartilhado
 * (veja `generateRecolhimentoReportPdfWithBrowser`).
 */
export async function generateRecolhimentoReportPdf(
  records: RecolhimentoRecord[],
  opts: BuildReportOptions = {}
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    return await generateRecolhimentoReportPdfWithBrowser(browser, records, opts);
  } finally {
    await browser.close();
  }
}

/**
 * Mesma coisa, mas reaproveitando uma instância de browser já aberta
 * (útil em um servidor que gera vários relatórios e não quer pagar o
 * custo de abrir/fechar o Chromium a cada requisição).
 */
export async function generateRecolhimentoReportPdfWithBrowser(
  browser: Browser,
  records: RecolhimentoRecord[],
  opts: BuildReportOptions = {}
): Promise<Buffer> {
  const html = buildRecolhimentoReportHtml(records, opts);
  const page = await browser.newPage();
  try {
    // Reforça o viewport aqui também — não depende só do `defaultViewport`
    // do launch, que algumas combinações de Chromium/puppeteer-core ignoram
    // silenciosamente pra páginas abertas via `newPage()`.
    await page.setViewport(PRINT_VIEWPORT);
    await page.setContent(html, { waitUntil: "load" });

    // Diagnóstico: já tentamos {format:"A4", landscape:true} e depois
    // preferCSSPageSize, e as duas vezes a página saiu maior que o `.cover`
    // em produção (Vercel/@sparticuz/chromium), sobrando fundo — sem
    // reproduzir local. Loga o tamanho real do documento renderizado pra,
    // se acontecer de novo, dar pra ver nos logs da Vercel o que essa
    // versão específica do Chromium está calculando, em vez de adivinhar.
    const measured = await page.evaluate(() => {
      const rect = document.querySelector(".cover")?.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        coverRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    console.log("[recolhimentoReport] documento renderizado:", JSON.stringify(measured));

    // Tamanho explícito em vez de format/landscape (deixa o Puppeteer
    // calcular em polegadas) ou preferCSSPageSize (lê do `@page` do CSS) —
    // as duas opções saíram maiores que o pretendido nesse ambiente. Isso
    // aqui é o jeito mais direto/primitivo da API, sem tabela de conversão
    // nem parsing de CSS no meio.
    const pdf = await page.pdf({
      width: "297mm",
      height: "210mm",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
