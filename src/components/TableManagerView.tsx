import React, { useState, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { RecolhimentoItem } from '../types';
import {
  Search,
  Filter,
  Upload,
  Download,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  Layout,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  X,
  Save,
  Database,
  RefreshCw,
  Loader2,
  GripVertical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DynamicTable } from './DynamicTable';
import { ConfirmDialog } from './ConfirmDialog';
import { exportToExcel, exportToPDF, parseExcelFile } from '../utils/exportImport';
import { Unidade, BaseCategory } from '../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Cores fixas pras categorias mais comuns; qualquer categoria nova (cadastrada
// em Bases) cai num hash estável pra sempre pegar a mesma cor do catálogo.
const CATEGORY_STYLES: Record<string, string> = {
  royalties: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800/50',
  'fundo de propaganda': 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50',
  taxa: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50',
  outros: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const FALLBACK_CATEGORY_STYLES = [
  'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800/50',
  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50',
  'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50',
  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/20 dark:text-fuchsia-400 dark:border-fuchsia-800/50',
];

const getCategoryStyle = (categoria?: string) => {
  const key = (categoria || 'Outros').trim().toLowerCase();
  if (CATEGORY_STYLES[key]) return CATEGORY_STYLES[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_CATEGORY_STYLES[hash % FALLBACK_CATEGORY_STYLES.length];
};

interface TableManagerViewProps {
  items: RecolhimentoItem[];
  onAddItem: (item: RecolhimentoItem) => void;
  onUpdateItem: (item: RecolhimentoItem) => void;
  onDeleteItem: (id: string) => void;
  onDeleteMultiple: (ids: string[]) => void;
  onImportBulk: (items: RecolhimentoItem[]) => Promise<boolean> | void;
  unidades: Unidade[];
  baseCategories: BaseCategory[];
  onNavigateBases: () => void;
  searchTerm: string;
  sessionToken: string | null;
}

export const TableManagerView = forwardRef<any, TableManagerViewProps>(function TableManagerView(props, ref) {
  const {
    items,
    onAddItem,
    onUpdateItem,
    onDeleteItem,
    onDeleteMultiple,
    onImportBulk,
    unidades,
    baseCategories,
    onNavigateBases,
    searchTerm,
    sessionToken,
  } = props;
  
  useImperativeHandle(ref, () => ({
    handleOpenAdd: handleOpenAdd,
  }));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [competenciaFilter, setCompetenciaFilter] = useState<string>('todas');
  const [cCustoFilter, setCCustoFilter] = useState<string>('todos');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecolhimentoItem | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<RecolhimentoItem>>({
    franquia: '',
    cnpj: '',
    cCusto: 'CANINDÉ',
    categoria: 'Taxa',
    dataCriacao: new Date().toLocaleDateString('pt-BR'),
    vencimento: '',
    vencimentoOriginal: '',
    dataPagamento: '',
    valor: 0,
    status: 'Aguardando pagamento',
    competenciaRecolhimento: 'ago/26',
    competenciaPagamento: '',
    descricao: '',
  });

  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [columns, setColumns] = useState<{ id: string; label: string; visible: boolean }[]>([
    { id: 'franquia', label: 'Franquia', visible: true },
    { id: 'cnpj', label: 'CNPJ', visible: true },
    { id: 'cCusto', label: 'C Custo', visible: true },
    { id: 'categoria', label: 'Categoria', visible: true },
    { id: 'dataCriacao', label: 'Criação', visible: true },
    { id: 'vencimento', label: 'Venc.', visible: true },
    { id: 'vencimentoOriginal', label: 'V. Original', visible: false },
    { id: 'dataPagamento', label: 'Pago Em', visible: true },
    { id: 'valor', label: 'Valor', visible: true },
    { id: 'status', label: 'Status', visible: true },
    { id: 'competenciaRecolhimento', label: 'Comp. Rec.', visible: true },
    { id: 'competenciaPagamento', label: 'Comp. Pag.', visible: false },
    { id: 'descricao', label: 'Descrição', visible: true },
  ]);

  const [isSyncing, setIsSyncing] = useState(false);

  // Confirmação de exclusão em massa — substitui confirm() nativo, mesmo
  // modal usado em App.tsx pra excluir um único registro.
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Toast leve pra substituir alert() nativo do navegador (feio, não segue o
  // tema, trava a interação) por um aviso que combina com o resto do sistema.
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const SortableColumnItem = ({ column, onToggle }: { column: { id: string; label: string; visible: boolean }; onToggle: () => void }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: column.id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    return (
      <div ref={setNodeRef} style={style} className="flex items-center space-x-2 p-2 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg">
        <div {...attributes} {...listeners} className="cursor-grab text-slate-400">
          <GripVertical className="w-4 h-4" />
        </div>
        <input type="checkbox" checked={column.visible} onChange={onToggle} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:bg-slate-700 dark:border-slate-600" />
        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 capitalize">{column.label}</span>
      </div>
    );
  };

  const onlyDigits = (v: string) => (v || '').replace(/\D/g, '');

  // Cada unidade tem sua própria chave ASAAS (Bases > Unidades); resolve pelo CNPJ do lançamento.
  const findUnidadeApiKey = (item: RecolhimentoItem) =>
    unidades.find((u) => onlyDigits(u.cnpj) && onlyDigits(u.cnpj) === onlyDigits(item.cnpj))?.asaasApiKey;

  const handleSyncAsaas = async () => {
    const pendingWithAsaas = items.filter(i => i.status === 'Aguardando pagamento' && i.asaasId);

    if (pendingWithAsaas.length === 0) {
      alert('Nenhuma cobrança pendente com vínculo ASAAS encontrada para sincronizar.');
      return;
    }

    setIsSyncing(true);
    let updatedCount = 0;
    let skippedNoKey = 0;

    try {
      for (const item of pendingWithAsaas) {
        const apiKey = findUnidadeApiKey(item);
        if (!apiKey) {
          skippedNoKey++;
          continue;
        }
        try {
          const res = await fetch('/api/asaas/get-payment-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey,
              sandbox: true, // Assuming sandbox for now, ideally should be a setting
              paymentId: item.asaasId
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.status !== item.status) {
              onUpdateItem({
                ...item,
                status: data.status,
                dataPagamento: data.paymentDate ? data.paymentDate.split('-').reverse().join('/') : item.dataPagamento
              });
              updatedCount++;
            }
          }
        } catch (err) {
          console.error(`Erro ao sincronizar item ${item.id}:`, err);
        }
      }
      const skippedMsg = skippedNoKey > 0 ? ` ${skippedNoKey} ignorado(s) por falta de chave ASAAS na unidade (Bases > Unidades).` : '';
      alert(`Sincronização concluída! ${updatedCount} status atualizados.${skippedMsg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkStatusChange = (status: RecolhimentoItem['status']) => {
    if (selectedIds.size === 0) return;
    
    items.forEach(item => {
      if (selectedIds.has(item.id)) {
        onUpdateItem({ ...item, status });
      }
    });
    
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setConfirmBulkDelete(true);
  };

  const confirmBulkDeleteAction = () => {
    onDeleteMultiple(Array.from(selectedIds));
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  };

  // Unique Competencias & Cost Centers for Filters
  const competencias = useMemo(() => {
    const set = new Set(items.map((i) => i.competenciaRecolhimento));
    return Array.from(set).filter(Boolean);
  }, [items]);

  const costCenters = useMemo(() => {
    const set = new Set(items.map((i) => i.cCusto));
    return Array.from(set).filter(Boolean);
  }, [items]);

  function parseDateString(dateStr: string): Date | null {
    if (!dateStr) return null;
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        return new Date(y, m, d);
      }
    }
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Filtered items
  const filteredItems = useMemo(() => {
    const now = new Date();
    return items.filter((item) => {
      const localMatchesSearch =
        item.franquia.toLowerCase().includes(search.toLowerCase()) ||
        item.cnpj.toLowerCase().includes(search.toLowerCase()) ||
        item.descricao.toLowerCase().includes(search.toLowerCase()) ||
        (item.categoria || '').toLowerCase().includes(search.toLowerCase());

      const globalMatchesSearch =
        searchTerm === '' ||
        item.franquia.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.cnpj.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.categoria || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSearch = localMatchesSearch && globalMatchesSearch;

      const matchesStatus = statusFilter === 'todos' || item.status === statusFilter;
      const matchesCompetencia =
        competenciaFilter === 'todas' || item.competenciaRecolhimento === competenciaFilter;
      const matchesCCusto = cCustoFilter === 'todos' || item.cCusto === cCustoFilter;

      let matchesDate = true;
      const itemDate = parseDateString(item.vencimento) || parseDateString(item.dataCriacao);
      if (itemDate) {
        if (startDate && itemDate < new Date(startDate)) {
          matchesDate = false;
        }
        if (endDate && itemDate > new Date(endDate)) {
          matchesDate = false;
        }
      } else if (startDate || endDate) {
        matchesDate = false;
      }

      return matchesSearch && matchesStatus && matchesCompetencia && matchesCCusto && matchesDate;
    });
  }, [items, search, searchTerm, statusFilter, competenciaFilter, cCustoFilter, startDate, endDate]);

  // Paginação — uma planilha importada facilmente passa de 500-600 linhas;
  // renderizar tudo de uma vez deixa a tela pesada e a lista gigante de
  // rolar. Passa "pro lado" (páginas) em vez de uma coluna infinita.
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, searchTerm, statusFilter, competenciaFilter, cCustoFilter, startDate, endDate]);

  const paginatedItems = useMemo(
    () => filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredItems, safePage]
  );

  const handleOpenAdd = () => {
    setEditingItem(null);
    const firstUnit = unidades.length > 0 ? unidades[0] : null;
    const firstCat = baseCategories.length > 0 ? baseCategories[0].nome : '';
    
    setFormData({
      franquia: firstUnit ? firstUnit.nome : '',
      cnpj: firstUnit ? firstUnit.cnpj : '',
      cCusto: firstUnit?.cCustoPadrao || 'CANINDÉ',
      categoria: firstCat,
      dataCriacao: new Date().toLocaleDateString('pt-BR'),
      vencimento: new Date().toLocaleDateString('pt-BR'),
      vencimentoOriginal: new Date().toLocaleDateString('pt-BR'),
      dataPagamento: '',
      valor: 130,
      status: 'Aguardando pagamento',
      competenciaRecolhimento: 'ago/26',
      competenciaPagamento: '',
      descricao: 'PAGAMENTO REF AO RECOLHIMENTO DE AGOSTO 2026',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: RecolhimentoItem) => {
    setEditingItem(item);
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.franquia || !formData.valor) {
      alert('Por favor, preencha a Franquia e o Valor.');
      return;
    }

    if (editingItem) {
      onUpdateItem({
        ...(editingItem),
        ...formData,
      } as RecolhimentoItem);
    } else {
      const newItem: RecolhimentoItem = {
        id: `rec-${Date.now()}`,
        franquia: formData.franquia || '',
        cnpj: formData.cnpj || '',
        cCusto: formData.cCusto || 'CANINDÉ',
        categoria: formData.categoria || 'Taxa',
        dataCriacao: formData.dataCriacao || new Date().toLocaleDateString('pt-BR'),
        vencimento: formData.vencimento || '',
        vencimentoOriginal: formData.vencimentoOriginal || '',
        dataPagamento: formData.dataPagamento || '',
        valor: Number(formData.valor) || 0,
        status: (formData.status as any) || 'Aguardando pagamento',
        competenciaRecolhimento: formData.competenciaRecolhimento || 'ago/26',
        competenciaPagamento: formData.competenciaPagamento || '',
        descricao: formData.descricao || '',
      };
      onAddItem(newItem);
    }
    setIsModalOpen(false);
  };

  const toggleColumn = (id: string) => {
    setColumns(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  };

  // Map "column id -> visible" used by the table body below, derived from `columns` state.
  const columnVisibility = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.visible])) as Record<string, boolean>,
    [columns]
  );

  // Flags a cell as invalid/missing and returns the message shown in its tooltip; '' when the value is fine.
  const validateCell = (value: unknown, field: string): string => {
    switch (field) {
      case 'franquia':
        return !value || String(value).trim() === '' ? 'Franquia não informada' : '';
      case 'cnpj': {
        const digits = String(value || '').replace(/\D/g, '');
        return digits.length !== 14 ? 'CNPJ inválido (esperado 14 dígitos)' : '';
      }
      case 'dataCriacao':
      case 'vencimento':
        if (!value) return 'Data não informada';
        return parseDateString(String(value)) ? '' : 'Data inválida';
      case 'valor':
        return !value || Number(value) <= 0 ? 'Valor inválido' : '';
      default:
        return '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length > 0) {
        const ok = await onImportBulk(parsed);
        if (ok === false) {
          showToast('error', 'Falha ao salvar no servidor — nada foi importado. Tente de novo.');
        } else {
          showToast('success', `${parsed.length} registro${parsed.length > 1 ? 's' : ''} importado${parsed.length > 1 ? 's' : ''} da planilha.`);
        }
      } else {
        showToast('error', 'Nenhum registro válido encontrado na planilha.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Erro ao processar o arquivo Excel. Verifique o formato.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleExportExcel = () => {
    const dataToExport = selectedIds.size > 0 
      ? items.filter(i => selectedIds.has(i.id))
      : filteredItems;
    exportToExcel(dataToExport);
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPDF = async () => {
    const dataToExport = selectedIds.size > 0
      ? items.filter(i => selectedIds.has(i.id))
      : filteredItems;
    setIsExportingPdf(true);
    try {
      await exportToPDF(dataToExport, 'relatorio_recolhimento.pdf', undefined, undefined, sessionToken);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Top Header & Actions - Compact */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Gerenciador de Planilha</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Gestão diária de recolhimentos e exportação de dados.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Column Toggle Button */}
          <div className="relative">
            <button
              onClick={() => setShowColumnToggle(!showColumnToggle)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-colors shadow-sm uppercase tracking-wider"
            >
              <Layout className="w-3 h-3" />
              <span>Colunas</span>
            </button>

            {showColumnToggle && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 p-3 space-y-2 animate-in fade-in zoom-in duration-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1 border-b border-slate-100 dark:border-slate-800 pb-1">Arrastar para Reordenar</p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={columns.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="max-h-60 overflow-y-auto pr-1 custom-scrollbar space-y-1">
                      {columns.map((col) => (
                        <SortableColumnItem key={col.id} column={col} onToggle={() => toggleColumn(col.id)} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>

          <button
            onClick={handleSyncAsaas}
            disabled={isSyncing}
            className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold transition-colors border border-indigo-200 uppercase tracking-wider disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span>Sincronizar Asaas</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-colors border border-slate-300 uppercase tracking-wider"
          >
            <Upload className="w-3 h-3" />
            <span>Importar</span>
          </button>

          <button
            onClick={handleExportExcel}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border uppercase tracking-wider relative ${
              selectedIds.size > 0 
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20' 
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
            }`}
            title={selectedIds.size > 0 ? `Exportar ${selectedIds.size} itens selecionados` : 'Exportar todos os filtrados'}
          >
            <Download className="w-3 h-3" />
            <span>Excel</span>
            {selectedIds.size > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-emerald-900 text-[8px] px-1 rounded-full border border-white">
                {selectedIds.size}
              </span>
            )}
          </button>

          <button
            onClick={handleExportPDF}
            disabled={isExportingPdf}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border uppercase tracking-wider relative disabled:opacity-60 ${
              selectedIds.size > 0
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-500/20'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
            }`}
            title={selectedIds.size > 0 ? `Exportar ${selectedIds.size} itens selecionados` : 'Exportar todos os filtrados'}
          >
            {isExportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            <span>{isExportingPdf ? 'Gerando...' : 'PDF'}</span>
            {selectedIds.size > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-900 text-[8px] px-1 rounded-full border border-white">
                {selectedIds.size}
              </span>
            )}
          </button>

          <button
            onClick={onNavigateBases}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white rounded-lg text-[10px] font-black shadow-sm hover:shadow-md transition-all uppercase tracking-widest hover:scale-105 active:scale-95"
          >
            <Database className="w-3 h-3" />
            <span>Gerenciar Bases</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-[10px] font-black shadow-md shadow-blue-500/20 transition-all uppercase tracking-widest hover:scale-105 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Registro</span>
          </button>
        </div>
      </div>

      {/* Filters Bar - Modernized */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/60 shadow-sm space-y-4 transition-all">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Enhanced Search Input */}
          <div className="relative flex-1 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar por franquia, CNPJ, categoria ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/40 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50 transition-all shadow-sm outline-none hover:bg-slate-100/80 dark:hover:bg-slate-800/50 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Grid Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="min-w-0 flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                title="Data Inicial"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="min-w-0 flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                title="Data Final"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
            >
              <option value="todos">Todos os Status</option>
              <option value="Recebida">Recebida</option>
              <option value="Confirmada">Confirmada</option>
              <option value="Aguardando pagamento">Pendente</option>
              <option value="Atrasado">Atrasado</option>
            </select>

            <select
              value={competenciaFilter}
              onChange={(e) => setCompetenciaFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer uppercase"
            >
              <option value="todas">Comp. Todas</option>
              {competencias.map((comp) => (
                <option key={comp} value={comp}>{comp}</option>
              ))}
            </select>

            <select
              value={cCustoFilter}
              onChange={(e) => setCCustoFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
            >
              <option value="todos">C. Custo: Todos</option>
              {costCenters.map((cc) => (
                <option key={cc} value={cc}>{cc}</option>
              ))}
            </select>
          </div>

          {(search || statusFilter !== 'todos' || competenciaFilter !== 'todas' || cCustoFilter !== 'todos' || startDate || endDate) && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('todos');
                setCompetenciaFilter('todas');
                setCCustoFilter('todos');
                setStartDate('');
                setEndDate('');
              }}
              className="px-3 py-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors flex items-center justify-center border border-rose-100 dark:border-rose-900/30"
              title="Limpar Filtros"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Spreadsheet Table Data Grid - Denser */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
        {/* Bulk Action Bar - Improved */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="absolute top-0 left-0 right-0 z-30 bg-slate-900 text-white dark:bg-slate-900 px-6 py-2.5 flex items-center justify-between shadow-lg"
            >
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-black">
                    {selectedIds.size}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                    Itens Selecionados
                  </span>
                </div>

                <div className="h-6 w-px bg-slate-700" />

                <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Exportar:</span>
                  <button
                    onClick={() => exportToExcel(items.filter(i => selectedIds.has(i.id)))}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[9px] font-black uppercase transition-all border border-emerald-500/20"
                  >
                    <Download className="w-3 h-3" />
                    <span>Excel</span>
                  </button>
                  <button
                    onClick={handleExportPDF}
                    disabled={isExportingPdf}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-[9px] font-black uppercase transition-all border border-rose-500/20 disabled:opacity-60"
                  >
                    {isExportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                    <span>{isExportingPdf ? 'Gerando...' : 'PDF'}</span>
                  </button>
                </div>

                <div className="h-6 w-px bg-slate-700" />

                <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ações em Massa:</span>
                  <button onClick={() => handleBulkStatusChange('Recebida')} className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[9px] font-black uppercase transition-all border border-emerald-500/20">Recebida</button>
                  <button onClick={() => handleBulkStatusChange('Confirmada')} className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-[9px] font-black uppercase transition-all border border-blue-500/20">Confirmada</button>
                  <button onClick={() => handleBulkStatusChange('Aguardando pagamento')} className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-[9px] font-black uppercase transition-all border border-amber-500/20">Pendente</button>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-lg text-[9px] font-black uppercase transition-all border border-rose-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Seleção</span>
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
          <table className="w-full min-w-[1200px] text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-blue-50/60 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 dark:border-slate-600 dark:bg-slate-700"
                  />
                </th>
                {columns.filter(c => c.visible).map(col => (
                  <th key={col.id} className="py-2 px-3">{col.label}</th>
                ))}
                <th className="py-2 px-3 text-right w-20 sticky right-0 bg-blue-50/60 dark:bg-slate-800/60 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px] text-slate-700 dark:text-slate-300">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(columnVisibility).filter(Boolean).length + 2} className="text-center py-12 text-slate-400 dark:text-slate-500 italic bg-slate-50/30 dark:bg-slate-800/30">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Search className="w-8 h-8 text-slate-200" />
                      <span>Nenhum registro encontrado para os filtros aplicados.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id} className={`hover:bg-blue-50/40 dark:hover:bg-blue-900/20 transition-colors group ${selectedIds.has(item.id) ? 'bg-blue-50/60 dark:bg-blue-900/30' : ''}`}>
                    <td className="py-2 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
                      />
                    </td>
                    {columnVisibility.franquia && (
                      <td className={`py-2 px-4 font-bold truncate max-w-[200px] relative group/cell ${validateCell(item.franquia, 'franquia') ? 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/20' : 'text-slate-900 dark:text-slate-100'}`} title={validateCell(item.franquia, 'franquia') || item.franquia}>
                        <div className="flex items-center space-x-1">
                          {validateCell(item.franquia, 'franquia') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
                          <span className="truncate">{item.franquia}</span>
                        </div>
                      </td>
                    )}
                    {columnVisibility.cnpj && (
                      <td className={`py-2 px-4 font-mono tracking-tighter relative group/cell ${validateCell(item.cnpj, 'cnpj') ? 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/20' : 'text-slate-500 dark:text-slate-400'}`} title={validateCell(item.cnpj, 'cnpj') || item.cnpj}>
                        <div className="flex items-center space-x-1">
                          {validateCell(item.cnpj, 'cnpj') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
                          <span>
                            {item.cnpj.length === 14 
                              ? item.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
                              : item.cnpj}
                          </span>
                        </div>
                      </td>
                    )}
                    {columnVisibility.cCusto && <td className="py-2 px-4 font-medium text-slate-600 dark:text-slate-300">{item.cCusto}</td>}
                    {columnVisibility.categoria && (
                      <td className="py-2 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-black text-[9px] uppercase tracking-wider border ${getCategoryStyle(item.categoria)}`}>
                          {item.categoria || 'Outros'}
                        </span>
                      </td>
                    )}
                    {columnVisibility.dataCriacao && (
                      <td className={`py-2 px-4 relative group/cell ${validateCell(item.dataCriacao, 'dataCriacao') ? 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/20' : 'text-slate-500 dark:text-slate-400'}`} title={validateCell(item.dataCriacao, 'dataCriacao') || ''}>
                        <div className="flex items-center space-x-1">
                          {validateCell(item.dataCriacao, 'dataCriacao') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
                          <span>{item.dataCriacao}</span>
                        </div>
                      </td>
                    )}
                    {columnVisibility.vencimento && (
                      <td className={`py-2 px-4 font-bold relative group/cell ${validateCell(item.vencimento, 'vencimento') ? 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/20' : 'text-slate-800 dark:text-slate-200'}`} title={validateCell(item.vencimento, 'vencimento') || ''}>
                        <div className="flex items-center space-x-1">
                          {validateCell(item.vencimento, 'vencimento') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
                          <span>{item.vencimento}</span>
                        </div>
                      </td>
                    )}
                    {columnVisibility.vencimentoOriginal && <td className="py-2 px-4 text-slate-400 dark:text-slate-500 italic">{item.vencimentoOriginal}</td>}
                    {columnVisibility.dataPagamento && (
                      <td className="py-2 px-4">
                        {item.dataPagamento ? (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{item.dataPagamento}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>
                    )}
                    {columnVisibility.valor && (
                      <td className={`py-2 px-4 font-black relative group/cell ${validateCell(item.valor, 'valor') ? 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/20' : 'text-slate-900 dark:text-slate-100'}`} title={validateCell(item.valor, 'valor') || ''}>
                        <div className="flex items-baseline space-x-0.5">
                          {validateCell(item.valor, 'valor') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0 mr-1 self-center" />}
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold">R$</span>
                          <span>{item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </td>
                    )}
                    {columnVisibility.status && (
                      <td className="py-2 px-4">
                        <select
                          value={item.status}
                          onChange={(e) => onUpdateItem({ ...item, status: e.target.value as any })}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-xs cursor-pointer appearance-none ${
                            item.status === 'Recebida' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' :
                            item.status === 'Confirmada' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50' :
                            item.status === 'Atrasado' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50' :
                            'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                          }`}
                        >
                          <option value="Recebida">Recebida</option>
                          <option value="Confirmada">Confirmada</option>
                          <option value="Aguardando pagamento">Pendente</option>
                          <option value="Atrasado">Atrasado</option>
                        </select>
                      </td>
                    )}
                    {columnVisibility.competenciaRecolhimento && <td className="py-2 px-4 font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">{item.competenciaRecolhimento}</td>}
                    {columnVisibility.competenciaPagamento && <td className="py-2 px-4 uppercase text-slate-300 dark:text-slate-600 font-bold">{item.competenciaPagamento || '-'}</td>}
                    {columnVisibility.descricao && <td className="py-2 px-4 text-slate-500 dark:text-slate-400 truncate max-w-[150px]" title={item.descricao}>{item.descricao}</td>}
                    <td className="py-2 px-4 text-right sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-blue-50/40 dark:group-hover:bg-blue-900/20 transition-colors shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Sticky Table Footer Summary - Compact */}
        <div className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3 z-20 sticky bottom-0">
          <div className="flex items-center space-x-4">
            <div className="flex flex-col">
              <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Registros</span>
              <span className="text-xs font-black">
                {filteredItems.length} <span className="text-slate-400 dark:text-slate-600 font-bold text-[10px]">/ {items.length}</span>
              </span>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-white dark:disabled:hover:bg-slate-800 transition-colors"
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
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-white dark:disabled:hover:bg-slate-800 transition-colors"
                title="Próxima página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center space-x-4">
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-800"></div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-blue-600 dark:text-blue-500 uppercase font-black tracking-widest">Total Filtro</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold">R$</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {filteredItems.reduce((s, i) => s + i.valor, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingItem ? 'Editar Registro de Recolhimento' : 'Novo Registro de Recolhimento'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Franquia (Unidade) *</label>
                  <select
                    required
                    value={formData.franquia || ''}
                    onChange={(e) => {
                      const selected = unidades.find(u => u.nome === e.target.value);
                      if (selected) {
                        setFormData({
                          ...formData,
                          franquia: selected.nome,
                          cnpj: selected.cnpj,
                          cCusto: selected.cCustoPadrao || formData.cCusto
                        });
                      } else {
                        setFormData({ ...formData, franquia: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Selecione uma unidade...</option>
                    {unidades.map(u => (
                      <option key={u.id} value={u.nome}>{u.nome}</option>
                    ))}
                    <option value="custom">+ Digitar manualmente...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">CNPJ</label>
                  <input
                    type="text"
                    value={formData.cnpj || ''}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    placeholder="Ex: 64058389000109"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500/20 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Centro de Custo</label>
                  <input
                    type="text"
                    value={formData.cCusto || ''}
                    onChange={(e) => setFormData({ ...formData, cCusto: e.target.value })}
                    placeholder="Ex: CANINDÉ"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Categoria</label>
                  <select
                    value={formData.categoria || ''}
                    onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
                  >
                    <option value="">Selecione...</option>
                    {baseCategories.map(cat => (
                      <option key={cat.id} value={cat.nome}>{cat.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Valor do Recolhimento (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.valor || 0}
                    onChange={(e) => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-bold focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Data da Criação</label>
                  <input
                    type="text"
                    value={formData.dataCriacao || ''}
                    onChange={(e) => setFormData({ ...formData, dataCriacao: e.target.value })}
                    placeholder="DD/MM/AAAA"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Vencimento</label>
                  <input
                    type="text"
                    value={formData.vencimento || ''}
                    onChange={(e) => setFormData({ ...formData, vencimento: e.target.value })}
                    placeholder="DD/MM/AAAA"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Vencimento Original</label>
                  <input
                    type="text"
                    value={formData.vencimentoOriginal || ''}
                    onChange={(e) => setFormData({ ...formData, vencimentoOriginal: e.target.value })}
                    placeholder="DD/MM/AAAA"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Data do Pagamento</label>
                  <input
                    type="text"
                    value={formData.dataPagamento || ''}
                    onChange={(e) => setFormData({ ...formData, dataPagamento: e.target.value })}
                    placeholder="DD/MM/AAAA (vazio se pendente)"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={formData.status || 'Aguardando pagamento'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="Recebida">Recebida</option>
                    <option value="Confirmada">Confirmada</option>
                    <option value="Aguardando pagamento">Aguardando pagamento</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Competência Recolhimento</label>
                  <input
                    type="text"
                    value={formData.competenciaRecolhimento || ''}
                    onChange={(e) => setFormData({ ...formData, competenciaRecolhimento: e.target.value })}
                    placeholder="Ex: ago/26"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Competência Pagamento</label>
                  <input
                    type="text"
                    value={formData.competenciaPagamento || ''}
                    onChange={(e) => setFormData({ ...formData, competenciaPagamento: e.target.value })}
                    placeholder="Ex: set/26"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={formData.descricao || ''}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descrição detalhada do recolhimento..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Registro</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast — substitui o alert() nativo do navegador */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center space-x-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-emerald-600/95 border-emerald-400/30 text-white shadow-emerald-600/30'
                : 'bg-rose-600/95 border-rose-400/30 text-white shadow-rose-600/30'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span className="text-xs font-bold">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="text-white/70 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmBulkDelete}
        message={`Deseja excluir os ${selectedIds.size} registros selecionados? Essa ação não pode ser desfeita.`}
        onConfirm={confirmBulkDeleteAction}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
});
