import React, { useRef, useState } from 'react';
import { Unidade, BaseCategory } from '../types';
import { Plus, Trash2, Edit2, Database, Building2, Tags, Save, X, Search, CheckCircle2, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BasesManagerViewProps {
  unidades: Unidade[];
  categorias: BaseCategory[];
  // Unidades carregam a chave ASAAS — agora compartilhada entre todo mundo
  // (ver App.tsx), então só admin pode criar/editar/excluir uma. Categorias
  // não têm esse dado sensível, continuam liberadas pra qualquer um.
  canEditUnidades: boolean;
  onAddUnidade: (u: Unidade) => void;
  onUpdateUnidade: (u: Unidade) => void;
  onDeleteUnidade: (id: string) => void;
  onAddCategoria: (c: BaseCategory) => void;
  onUpdateCategoria: (c: BaseCategory) => void;
  onDeleteCategoria: (id: string) => void;
}

export const BasesManagerView: React.FC<BasesManagerViewProps> = ({
  unidades,
  categorias,
  canEditUnidades,
  onAddUnidade,
  onUpdateUnidade,
  onDeleteUnidade,
  onAddCategoria,
  onUpdateCategoria,
  onDeleteCategoria,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'unidades' | 'categorias'>('unidades');
  const [search, setSearch] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  // Notificação de sucesso após salvar/excluir — sem isso o clique some no
  // vazio, sem confirmar se a ação realmente aconteceu.
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMsg(message);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(null), 3000);
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData(activeSubTab === 'unidades' ? { nome: '', cnpj: '', cCustoPadrao: 'CANINDÉ', asaasApiKey: '' } : { nome: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setFormData({ ...item, asaasApiKey: '' });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome) return;

    const isEditing = Boolean(editingItem);
    const label = activeSubTab === 'unidades' ? 'Unidade' : 'Categoria';

    if (activeSubTab === 'unidades') {
      if (editingItem) {
        onUpdateUnidade({ ...editingItem, ...formData });
      } else {
        onAddUnidade({ id: `u-${Date.now()}`, ...formData });
      }
    } else {
      if (editingItem) {
        onUpdateCategoria({ ...editingItem, ...formData });
      } else {
        onAddCategoria({ id: `c-${Date.now()}`, ...formData });
      }
    }
    setIsModalOpen(false);
    showToast(`${label} ${isEditing ? 'atualizada' : 'adicionada'} com sucesso.`);
  };

  const handleDelete = (id: string) => {
    const label = activeSubTab === 'unidades' ? 'Unidade' : 'Categoria';
    if (activeSubTab === 'unidades') {
      onDeleteUnidade(id);
    } else {
      onDeleteCategoria(id);
    }
    showToast(`${label} excluída com sucesso.`);
  };

  const canEdit = activeSubTab === 'unidades' ? canEditUnidades : true;

  const filteredUnidades = unidades.filter(u =>
    u.nome.toLowerCase().includes(search.toLowerCase()) || 
    u.cnpj.includes(search)
  );

  const filteredCategorias = categorias.filter(c => 
    c.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
            <Database className="w-5 h-5 text-blue-600" />
            <span>Gestão de Bases</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">Gerencie as unidades (franquias) e categorias mestras do sistema.</p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubTab('unidades')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${
              activeSubTab === 'unidades' 
                ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Unidades</span>
          </button>
          <button
            onClick={() => setActiveSubTab('categorias')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${
              activeSubTab === 'categorias' 
                ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Tags className="w-3.5 h-3.5" />
            <span>Categorias</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder={`Buscar ${activeSubTab === 'unidades' ? 'unidade' : 'categoria'}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 outline-none"
            />
          </div>
          
          {canEdit ? (
            <button
              onClick={handleOpenAdd}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-blue-600/20 uppercase tracking-widest"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar {activeSubTab === 'unidades' ? 'Unidade' : 'Categoria'}</span>
            </button>
          ) : (
            <span className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2 text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              <Lock className="w-3 h-3" />
              Somente admin edita unidades
            </span>
          )}
        </div>

        {/* List Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-6">{activeSubTab === 'unidades' ? 'Nome da Unidade' : 'Nome da Categoria'}</th>
                {activeSubTab === 'unidades' && <th className="py-3 px-6">CNPJ</th>}
                {activeSubTab === 'unidades' && <th className="py-3 px-6">C. Custo Padrão</th>}
                {activeSubTab === 'unidades' && <th className="py-3 px-6">Chave ASAAS</th>}
                <th className="py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-300">
              {(activeSubTab === 'unidades' ? filteredUnidades : filteredCategorias).length === 0 ? (
                <tr>
                  <td colSpan={activeSubTab === 'unidades' ? 5 : 2} className="py-12 text-center text-slate-400 italic">
                    Nenhum item encontrado.
                  </td>
                </tr>
              ) : (
                (activeSubTab === 'unidades' ? filteredUnidades : filteredCategorias).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                    <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${activeSubTab === 'unidades' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'bg-purple-50 dark:bg-purple-900/20 text-purple-600'}`}>
                          {activeSubTab === 'unidades' ? <Building2 className="w-4 h-4" /> : <Tags className="w-4 h-4" />}
                        </div>
                        <span>{item.nome}</span>
                      </div>
                    </td>
                    {activeSubTab === 'unidades' && (
                      <td className="py-4 px-6 font-mono text-slate-500">{(item as any).cnpj || '-'}</td>
                    )}
                    {activeSubTab === 'unidades' && (
                      <td className="py-4 px-6 font-medium text-slate-600">{(item as any).cCustoPadrao || '-'}</td>
                    )}
                    {activeSubTab === 'unidades' && (
                      <td className="py-4 px-6">
                        {(item as any).hasAsaasKey ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Configurada</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                            <span>Pendente</span>
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-4 px-6 text-right">
                      {canEdit ? (
                        <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 ml-auto" />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Total de Unidades</p>
              <h3 className="text-2xl font-black text-blue-900 dark:text-blue-100">{unidades.length}</h3>
            </div>
            <Building2 className="w-8 h-8 text-blue-200 dark:text-blue-800" />
          </div>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/30 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Categorias Mestras</p>
              <h3 className="text-2xl font-black text-purple-900 dark:text-purple-100">{categorias.length}</h3>
            </div>
            <Tags className="w-8 h-8 text-purple-200 dark:text-purple-800" />
          </div>
        </div>
      </div>

      {/* Modal Add/Edit */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {editingItem ? 'Editar' : 'Adicionar'} {activeSubTab === 'unidades' ? 'Unidade' : 'Categoria'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nome / Razão Social</label>
                  <input
                    type="text"
                    required
                    value={formData.nome || ''}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                    placeholder={`Ex: ${activeSubTab === 'unidades' ? 'Unidade Centro' : 'Royalties'}`}
                  />
                </div>

                {activeSubTab === 'unidades' && (
                  <>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">CNPJ</label>
                      <input
                        type="text"
                        value={formData.cnpj || ''}
                        onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">C. Custo Padrão</label>
                      <input
                        type="text"
                        value={formData.cCustoPadrao || ''}
                        onChange={(e) => setFormData({ ...formData, cCustoPadrao: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                        placeholder="Ex: CANINDÉ"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Chave de API ASAAS</label>
                      <input
                        type="password"
                        value={formData.asaasApiKey || ''}
                        onChange={(e) => setFormData({ ...formData, asaasApiKey: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500/20 outline-none"
                        placeholder={editingItem && editingItem.hasAsaasKey ? "*** Configurada (digite para alterar) ***" : "$aact_YTU5Y... (Access Token desta unidade)"}
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Usada para gerar cobranças ASAAS desta unidade. Fica só aqui, não aparece na tela de Integração.</p>
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-black rounded-xl text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 uppercase tracking-widest flex items-center justify-center space-x-2"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -12, x: '-50%' }}
            className="fixed top-6 left-1/2 z-[100] flex items-center gap-2 bg-emerald-600 text-white pl-3.5 pr-4 py-2.5 rounded-xl shadow-2xl shadow-emerald-600/30 text-xs font-bold"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
