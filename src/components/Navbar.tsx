import React, { useState } from 'react';
import { ActiveTab, RecolhimentoItem } from '../types';
import { MunagoLogo } from './MunagoLogo';
import { LayoutDashboard, FileSpreadsheet, Target, Bell, Download, Plus, FileText, Loader2 } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportImport';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  items: RecolhimentoItem[];
  onAddNew: () => void;
  unreadNotificationsCount: number;
  sessionToken: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  items,
  onAddNew,
  unreadNotificationsCount,
  sessionToken,
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await exportToPDF(items, 'relatorio_recolhimento.pdf', undefined, undefined, sessionToken);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <MunagoLogo size="sm" />
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex space-x-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab('tabela')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'tabela'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Planilha / Dados</span>
            </button>
            <button
              onClick={() => setActiveTab('metas')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'metas'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>Metas & Alertas</span>
            </button>
            <button
              onClick={() => setActiveTab('notificacoes')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
                activeTab === 'notificacoes'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Notificações</span>
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => exportToExcel(items)}
              title="Exportar para Excel (.xlsx)"
              className="hidden sm:flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors border border-emerald-200"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>

            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              title="Exportar para PDF"
              className="hidden sm:flex items-center space-x-1.5 px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-semibold transition-colors border border-rose-200 disabled:opacity-60"
            >
              {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span>{isExportingPdf ? 'Gerando...' : 'PDF'}</span>
            </button>

            <button
              onClick={onAddNew}
              className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Registro</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden overflow-x-auto py-2 space-x-2 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('tabela')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === 'tabela' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Planilha</span>
          </button>
          <button
            onClick={() => setActiveTab('metas')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === 'metas' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Metas</span>
          </button>
          <button
            onClick={() => setActiveTab('notificacoes')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === 'notificacoes' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alertas</span>
          </button>
        </div>
      </div>
    </header>
  );
};
