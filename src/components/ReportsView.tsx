import React, { useState, useMemo } from 'react';
import { RecolhimentoItem } from '../types';
import { FileText, Download, CheckSquare, Square, Calendar, Filter, ChevronRight, Layout, Trash2, Search } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportImport';
import { motion, AnimatePresence } from 'motion/react';

interface ReportsViewProps {
  items: RecolhimentoItem[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ items }) => {
  // Columns state
  const ALL_COLUMNS = [
    { id: 'franquia', label: 'Franquia' },
    { id: 'cnpj', label: 'CNPJ' },
    { id: 'cCusto', label: 'C. Custo' },
    { id: 'categoria', label: 'Categoria' },
    { id: 'dataCriacao', label: 'Criação' },
    { id: 'vencimento', label: 'Vencimento' },
    { id: 'vencimentoOriginal', label: 'V. Original' },
    { id: 'dataPagamento', label: 'Pagamento' },
    { id: 'valor', label: 'Valor' },
    { id: 'status', label: 'Status' },
    { id: 'competenciaRecolhimento', label: 'Competência' },
    { id: 'descricao', label: 'Descrição' },
  ];

  const [selectedColumns, setSelectedColumns] = useState<string[]>(['franquia', 'cnpj', 'vencimento', 'valor', 'status', 'competenciaRecolhimento']);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  
  // Filters state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>(['Confirmada', 'Recebida', 'Aguardando pagamento', 'Atrasado']);
  const [searchTerm, setSearchTerm] = useState('');

  const toggleColumn = (id: string) => {
    setSelectedColumns(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleStatus = (status: string) => {
    setStatusFilters(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Status filter
      if (!statusFilters.includes(item.status)) return false;

      // Search term
      if (searchTerm && !item.franquia.toLowerCase().includes(searchTerm.toLowerCase()) && !item.cnpj.includes(searchTerm)) return false;

      // Date range (based on vencimento)
      if (startDate || endDate) {
        // Convert DD/MM/AAAA to YYYY-MM-DD for comparison
        const parseDate = (d: string) => {
          const parts = d.split('/');
          if (parts.length !== 3) return null;
          return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        };

        const itemDate = parseDate(item.vencimento);
        if (itemDate) {
          if (startDate) {
            const start = new Date(startDate).getTime();
            if (itemDate < start) return false;
          }
          if (endDate) {
            const end = new Date(endDate).getTime();
            if (itemDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [items, statusFilters, searchTerm, startDate, endDate]);

  const handleExportExcel = () => {
    const dataToExport = selectedRowIds.size > 0 
      ? filteredItems.filter(i => selectedRowIds.has(i.id))
      : filteredItems;
    exportToExcel(dataToExport, 'relatorio_personalizado.xlsx', selectedColumns);
  };

  const handleExportPDF = async () => {
    const dataToExport = selectedRowIds.size > 0 
      ? filteredItems.filter(i => selectedRowIds.has(i.id))
      : filteredItems;
    await exportToPDF(dataToExport, 'relatorio_personalizado.pdf', selectedColumns);
  };

  const toggleRow = (id: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllRows = () => {
    if (selectedRowIds.size === filteredItems.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Area */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
            <FileText className="w-5 h-5 text-rose-500" />
            <span>Centro de Relatórios Personalizados</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure exatamente o que você deseja exportar em PDF ou Excel.</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="text-right mr-2 hidden sm:block">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Exportando</p>
            <p className="text-xs font-black text-blue-600 tracking-tight">
              {selectedRowIds.size > 0 ? selectedRowIds.size : filteredItems.length} Registros
            </p>
          </div>
          <button
            onClick={handleExportExcel}
            disabled={filteredItems.length === 0 || selectedColumns.length === 0}
            className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-600/20 uppercase tracking-widest"
          >
            <Download className="w-4 h-4" />
            <span>Excel</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={filteredItems.length === 0 || selectedColumns.length === 0}
            className="flex items-center space-x-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-rose-600/20 uppercase tracking-widest"
          >
            <FileText className="w-4 h-4" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Configuration Sidebar */}
        <div className="space-y-6 lg:sticky lg:top-6">
          {/* Column Selection */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center space-x-2">
                <Layout className="w-3.5 h-3.5 text-blue-600" />
                <span>Colunas no Relatório</span>
              </h3>
              <button 
                onClick={() => setSelectedColumns(selectedColumns.length === ALL_COLUMNS.length ? [] : ALL_COLUMNS.map(c => c.id))}
                className="text-[9px] font-bold text-blue-600 hover:underline"
              >
                {selectedColumns.length === ALL_COLUMNS.length ? 'Limpar' : 'Todas'}
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {ALL_COLUMNS.map(col => (
                <button
                  key={col.id}
                  onClick={() => toggleColumn(col.id)}
                  className={`flex items-center space-x-2 p-2 rounded-lg text-left transition-all ${
                    selectedColumns.includes(col.id)
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30'
                      : 'bg-white dark:bg-slate-900 text-slate-500 border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {selectedColumns.includes(col.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  <span className="text-[10px] font-bold">{col.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Period Filter */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center space-x-2">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Período de Vencimento</span>
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fim</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-400 rounded-lg text-[10px] font-bold transition-colors"
                >
                  Limpar Período
                </button>
              </div>
            </div>
          </div>

          {/* Status Filter */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center space-x-2">
                <Filter className="w-3.5 h-3.5 text-amber-600" />
                <span>Status das Franquias</span>
              </h3>
            </div>
            <div className="p-4 space-y-2">
              {['Confirmada', 'Recebida', 'Aguardando pagamento', 'Atrasado'].map(status => (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={`w-full flex items-center space-x-3 p-2.5 rounded-xl text-left transition-all ${
                    statusFilters.includes(status)
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700'
                      : 'opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full ${
                    status === 'Confirmada' ? 'bg-blue-500' :
                    status === 'Recebida' ? 'bg-emerald-500' :
                    status === 'Aguardando pagamento' ? 'bg-amber-500' :
                    'bg-rose-500'
                  }`} />
                  <span className="text-[11px] font-bold flex-1">{status}</span>
                  {statusFilters.includes(status) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="space-y-6 min-w-0">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center space-x-2">
                  <Search className="w-3.5 h-3.5 text-slate-500" />
                  <span>Pré-visualização do Relatório</span>
                </h3>
                <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">
                  {filteredItems.length} registros selecionados para exportação
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar na prévia..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/50 backdrop-blur-md">
                  <tr className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                    <th className="py-3 px-4 w-10">
                      <button onClick={toggleSelectAllRows}>
                        {selectedRowIds.size === filteredItems.length && filteredItems.length > 0 ? (
                          <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </th>
                    {ALL_COLUMNS.filter(c => selectedColumns.includes(c.id)).map(col => (
                      <th key={col.id} className="py-3 px-6">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {filteredItems.map((item) => (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${selectedRowIds.has(item.id) ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <button onClick={() => toggleRow(item.id)}>
                          {selectedRowIds.has(item.id) ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-300" />
                          )}
                        </button>
                      </td>
                      {ALL_COLUMNS.filter(c => selectedColumns.includes(c.id)).map(col => (
                        <td key={col.id} className="py-3 px-6 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                          {col.id === 'valor' ? `R$ ${item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : (item as any)[col.id]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={selectedColumns.length + 1} className="py-20 text-center text-slate-400 italic">
                        Nenhum dado corresponde aos filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
               <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Valor Total: <span className="text-slate-900 dark:text-white">R$ {filteredItems.reduce((acc, curr) => acc + curr.valor, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
               </div>
               <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Colunas: <span className="text-slate-900 dark:text-white">{selectedColumns.length} / {ALL_COLUMNS.length}</span>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
