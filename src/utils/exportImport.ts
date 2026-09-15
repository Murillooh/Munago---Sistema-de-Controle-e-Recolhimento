import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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

async function getBase64ImageFromUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error loading image for PDF:', error);
    return null;
  }
}

export async function exportToPDF(
  data: RecolhimentoItem[],
  filename = 'relatorio_recolhimento.pdf',
  visibleColumns?: string[],
  options?: { returnBlob?: boolean }
): Promise<Blob | void> {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Ícone da marca Munago (mesmo pin+check dourado do app) — antes carregava
    // /logo.png, que era a arte de outra empresa (locaAgora) esquecida no projeto.
    const logoBase64 = await getBase64ImageFromUrl('/logo-pdf.png');
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 8, 16, 16);
      } catch (e) {
        console.warn('Could not add logo as PNG, trying JPEG', e);
        try {
          doc.addImage(logoBase64, 'JPEG', 14, 8, 16, 16);
        } catch (e2) {
          console.error('Could not add logo to PDF', e2);
        }
      }
    }

    const textX = logoBase64 ? 34 : 14;

    // Header Title: Munago
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // #0f172a
    doc.text('Munago', textX, 17);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text('Relatório de Controle de Recolhimento', textX, 23);

    // Date & Total metadata on the right — preto em vez de cinza claro, melhora a leitura.
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(`Gerado em: ${new Date().toLocaleDateString()} | Total de Registros: ${data.length}`, 283, 17, { align: 'right' });

    // Subtle dividing line
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.line(14, 27, 283, 27);

    // Complete mapping of all possible columns
    const columnMapping: Record<string, string> = {
      'franquia': 'Franquia',
      'cnpj': 'CNPJ',
      'cCusto': 'C. Custo',
      'categoria': 'Categoria',
      'dataCriacao': 'Criação',
      'vencimento': 'Vencimento',
      'vencimentoOriginal': 'Venc. Orig.',
      'dataPagamento': 'Pagamento',
      'valor': 'Valor (R$)',
      'status': 'Status',
      'competenciaRecolhimento': 'Comp. Rec.',
      'competenciaPagamento': 'Comp. Pag.',
      'descricao': 'Descrição',
    };

    // Filter columns based on visibleColumns if provided
    const activeColumns = Object.entries(columnMapping)
      .filter(([key]) => !visibleColumns || visibleColumns.includes(key));

    if (activeColumns.length === 0) {
      alert('Selecione pelo menos uma coluna para o relatório.');
      return;
    }

    const tableColumn = activeColumns.map(([, label]) => label);

    const tableRows = data.map(item => {
      return activeColumns.map(([key]) => {
        if (key === 'valor') {
          return `R$ ${Number(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        }
        return (item as any)[key] || '-';
      });
    });

    autoTable(doc, {
      startY: 32,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    // Rodapé com o nome da marca em toda página — fecha o relatório com
    // identidade visual, em vez de terminar na última linha da tabela.
    const pageCount = doc.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Munago', 14, pageHeight - 8);
    }

    if (options?.returnBlob) {
      return doc.output('blob');
    }
    doc.save(filename);
  } catch (error) {
    console.error('Error generating PDF:', error);
    // Chamador com returnBlob (ex: chat) trata o erro por conta própria —
    // um alert() do navegador não faz sentido no meio de uma conversa.
    if (options?.returnBlob) throw error;
    alert('Erro ao gerar o PDF. Verifique os dados e tente novamente.');
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
