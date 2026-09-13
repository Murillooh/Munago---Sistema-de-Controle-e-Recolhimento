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

export async function exportToPDF(data: RecolhimentoItem[], filename = 'relatorio_recolhimento.pdf', visibleColumns?: string[]) {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Try loading logo.png
    const logoBase64 = await getBase64ImageFromUrl('/logo.png');
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 32, 14);
      } catch (e) {
        console.warn('Could not add logo as PNG, trying JPEG', e);
        try {
          doc.addImage(logoBase64, 'JPEG', 14, 10, 32, 14);
        } catch (e2) {
          console.error('Could not add logo to PDF', e2);
        }
      }
    }

    const textX = logoBase64 ? 50 : 14;

    // Header Title: Munago
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // #0f172a
    doc.text('Munago', textX, 17);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text('Relatório de Controle de Recolhimento', textX, 23);

    // Date & Total metadata on the right
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
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

    doc.save(filename);
  } catch (error) {
    console.error('Error generating PDF:', error);
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
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        const rows: RecolhimentoItem[] = [];
        
        // Helper to format date correctly regardless of input type
        const formatExcelDate = (val: any): string => {
          if (!val) return '';
          if (val instanceof Date) {
            return val.toLocaleDateString('pt-BR');
          }
          // Handle Excel serial numbers
          if (typeof val === 'number') {
            const date = XLSX.utils.format_cell({ v: val, t: 'd' });
            if (date) {
              const d = new Date(date);
              return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('pt-BR');
            }
          }
          return String(val);
        };

        // Ordem fixa das colunas na planilha de origem (sem coluna de índice "#"
        // na frente): A=Franquia, B=CNPJ, C=C.Custo, D=Data Criação, E=Vencimento,
        // F=Vencimento Original, G=Data Pagamento, H=Valor, I=Status,
        // J=Competência Recolhimento, K=Competência Pagamento, L=Descrição.
        for (let i = 1; i < json.length; i++) {
          const r = json[i] as any[];
          if (!r || r.length === 0 || !r[0]) continue;

          rows.push({
            id: `imported-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            franquia: String(r[0] || 'FRANQUIA DESCONHECIDA'),
            cnpj: String(r[1] || ''),
            cCusto: String(r[2] || 'CANINDÉ'),
            dataCriacao: formatExcelDate(r[3]),
            vencimento: formatExcelDate(r[4]),
            vencimentoOriginal: formatExcelDate(r[5]),
            dataPagamento: formatExcelDate(r[6]),
            valor: Number(r[7] || 0) || 0,
            status: (['Confirmada', 'Recebida', 'Aguardando pagamento', 'Atrasado'].includes(r[8]) ? r[8] : 'Aguardando pagamento') as any,
            competenciaRecolhimento: String(r[9] || 'atual'),
            competenciaPagamento: String(r[10] || ''),
            descricao: String(r[11] || ''),
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
