import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  LifeBuoy,
  Mail,
  MessageCircle,
  X,
} from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportImport';

// Contato de suporte. WhatsApp só com dígitos (DDI+DDD+número), formato
// que o link wa.me espera.
const SUPPORT_EMAIL = 'muurisattos@gmail.com';
const SUPPORT_WHATSAPP = '5511951366825';
const SUPPORT_WHATSAPP_DISPLAY = '+55 11 95136-6825';

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
  const [showSupportModal, setShowSupportModal] = useState(false);

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
        className={`fixed md:static inset-y-0 left-0 z-50 bg-gradient-to-b from-white via-white to-slate-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 border-r border-slate-200/80 dark:border-slate-800/60 transition-all duration-300 ease-in-out ${
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
        <div className={`p-4 border-b border-slate-200/60 dark:border-slate-800/40 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
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
            className={`w-full flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-blue-600/25 hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] ${
              isCollapsed ? 'p-2' : 'space-x-1.5 py-2.5 px-3 text-[11px] font-black'
            }`}
            title="Novo Registro"
          >
            <Plus className="w-4 h-4" />
            {!isCollapsed && <span>Novo Registro</span>}
          </button>
        </div>

        {/* Navigation Links - Denser */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          {!isCollapsed && (
            <p className="px-2 pb-2 text-[9px] font-black text-slate-400/80 dark:text-slate-600 uppercase tracking-[0.15em]">
              Menu
            </p>
          )}

          <button
            onClick={() => {
              setActiveTab('dashboard');
              setIsOpen(false);
            }}
            className={`w-full flex items-center rounded-xl transition-all duration-200 ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-0.5'
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
            className={`w-full flex items-center rounded-xl transition-all duration-200 ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'tabela'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-0.5'
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
            className={`w-full flex items-center rounded-xl transition-all duration-200 ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'bases'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-0.5'
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
            className={`w-full flex items-center rounded-xl transition-all duration-200 ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'metas'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-0.5'
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
            className={`w-full flex items-center rounded-xl transition-all duration-200 ${
              isCollapsed ? 'justify-center p-2.5 relative' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold justify-between'
            } ${
              activeTab === 'notificacoes'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-0.5'
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
            className={`w-full flex items-center rounded-xl transition-all duration-200 ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'asaas'
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-0.5'
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
            className={`w-full flex items-center rounded-xl transition-all duration-200 ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } ${
              activeTab === 'relatorios'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-0.5'
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
              className={`w-full flex items-center rounded-xl transition-all duration-200 ${
                isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
              } ${
                activeTab === 'usuarios'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-0.5'
              }`}
              title="Usuários"
            >
              <Users className="w-4 h-4" />
              {!isCollapsed && <span>Usuários</span>}
            </button>
          )}
        </nav>

        {/* User Footer - Compact */}
        <div className={`p-3 border-t border-slate-200/60 dark:border-slate-800/40 bg-gradient-to-t from-slate-100/80 to-slate-50/40 dark:from-slate-950/60 dark:to-slate-900/30 flex flex-col space-y-3`}>
          <button
            onClick={() => setShowSupportModal(true)}
            className={`w-full flex items-center rounded-xl transition-all duration-200 ${
              isCollapsed ? 'justify-center p-2.5' : 'space-x-2.5 px-3 py-2.5 text-[11px] font-bold'
            } text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white`}
            title="Suporte"
          >
            <LifeBuoy className="w-4 h-4" />
            {!isCollapsed && <span>Suporte</span>}
          </button>

          {!isCollapsed && currentUser && (
            <div className="flex items-center space-x-2.5 px-1">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-black text-white shrink-0 ring-2 ring-blue-400/20 ring-offset-1 ring-offset-white dark:ring-offset-slate-900">
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
            className={`w-full flex items-center rounded-xl transition-all duration-200 uppercase tracking-widest ${
              isCollapsed ? 'justify-center p-2.5 text-rose-500 hover:bg-rose-500/10' : 'space-x-2.5 px-3 py-2 text-[11px] font-black text-rose-500 hover:bg-rose-500/10 border border-rose-500/15 hover:border-rose-500/30'
            }`}
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span>Sair</span>}
          </button>
        </div>
        </div>
      </aside>

      {/* Modal de Suporte */}
      <AnimatePresence>
        {showSupportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSupportModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20">
                    <LifeBuoy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">Suporte</h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">Fale direto com o Murillo</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSupportModal(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Precisa de uma atualização, achou um problema, ou quer suporte? Manda mensagem direto por um dos canais abaixo.
                </p>

                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Suporte Munago')}`}
                  className="flex items-center space-x-3 p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl transition-colors group"
                >
                  <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-105 transition-transform">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 dark:text-slate-100">Enviar e-mail</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{SUPPORT_EMAIL}</p>
                  </div>
                </a>

                <a
                  href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('Olá! Preciso de suporte no sistema Munago.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl transition-colors group"
                >
                  <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl group-hover:scale-105 transition-transform">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 dark:text-slate-100">Mensagem no WhatsApp</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{SUPPORT_WHATSAPP_DISPLAY}</p>
                  </div>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
