/**
 * pdfEngine.ts
 * ---------------------------------------------------------------------------
 * Motor de PDF compartilhado (Puppeteer/Chromium) — extraído de
 * recolhimentoReport.ts pra não duplicar a lógica de lançamento do
 * navegador e de impressão em outros relatórios (ex: estoqueReport.ts).
 * Chegar nessa versão do `launchBrowser`/viewport levou várias rodadas de
 * bug em produção (ver histórico do recolhimentoReport.ts) — qualquer novo
 * relatório deve reusar isso, não reimplementar.
 *
 * Dependências: puppeteer-core + @sparticuz/chromium (não "puppeteer"
 * puro — esse baixa ~300MB de Chromium embutido e não cabe no limite de
 * tamanho de função serverless da Vercel). Em dev local, usa o Chrome/Edge
 * já instalado na máquina — ver `launchBrowser()`.
 * ---------------------------------------------------------------------------
 */

import { existsSync } from "fs";
import puppeteer, { Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

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

// `mm` no CSS converte pra px numa razão FIXA de 96px/polegada — sempre,
// não importa o viewport. Uma página A4 paisagem com padding via `mm` vira
// sempre 1122.5 x 793.7 CSS px. O viewport tem que bater EXATAMENTE com
// isso: se for maior (era 1754x1240 aqui antes, escolhido achando que
// ficaria "mais nítido"), o conteúdo — que tem largura própria fixa, não
// estica pra preencher o body — fica plantado no canto de um viewport
// maior, sobrando fundo. Isso só aparecia no Chromium "shell" do
// @sparticuz/chromium (produção/Vercel); o Chrome completo do dev local
// mascarava o mesmo descompasso. Nitidez de verdade vem de
// `deviceScaleFactor`, não de inflar width/height.
export const PRINT_VIEWPORT = { width: 1123, height: 794, deviceScaleFactor: 2 };

export async function launchBrowser(): Promise<Browser> {
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

// Renderiza um HTML completo (com seu próprio <style>) num PDF A4 paisagem.
// `debugLabel` só marca o console.log de diagnóstico (tamanho real do
// documento renderizado) pra distinguir qual relatório gerou aquele log,
// caso o encolhimento de página volte a acontecer em algum relatório novo.
export async function renderHtmlToPdf(browser: Browser, html: string, debugLabel = "pdfEngine"): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    // Reforça o viewport aqui também — não depende só do `defaultViewport`
    // do launch, que algumas combinações de Chromium/puppeteer-core ignoram
    // silenciosamente pra páginas abertas via `newPage()`.
    await page.setViewport(PRINT_VIEWPORT);
    await page.setContent(html, { waitUntil: "load" });

    const measured = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }));
    console.log(`[${debugLabel}] documento renderizado:`, JSON.stringify(measured));

    // Tamanho explícito em vez de format/landscape (deixa o Puppeteer
    // calcular em polegadas) ou preferCSSPageSize (lê do `@page` do CSS) —
    // as duas opções já saíram maiores que o pretendido em produção. Isso
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
