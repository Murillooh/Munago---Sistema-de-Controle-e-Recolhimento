import React, { useState, useMemo, useRef } from 'react';
import { EstoqueItem } from '../types';
import { exportEstoqueToExcel, exportEstoqueToPDF, parseEstoqueExcelFile } from '../utils/exportImport';
import {
  Search,
  Upload,
  Download,
  Plus,
  Trash2,
  Edit2,
  X,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Boxes,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmDialog } from './ConfirmDialog';

interface EstoqueViewProps {
  items: EstoqueItem[];
  onAddItem: (item: EstoqueItem) => void;
  onUpdateItem: (item: EstoqueItem) => void;
  onDeleteItem: (id: string) => void;
  onDeleteMultiple: (ids: string[]) => void;
  onImportBulk: (items: EstoqueItem[]) => Promise<boolean> | void;
  searchTerm: string;
  sessionToken: string | null;
}

type DiffFilter = 'todos' | 'sobras' | 'faltas' | 'divergentes';

const PAGE_SIZE = 50;

const EMPTY_FORM: Partial<EstoqueItem> = {
  codigo: '',
  descricao: '',
  marca: '',
  endereco: '',
  unidade: 'UN',
  custo: 0,
  venda: 0,
  status: 'Ativo',
  qtdVision: 0,
  qtdFisico: 0,
};

