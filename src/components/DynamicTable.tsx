import React from 'react';
import { RecolhimentoItem } from '../types';
import { Edit2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

interface DynamicTableProps {
  items: RecolhimentoItem[];
  columns: { id: string; label: string; visible: boolean }[];
  selectedIds: Set<string>;
  toggleSelectItem: (id: string) => void;
  onOpenEdit: (item: RecolhimentoItem) => void;
  onDeleteItem: (id: string) => void;
  validateCell: (value: any, field: string) => string | null;
}

export const DynamicTable: React.FC<DynamicTableProps> = ({ items, columns, selectedIds, toggleSelectItem, onOpenEdit, onDeleteItem, validateCell }) => {
  const renderCell = (item: RecolhimentoItem, colId: string) => {
    switch (colId) {
      case 'franquia':
        return (
          <td className={`py-2 px-4 font-bold truncate max-w-[200px] relative group/cell ${validateCell(item.franquia, 'franquia') ? 'text-rose-600 bg-rose-50/50' : 'text-slate-900'}`} title={validateCell(item.franquia, 'franquia') || item.franquia}>
            <div className="flex items-center space-x-1">
              {validateCell(item.franquia, 'franquia') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
              <span className="truncate">{item.franquia}</span>
            </div>
          </td>
        );
      case 'cnpj':
        return (
          <td className={`py-2 px-4 font-mono tracking-tighter relative group/cell ${validateCell(item.cnpj, 'cnpj') ? 'text-rose-600 bg-rose-50/50' : 'text-slate-500'}`} title={validateCell(item.cnpj, 'cnpj') || item.cnpj}>
            <div className="flex items-center space-x-1">
              {validateCell(item.cnpj, 'cnpj') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
              <span>{item.cnpj.length === 14 ? item.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : item.cnpj}</span>
            </div>
          </td>
        );
      case 'cCusto': return <td className="py-2 px-4 font-medium text-slate-600">{item.cCusto}</td>;
      case 'categoria':
        return (
          <td className="py-2 px-4">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-black text-[9px] uppercase tracking-wider border border-slate-200">
              {item.categoria || 'Outros'}
            </span>
          </td>
        );
      case 'dataCriacao':
        return (
          <td className={`py-2 px-4 relative group/cell ${validateCell(item.dataCriacao, 'dataCriacao') ? 'text-rose-600 bg-rose-50/50' : 'text-slate-500'}`} title={validateCell(item.dataCriacao, 'dataCriacao') || ''}>
            <div className="flex items-center space-x-1">
              {validateCell(item.dataCriacao, 'dataCriacao') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
              <span>{item.dataCriacao}</span>
            </div>
          </td>
        );
      case 'vencimento':
        return (
          <td className={`py-2 px-4 font-bold relative group/cell ${validateCell(item.vencimento, 'vencimento') ? 'text-rose-600 bg-rose-50/50' : 'text-slate-800'}`} title={validateCell(item.vencimento, 'vencimento') || ''}>
            <div className="flex items-center space-x-1">
              {validateCell(item.vencimento, 'vencimento') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
              <span>{item.vencimento}</span>
            </div>
          </td>
        );
      case 'vencimentoOriginal': return <td className="py-2 px-4 text-slate-400 italic">{item.vencimentoOriginal}</td>;
      case 'dataPagamento':
        return (
          <td className="py-2 px-4">
            {item.dataPagamento ? (
              <span className="font-bold text-emerald-600 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{item.dataPagamento}</span>
              </span>
            ) : (
              <span className="text-slate-300">-</span>
            )}
          </td>
        );
      case 'valor':
        return (
          <td className={`py-2 px-4 font-black relative group/cell ${validateCell(item.valor, 'valor') ? 'text-rose-600 bg-rose-50/50' : 'text-slate-900'}`} title={validateCell(item.valor, 'valor') || ''}>
            <div className="flex items-baseline space-x-0.5">
              {validateCell(item.valor, 'valor') && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0 mr-1 self-center" />}
              <span className="text-[9px] text-slate-400 font-bold">R$</span>
              <span>{item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </td>
        );
      case 'status':
        return (
          <td className="py-2 px-4">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-xs ${
                item.status === 'Recebida' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                item.status === 'Confirmada' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                item.status === 'Atrasado' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
              <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                item.status === 'Recebida' ? 'bg-emerald-500' : 
                item.status === 'Confirmada' ? 'bg-blue-500' : 
                item.status === 'Atrasado' ? 'bg-rose-500' :
                'bg-amber-500'
              }`} />
              {item.status === 'Aguardando pagamento' ? 'Pendente' : item.status}
            </span>
          </td>
        );
      case 'competenciaRecolhimento': return <td className="py-2 px-4 font-black uppercase text-slate-400 tracking-widest">{item.competenciaRecolhimento}</td>;
      case 'competenciaPagamento': return <td className="py-2 px-4 uppercase text-slate-300 font-bold">{item.competenciaPagamento || '-'}</td>;
      case 'descricao': return <td className="py-2 px-4 text-slate-500 truncate max-w-[150px]" title={item.descricao}>{item.descricao}</td>;
      default: return null;
    }
  };

  return (
    <>
      {items.map((item) => (
        <tr key={item.id} className={`hover:bg-blue-50/40 transition-colors group ${selectedIds.has(item.id) ? 'bg-blue-50/60' : ''}`}>
          <td className="py-2 px-4 text-center">
            <input 
              type="checkbox" 
              checked={selectedIds.has(item.id)}
              onChange={() => toggleSelectItem(item.id)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
            />
          </td>
          {columns.filter(c => c.visible).map(col => renderCell(item, col.id))}
          <td className="py-2 px-4 text-right sticky right-0 bg-white group-hover:bg-blue-50/40 transition-colors shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.1)]">
            <div className="flex items-center justify-end space-x-1">
              <button onClick={() => onOpenEdit(item)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => onDeleteItem(item.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
};
