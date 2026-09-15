import * as XLSX from 'xlsx';
import { RecolhimentoItem, EstoqueItem } from '../types';

export function exportToExcel(data: RecolhimentoItem[], filename = 'controle_recolhimento.xlsx', visibleColumns?: string[]) {
  const columnMapping: Record<string, string> = {
    'franquia': 'FRANQUIA',
    'cnpj': 'CNPJ',
    'cCusto': 'C CUSTO',
    'categoria': 'CATEGORIA',
    'dataCriacao': 'DATA DA CRIAÇÃO',
    'vencimento': 'VENCIMENTO',
    'vencimentoOriginal': 'VENCIMENTO ORIGINAL',
    'dataPagamento': 'DATA DO PAGAMENTO',
    'valor': 'VALOR DO RECOLHIMENTO',
    'status': 'STATUS',
    'competenciaRecolhimento': 'COMPETÊNCIA DO RECOLHIMENTO',
    'competenciaPagamento': 'COMPETÊNCIA PAGAMENTO',
    'descricao': 'DESCRIÇÃO',
  };

  const worksheetData = data.map((item, index) => {
    const row: any = { '#': index + 1 };
    
    Object.entries(columnMapping).forEach(([key, label]) => {
      if (!visibleColumns || visibleColumns.includes(key)) {
        row[label] = (item as any)[key] || '';
      }
    });
    
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Recolhimentos');
  XLSX.writeFile(workbook, filename);
}

// PDF gerado no servidor (Puppeteer, ver src/server/recolhimentoReport.ts):
// capa com KPIs/gráficos + tabelas por unidade, em vez da lista simples que
// o jsPDF montava aqui no navegador. Por isso virou async-de-rede: manda os
// itens já carregados/filtrados pro back-end e recebe o PDF pronto de volta.
//
// `visibleColumns` não é mais usado pro PDF — o novo layout tem colunas
// fixas (Franquia/CNPJ, Vencimento, Valor, Status, Pagamento, Descrição) e
// agrupa por unidade automaticamente. Ficou só na assinatura pra não quebrar
// quem ainda passa esse argumento; a seleção de colunas continua valendo
// pra exportação em Excel.
export async function exportToPDF(
  data: RecolhimentoItem[],
  filename = 'relatorio_recolhimento.pdf',
  _visibleColumns?: string[],
  options?: { returnBlob?: boolean },
  sessionToken?: string | null
): Promise<Blob | void> {
  if (data.length === 0) {
    const msg = 'Nenhum registro para gerar o relatório.';
    if (options?.returnBlob) throw new Error(msg);
    alert(msg);
    return;
  }

  try {
    const res = await fetch('/api/reports/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ items: data }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Servidor retornou ${res.status} ao gerar o PDF.`);
    }

    const blob = await res.blob();
    if (options?.returnBlob) return blob;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating PDF:', error);
    // Chamador com returnBlob (ex: chat) trata o erro por conta própria —
    // um alert() do navegador não faz sentido no meio de uma conversa.
    if (options?.returnBlob) throw error;
    alert('Erro ao gerar o PDF. Verifique sua conexão e tente novamente.');
  }
}

export function parseExcelFile(file: File): Promise<RecolhimentoItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const rows: RecolhimentoItem[] = [];

        // Serial do Excel (dias desde 30/12/1899) -> Date. `cellDates: true` já
        // resolve a maioria das células de data de verdade, isso aqui é só
        // reforço pra número cru que ainda apareça como serial.
        const excelSerialToDate = (serial: number): Date =>
          new Date(Math.round((serial - 25569) * 86400 * 1000));

        // Helper to format date correctly regardless of input type
        const formatExcelDate = (val: any): string => {
          if (!val) return '';
          if (val instanceof Date) {
            return val.toLocaleDateString('pt-BR');
          }
          if (typeof val === 'number') {
            const d = excelSerialToDate(val);
            return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('pt-BR');
          }
          return String(val);
        };

        // Competência é mês/ano (ex: "ago/26"), não dia/mês/ano — mas na
        // planilha real essas colunas vêm como uma data (1º dia do mês).
        const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        const formatCompetencia = (val: any): string => {
          if (!val) return '';
          let d: Date | null = null;
          if (val instanceof Date) d = val;
          else if (typeof val === 'number') d = excelSerialToDate(val);
          if (d && !isNaN(d.getTime())) {
            return `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
          }
          return String(val).toLowerCase();
        };

        // Descobre a coluna de cada campo pelo TEXTO do cabeçalho (linha 1), em
        // vez de uma posição fixa — assim funciona tanto com uma planilha externa
        // (Franquia já é a coluna A) quanto com o arquivo que o próprio sistema
        // exporta (tem "#" e "CATEGORIA" extras), não importa a ordem das colunas.
        const normalizeHeader = (v: any) =>
          String(v ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove acentos
            .trim()
            .toUpperCase();

        const HEADER_ALIASES: Record<string, keyof RecolhimentoItem> = {
          'FRANQUIA': 'franquia',
          'CNPJ': 'cnpj',
          'C CUSTO': 'cCusto',
          'C. CUSTO': 'cCusto',
          'CCUSTO': 'cCusto',
          'CATEGORIA': 'categoria',
          'DATA DA CRIACAO': 'dataCriacao',
          'DATA CRIACAO': 'dataCriacao',
          'CRIACAO': 'dataCriacao',
          'VENCIMENTO': 'vencimento',
          'VENCIMENTO ORIGINAL': 'vencimentoOriginal',
          'DATA DO PAGAMENTO': 'dataPagamento',
          'DATA PAGAMENTO': 'dataPagamento',
          'PAGO EM': 'dataPagamento',
          'VALOR DO RECOLHIMENTO': 'valor',
          'VALOR': 'valor',
          'STATUS': 'status',
          'COMPETENCIA DO RECOLHIMENTO': 'competenciaRecolhimento',
          'COMPETENCIA RECOLHIMENTO': 'competenciaRecolhimento',
          'COMP. REC.': 'competenciaRecolhimento',
          'COMPETENCIA PAGAMENTO': 'competenciaPagamento',
          'COMP. PAG.': 'competenciaPagamento',
          'DESCRICAO': 'descricao',
        };

        const buildColIndex = (headerRow: any[]) => {
          const idx: Partial<Record<keyof RecolhimentoItem, number>> = {};
          headerRow.forEach((cell, i) => {
            const field = HEADER_ALIASES[normalizeHeader(cell)];
            if (field && idx[field] === undefined) idx[field] = i;
          });
          return idx;
        };

        // Um arquivo pode ter mais de uma aba (ex: um resumo mensal em pivô
        // antes da aba com os lançamentos de verdade) — usa a PRIMEIRA aba cujo
        // cabeçalho tem "FRANQUIA" reconhecível, não simplesmente a primeira
        // aba do arquivo, que é o que causava a importação de dados errados.
        let json: any[] = [];
        let colIndex: Partial<Record<keyof RecolhimentoItem, number>> = {};
        for (const sheetName of workbook.SheetNames) {
          const candidateJson = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { header: 1 });
          const candidateColIndex = buildColIndex((candidateJson[0] as any[]) || []);
          if (candidateColIndex.franquia !== undefined) {
            json = candidateJson;
            colIndex = candidateColIndex;
            break;
          }
          if (json.length === 0) json = candidateJson; // fallback: primeira aba, caso nenhuma tenha cabeçalho reconhecível
        }

        // Sem "FRANQUIA" reconhecível em nenhuma aba, assume o layout padrão
        // sem coluna de índice na frente (A=Franquia, B=CNPJ, ...) como antes.
        const hasHeaders = colIndex.franquia !== undefined;
        const at = (field: keyof RecolhimentoItem, fallbackIdx: number, r: any[]) =>
          r[hasHeaders ? colIndex[field] ?? -1 : fallbackIdx];

        for (let i = 1; i < json.length; i++) {
          const r = json[i] as any[];
          const franquiaCell = at('franquia', 0, r);
          if (!r || r.length === 0 || !franquiaCell) continue;

          rows.push({
            id: `imported-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            franquia: String(franquiaCell || 'FRANQUIA DESCONHECIDA'),
            cnpj: String(at('cnpj', 1, r) || ''),
            cCusto: String(at('cCusto', 2, r) || 'CANINDÉ'),
            categoria: at('categoria', -1, r) ? String(at('categoria', -1, r)) : undefined,
            dataCriacao: formatExcelDate(at('dataCriacao', 3, r)),
            vencimento: formatExcelDate(at('vencimento', 4, r)),
            vencimentoOriginal: formatExcelDate(at('vencimentoOriginal', 5, r)),
            dataPagamento: formatExcelDate(at('dataPagamento', 6, r)),
            valor: Number(at('valor', 7, r) || 0) || 0,
            status: (['Confirmada', 'Recebida', 'Aguardando pagamento', 'Atrasado'].includes(at('status', 8, r))
              ? at('status', 8, r)
              : 'Aguardando pagamento') as any,
            competenciaRecolhimento: formatCompetencia(at('competenciaRecolhimento', 9, r)) || 'atual',
            competenciaPagamento: formatCompetencia(at('competenciaPagamento', 10, r)),
            descricao: String(at('descricao', 11, r) || ''),
          });
        }

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================================
// Controle de Estoque
// ============================================================================

export function exportEstoqueToExcel(data: EstoqueItem[], filename = 'controle_estoque.xlsx') {
  const worksheetData = data.map((item) => ({
    'CÓD.': item.codigo,
    'DESCRIÇÃO / PEÇA': item.descricao,
    'MARCA': item.marca,
    'ENDEREÇAMENTO': item.endereco,
    'UNIDADE': item.unidade,
    'CUSTO': item.custo,
    'VENDA': item.venda,
    'STATUS': item.status,
    'QTD VISION': item.qtdVision,
    'QTD FÍSICO': item.qtdFisico,
    'DIFERENÇA': item.qtdFisico - item.qtdVision,
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Estoque');
  XLSX.writeFile(workbook, filename);
}

// Mesmo padrão de exportToPDF: gera no servidor (Puppeteer, ver
// src/server/estoqueReport.ts) e devolve o PDF pronto.
export async function exportEstoqueToPDF(
  data: EstoqueItem[],
  filename = 'relatorio_estoque.pdf',
  options?: { returnBlob?: boolean },
  sessionToken?: string | null
): Promise<Blob | void> {
  if (data.length === 0) {
    const msg = 'Nenhum item para gerar o relatório.';
    if (options?.returnBlob) throw new Error(msg);
    alert(msg);
    return;
  }

  try {
    const res = await fetch('/api/reports/estoque-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ items: data }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Servidor retornou ${res.status} ao gerar o PDF.`);
    }

    const blob = await res.blob();
    if (options?.returnBlob) return blob;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating estoque PDF:', error);
    if (options?.returnBlob) throw error;
    alert('Erro ao gerar o PDF. Verifique sua conexão e tente novamente.');
  }
}

// Mesma lógica de detecção de cabeçalho/aba do parseExcelFile, adaptada
// pra planilha de inventário (ex: "Inventário Santa Cruz"). A aba usada é
// sempre a mais completa (a "Detalhado"/geral) — "Sobras" e "Faltas" nessas
// planilhas de origem são só o mesmo dado filtrado à mão por quem exportou,
// e a diferença entre elas nem sempre bate (conferido num caso real); o
// sistema recalcula sobra/falta sozinho a partir da diferença, não confia
// nessas abas.
export function parseEstoqueExcelFile(file: File): Promise<EstoqueItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const normalizeHeader = (v: any) =>
          String(v ?? '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '') // remove acentos
            .trim()
            .toUpperCase();

        const HEADER_ALIASES: Record<string, keyof EstoqueItem> = {
          'COD.': 'codigo',
          'CODIGO': 'codigo',
          'COD': 'codigo',
          'DESCRICAO / PECA': 'descricao',
          'DESCRICAO/PECA': 'descricao',
          'DESCRICAO': 'descricao',
          'PECA': 'descricao',
          'MARCA': 'marca',
          'ENDERECAMENTO': 'endereco',
          'ENDERECO': 'endereco',
          'UNIDADE': 'unidade',
          'UN': 'unidade',
          'CUSTO': 'custo',
          'VENDA': 'venda',
          'STATUS': 'status',
          'QTD VISION': 'qtdVision',
          'QUANTIDADE VISION': 'qtdVision',
        };

        // "QTD FÍSICO (INVENTÁRIO) 10/09/2026" — a data no fim muda a cada
        // planilha, não dá pra casar exato; qualquer cabeçalho começando com
        // "QTD FISICO" (ou "QTD FISICO (INVENTARIO)") é essa coluna.
        const matchHeader = (normalized: string): keyof EstoqueItem | undefined => {
          if (HEADER_ALIASES[normalized]) return HEADER_ALIASES[normalized];
          if (normalized.startsWith('QTD FISICO') || normalized.startsWith('QUANTIDADE FISICO')) return 'qtdFisico';
          return undefined;
        };

        const buildColIndex = (headerRow: any[]) => {
          const idx: Partial<Record<keyof EstoqueItem, number>> = {};
          headerRow.forEach((cell, i) => {
            const field = matchHeader(normalizeHeader(cell));
            if (field && idx[field] === undefined) idx[field] = i;
          });
          return idx;
        };

        // Entre várias abas (Detalhado/Sobras/Faltas), usa a PRIMEIRA cujo
        // cabeçalho tem "DESCRIÇÃO" reconhecível — normalmente é a mais
        // completa. Se quiser forçar uma aba específica, dá pra deixar só
        // ela no arquivo antes de importar.
        let json: any[] = [];
        let colIndex: Partial<Record<keyof EstoqueItem, number>> = {};
        for (const sheetName of workbook.SheetNames) {
          const candidateJson = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { header: 1 });
          const candidateColIndex = buildColIndex((candidateJson[0] as any[]) || []);
          if (candidateColIndex.descricao !== undefined) {
            json = candidateJson;
            colIndex = candidateColIndex;
            break;
          }
          if (json.length === 0) json = candidateJson;
        }

        const hasHeaders = colIndex.descricao !== undefined;
        const at = (field: keyof EstoqueItem, fallbackIdx: number, r: any[]) =>
          r[hasHeaders ? colIndex[field] ?? -1 : fallbackIdx];

        const rows: EstoqueItem[] = [];
        for (let i = 1; i < json.length; i++) {
          const r = json[i] as any[];
          const descricaoCell = at('descricao', 1, r);
          if (!r || r.length === 0 || !descricaoCell) continue;

          const codigoRaw = at('codigo', 0, r);
          rows.push({
            id: `imported-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            codigo: codigoRaw && String(codigoRaw) !== '-' ? String(codigoRaw) : '',
            descricao: String(descricaoCell || '').trim(),
            marca: String(at('marca', 2, r) || '').trim(),
            endereco: String(at('endereco', 3, r) || '').trim(),
            unidade: String(at('unidade', 4, r) || 'UN').trim(),
            custo: Number(at('custo', 5, r)) || 0,
            venda: Number(at('venda', 6, r)) || 0,
            status: (String(at('status', 7, r) || 'Ativo').trim() === 'Inativo' ? 'Inativo' : 'Ativo'),
            qtdVision: Number(at('qtdVision', 8, r)) || 0,
            qtdFisico: Number(at('qtdFisico', 9, r)) || 0,
          });
        }

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}
