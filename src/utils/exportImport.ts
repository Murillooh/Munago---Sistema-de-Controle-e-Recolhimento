import * as XLSX from 'xlsx';
import { RecolhimentoItem } from '../types';

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
