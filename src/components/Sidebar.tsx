import React, { useState } from 'react';
import { ActiveTab, RecolhimentoItem, AuthUser } from '../types';
import { MunagoLogo } from './MunagoLogo';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Target,
  Bell,
  Download,
  Plus,
  FileText,
  ShieldCheck,
  CreditCard,
  Menu,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Database,
  FileBarChart,
  Users,
} from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportImport';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  items: RecolhimentoItem[];
  onAddNew: () => void;
  unreadNotificationsCount: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onLogout: () => void;
  currentUser: AuthUser | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  items,
  onAddNew,
  unreadNotificationsCount,
  isOpen,
  setIsOpen,
  onLogout,
  currentUser,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-xs"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="tour-sidebar"
        className={`fixed md:static inset-y-0 left-0 z-50 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'w-16' : 'w-64'}`}
      >
        {/* Plain wrapper (no competing position utility) so the floating handle below
            anchors reliably to the sidebar box regardless of the aside's own fixed/static value. */}
        <div className="relative flex flex-col h-full">
        {/* Collapse handle — floats on the sidebar's edge so it never crowds the logo/title */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute top-6 -right-3 z-10 items-center justify-center w-6 h-6 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-full shadow-md transition-colors"
          title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} /> : <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />}
        </button>

        {/* Brand Header - Compact */}
        <div className={`p-4 border-b border-slate-200 dark:border-slate-800 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && <MunagoLogo size="sm" />}
          <button
            onClick={() => setIsOpen(false)}
            className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Action Button - Compact */}
        <div className="p-3">
          <button
            onClick={() => {
              onAddNew();
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all uppercase tracking-widest shadow-md shadow-blue-600/20 ${
              isCollapsed ? 'p-2' : 'space-x-1.5 py-2 px-3 text-[11px] font-black'
            }`}
            title="Novo Registro"
          >
            <Plus className="w-4 h-4" />
            {!isCollapsed && <span>Novo Registro</span>}
          </button>
        </div>

        {/* Navigation Links - Denser */}
        <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto custom-scrollbar">
          {!isCollapsed && (
            <p className="px-2 pb-1.5 text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">
              Menu
            </p>
          )}

          <button
            onClick={() => {
              setActiveTab('dashboard');
              setIsOpen(false);
            }}
            className={`w-full flex items-center rounded-lg transition-all ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Dashboard"
          >
            <LayoutDashboard className="w-4 h-4" />
            {!isCollapsed && <span>Dashboard</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab('tabela');
              setIsOpen(false);
            }}
            className={`w-full flex items-center rounded-lg transition-all ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'tabela'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Planilha"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {!isCollapsed && <span>Planilha</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab('bases');
              setIsOpen(false);
            }}
            className={`w-full flex items-center rounded-lg transition-all ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'bases'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Gestão de Bases"
          >
            <Database className="w-4 h-4" />
            {!isCollapsed && <span>Bases</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab('metas');
              setIsOpen(false);
            }}
            className={`w-full flex items-center rounded-lg transition-all ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'metas'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Metas"
          >
            <Target className="w-4 h-4" />
            {!isCollapsed && <span>Metas</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab('notificacoes');
              setIsOpen(false);
            }}
            className={`w-full flex items-center rounded-lg transition-all ${
              isCollapsed ? 'justify-center p-2.5 relative' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold justify-between'
            } ${
              activeTab === 'notificacoes'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Notificações"
          >
            <div className={`flex items-center ${isCollapsed ? '' : 'space-x-2.5'}`}>
              <Bell className="w-4 h-4" />
              {!isCollapsed && <span>Notificações</span>}
            </div>
            {!isCollapsed && unreadNotificationsCount > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">
                {unreadNotificationsCount}
              </span>
            )}
            {isCollapsed && unreadNotificationsCount > 0 && (
              <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white dark:border-slate-900" />
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('asaas');
              setIsOpen(false);
            }}
            className={`w-full flex items-center rounded-lg transition-all ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'asaas'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Conta ASAAS"
          >
            <CreditCard className={`w-4 h-4 ${isCollapsed ? 'text-emerald-400' : 'text-emerald-400'}`} />
            {!isCollapsed && <span>Banco ASAAS</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab('relatorios');
              setIsOpen(false);
            }}
            className={`w-full flex items-center rounded-lg transition-all ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'relatorios'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Relatórios Personalizados"
          >
            <FileBarChart className="w-4 h-4" />
            {!isCollapsed && <span>Relatórios</span>}
          </button>

          {currentUser?.role === 'admin' && (
            <button
              onClick={() => {
                setActiveTab('usuarios');
                setIsOpen(false);
              }}
              className={`w-full flex items-center rounded-lg transition-all ${
                isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
              } ${
                activeTab === 'usuarios'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Usuários"
            >
              <Users className="w-4 h-4" />
              {!isCollapsed && <span>Usuários</span>}
            </button>
          )}
        </nav>

        {/* User Footer - Compact */}
        <div className={`p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 flex flex-col space-y-3`}>
          {!isCollapsed && currentUser && (
            <div className="flex items-center space-x-2.5 px-1">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                {currentUser.name
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase() || currentUser.email[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-slate-900 dark:text-white truncate uppercase tracking-tight">{currentUser.name || currentUser.email}</p>
                <p className="text-[8px] text-slate-500 truncate">{currentUser.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
              </div>
            </div>
          )}
          
          <button 
            onClick={onLogout}
            className={`w-full flex items-center rounded-lg transition-all uppercase tracking-widest ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2 text-[11px] font-black text-rose-500 hover:bg-rose-500/10 border border-rose-500/20'
            }`}
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span>Sair</span>}
          </button>
        </div>
        </div>
      </aside>
    </>
  );
};