export const EstoqueView: React.FC<EstoqueViewProps> = ({
  items,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onDeleteMultiple,
  onImportBulk,
  searchTerm,
  sessionToken,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'Ativo' | 'Inativo'>('todos');
  const [marcaFilter, setMarcaFilter] = useState('todas');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EstoqueItem | null>(null);
  const [formData, setFormData] = useState<Partial<EstoqueItem>>(EMPTY_FORM);

  const [isImporting, setIsImporting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  const diff = (item: EstoqueItem) => item.qtdFisico - item.qtdVision;

  const marcas = useMemo(
    () => Array.from(new Set(items.map((i) => i.marca).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [items]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const d = diff(item);
      const globalQ = searchTerm.toLowerCase();
      const matchesGlobalSearch =
        !globalQ ||
        item.descricao.toLowerCase().includes(globalQ) ||
        item.codigo.toLowerCase().includes(globalQ);

      const localQ = search.toLowerCase();
      const matchesLocalSearch =
        !localQ ||
        item.descricao.toLowerCase().includes(localQ) ||
        item.codigo.toLowerCase().includes(localQ) ||
        item.marca.toLowerCase().includes(localQ) ||
        item.endereco.toLowerCase().includes(localQ);

      const matchesStatus = statusFilter === 'todos' || item.status === statusFilter;
      const matchesMarca = marcaFilter === 'todas' || item.marca === marcaFilter;
      const matchesDiff =
        diffFilter === 'todos' ? true :
        diffFilter === 'sobras' ? d > 0 :
        diffFilter === 'faltas' ? d < 0 :
        d !== 0;

      return matchesGlobalSearch && matchesLocalSearch && matchesStatus && matchesMarca && matchesDiff;
    });
  }, [items, search, searchTerm, statusFilter, marcaFilter, diffFilter]);

  // KPIs sempre sobre a base inteira, não sobre o filtro atual — é uma
  // visão geral do estoque, não "quanto tem no que estou vendo agora".
  const valorEstoque = useMemo(() => items.reduce((s, i) => s + i.custo * i.qtdFisico, 0), [items]);
  const divergentes = useMemo(() => items.filter((i) => diff(i) !== 0), [items]);
  const valorSobras = useMemo(
    () => divergentes.filter((i) => diff(i) > 0).reduce((s, i) => s + diff(i) * i.venda, 0),
    [divergentes]
  );
  const valorFaltas = useMemo(
    () => divergentes.filter((i) => diff(i) < 0).reduce((s, i) => s + diff(i) * i.venda, 0),
    [divergentes]
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(
    () => filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredItems, safePage]
  );

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      paginatedItems.every((i) => prev.has(i.id)) ? new Set() : new Set(paginatedItems.map((i) => i.id))
    );
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: EstoqueItem) => {
    setEditingItem(item);
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.descricao?.trim()) return;

    if (editingItem) {
      onUpdateItem({ ...editingItem, ...formData } as EstoqueItem);
      showToast('success', 'Item atualizado.');
    } else {
      onAddItem({
        id: `estoque-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        codigo: formData.codigo || '',
        descricao: formData.descricao || '',
        marca: formData.marca || '',
        endereco: formData.endereco || '',
        unidade: formData.unidade || 'UN',
        custo: Number(formData.custo) || 0,
        venda: Number(formData.venda) || 0,
        status: (formData.status as 'Ativo' | 'Inativo') || 'Ativo',
        qtdVision: Number(formData.qtdVision) || 0,
        qtdFisico: Number(formData.qtdFisico) || 0,
      });
      showToast('success', 'Item adicionado.');
    }
    setIsModalOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const parsed = await parseEstoqueExcelFile(file);
      if (parsed.length === 0) {
        showToast('error', 'Nenhum item reconhecido nessa planilha.');
        return;
      }
      const ok = await onImportBulk(parsed);
      if (ok === false) {
        showToast('error', 'Falha ao salvar os itens importados no servidor — ficaram só localmente.');
      } else {
        showToast('success', `${parsed.length} itens importados.`);
      }
    } catch (err) {
      console.error('Erro ao importar planilha de estoque:', err);
      showToast('error', 'Erro ao ler a planilha. Confira o formato do arquivo.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = () => {
    const toExport = selectedIds.size > 0 ? items.filter((i) => selectedIds.has(i.id)) : filteredItems;
    exportEstoqueToExcel(toExport);
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPDF = async () => {
    const toExport = selectedIds.size > 0 ? items.filter((i) => selectedIds.has(i.id)) : filteredItems;
    setIsExportingPdf(true);
    try {
      await exportEstoqueToPDF(toExport, 'relatorio_estoque.pdf', undefined, sessionToken);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const confirmBulkDeleteAction = () => {
    onDeleteMultiple(Array.from(selectedIds));
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  };

  const fmtMoney = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Valor em Estoque</p>
          <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">{fmtMoney(valorEstoque)}</h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-slate-500">
            <Boxes className="w-3 h-3 mr-1" />
            {items.length} ITENS
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-0.5">Divergências</p>
          <h3 className="text-xl font-black text-amber-600 dark:text-amber-400">{divergentes.length}</h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-amber-600/70">
            <AlertTriangle className="w-3 h-3 mr-1" />
            FÍSICO ≠ VISION
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Sobras</p>
          <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400">{fmtMoney(valorSobras)}</h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-emerald-600/70">
            <TrendingUp className="w-3 h-3 mr-1" />
            FÍSICO MAIOR QUE VISION
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-0.5">Faltas</p>
          <h3 className="text-xl font-black text-rose-600 dark:text-rose-400">{fmtMoney(valorFaltas)}</h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-rose-600/70">
            <TrendingDown className="w-3 h-3 mr-1" />
            FÍSICO MENOR QUE VISION
          </div>
        </div>
      </div>

      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">Controle de Estoque</h2>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Inventário de peças — quantidade Vision (sistema) x físico (contagem).</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold transition-colors border border-slate-300 dark:border-slate-700 uppercase tracking-wider disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            <span>{isImporting ? 'Importando...' : 'Importar'}</span>
          </button>

          <button
            onClick={handleExportExcel}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border uppercase tracking-wider relative ${
              selectedIds.size > 0
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
                : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50'
            }`}
            title={selectedIds.size > 0 ? `Exportar ${selectedIds.size} itens selecionados` : 'Exportar todos os filtrados'}
          >
            <Download className="w-3 h-3" />
            <span>Excel</span>
          </button>

          <button
            onClick={handleExportPDF}
            disabled={isExportingPdf}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border uppercase tracking-wider relative disabled:opacity-60 ${
              selectedIds.size > 0
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-500/20'
                : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50'
            }`}
            title={selectedIds.size > 0 ? `Exportar ${selectedIds.size} itens selecionados` : 'Exportar todos os filtrados'}
          >
            {isExportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            <span>{isExportingPdf ? 'Gerando...' : 'PDF'}</span>
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition-colors uppercase tracking-wider"
            >
              <Trash2 className="w-3 h-3" />
              <span>Excluir ({selectedIds.size})</span>
            </button>
          )}

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-[10px] font-black shadow-md shadow-blue-500/20 transition-all uppercase tracking-widest hover:scale-105 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Item</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className={`p-3 rounded-xl border text-xs font-semibold ${
          toast.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
            : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/60 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar por descrição, código, marca ou endereço..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50 transition-all outline-none text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
            >
              <option value="todos">Todos os Status</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>

            <select
              value={marcaFilter}
              onChange={(e) => { setMarcaFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
            >
              <option value="todas">Todas as Marcas</option>
              {marcas.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Segmented: Todos / Divergentes / Sobras / Faltas */}
        <div className="flex flex-wrap gap-1.5">
          {([
            ['todos', 'Todos'],
            ['divergentes', `Divergentes (${divergentes.length})`],
            ['sobras', `Sobras (${divergentes.filter((i) => diff(i) > 0).length})`],
            ['faltas', `Faltas (${divergentes.filter((i) => diff(i) < 0).length})`],
          ] as [DiffFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setDiffFilter(value); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-colors border ${
                diffFilter === value
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                <th className="py-2.5 px-4">
                  <input
                    type="checkbox"
                    checked={paginatedItems.length > 0 && paginatedItems.every((i) => selectedIds.has(i.id))}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:bg-slate-700 dark:border-slate-600"
                  />
                </th>
                <th className="py-2.5 px-4">Código</th>
                <th className="py-2.5 px-4">Descrição</th>
                <th className="py-2.5 px-4">Marca</th>
                <th className="py-2.5 px-4">Endereço</th>
                <th className="py-2.5 px-4 text-right">Custo</th>
                <th className="py-2.5 px-4 text-right">Venda</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Vision</th>
                <th className="py-2.5 px-4 text-right">Físico</th>
                <th className="py-2.5 px-4 text-right">Diferença</th>
                <th className="py-2.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs">
                    {items.length === 0
                      ? 'Nenhum item de estoque ainda — importe uma planilha de inventário pra começar.'
                      : 'Nenhum item bate com os filtros atuais.'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const d = diff(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelectItem(item.id)}
                          className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:bg-slate-700 dark:border-slate-600"
                        />
                      </td>
                      <td className="py-2 px-4 font-mono text-slate-500 dark:text-slate-400">{item.codigo || '—'}</td>
                      <td className="py-2 px-4 font-bold text-slate-900 dark:text-slate-100 max-w-[280px] whitespace-normal">{item.descricao}</td>
                      <td className="py-2 px-4 text-slate-600 dark:text-slate-300">{item.marca || '—'}</td>
                      <td className="py-2 px-4 text-slate-500 dark:text-slate-400">{item.endereco || '—'}</td>
                      <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-300">{fmtMoney(item.custo)}</td>
                      <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-300">{fmtMoney(item.venda)}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          item.status === 'Ativo'
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-300">{item.qtdVision}</td>
                      <td className="py-2 px-4 text-right font-bold text-slate-900 dark:text-slate-100">{item.qtdFisico}</td>
                      <td className={`py-2 px-4 text-right font-black ${
                        d > 0 ? 'text-emerald-600 dark:text-emerald-400' : d < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                      }`}>
                        {d > 0 ? `+${d}` : d}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 p-4 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'itens'}
          </span>

          {totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                title="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-black uppercase tracking-widest px-1">
                Página {safePage} <span className="text-slate-400 dark:text-slate-600">/ {totalPages}</span>
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                title="Próxima página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20">
                    <Package className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                    {editingItem ? 'Editar Item' : 'Novo Item de Estoque'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Descrição *</label>
                  <input
                    required
                    type="text"
                    value={formData.descricao || ''}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Código</label>
                    <input
                      type="text"
                      value={formData.codigo || ''}
                      onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Marca</label>
                    <input
                      type="text"
                      value={formData.marca || ''}
                      onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Endereço</label>
                    <input
                      type="text"
                      value={formData.endereco || ''}
                      onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Unidade</label>
                    <input
                      type="text"
                      value={formData.unidade || ''}
                      onChange={(e) => setFormData({ ...formData, unidade: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Custo (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.custo ?? 0}
                      onChange={(e) => setFormData({ ...formData, custo: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Venda (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.venda ?? 0}
                      onChange={(e) => setFormData({ ...formData, venda: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Qtd Vision</label>
                    <input
                      type="number"
                      value={formData.qtdVision ?? 0}
                      onChange={(e) => setFormData({ ...formData, qtdVision: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Qtd Físico</label>
                    <input
                      type="number"
                      value={formData.qtdFisico ?? 0}
                      onChange={(e) => setFormData({ ...formData, qtdFisico: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Status</label>
                    <select
                      value={formData.status || 'Ativo'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Ativo' | 'Inativo' })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer"
                    >
                      <option value="Ativo">Ativo</option>
                      <option value="Inativo">Inativo</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 text-xs font-black text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex items-center space-x-2 px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Save className="w-4 h-4" />
                    <span>{editingItem ? 'Salvar' : 'Adicionar'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmBulkDelete}
        message={`Deseja excluir os ${selectedIds.size} itens selecionados?`}
        onConfirm={confirmBulkDeleteAction}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
};
