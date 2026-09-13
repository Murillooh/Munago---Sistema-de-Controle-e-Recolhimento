import React, { useState, useEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ActiveTab, RecolhimentoItem, GoalSettings, AuthUser } from './types';
import { INITIAL_RECOLHIMENTOS, INITIAL_GOAL_SETTINGS } from './data/initialData';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { TableManagerView } from './components/TableManagerView';
import { MetasView } from './components/MetasView';
import { NotificationsView } from './components/NotificationsView';
import { AsaasIntegrationView } from './components/AsaasIntegrationView';
import { BasesManagerView } from './components/BasesManagerView';
import { ReportsView } from './components/ReportsView';
import { LoginView } from './components/LoginView';
import { AdminUsersView } from './components/AdminUsersView';
import { PreloadView } from './components/PreloadView';
import { GuidedTour } from './components/GuidedTour';
import { BrowserNotifications } from './components/BrowserNotifications';
import { ChatAssistant } from './components/ChatAssistant';
import { motion } from 'motion/react';
import { Menu, Bell, Download, FileText, Plus, Sun, Moon, HelpCircle, Database, FileBarChart, Search } from 'lucide-react';
import { exportToExcel, exportToPDF } from './utils/exportImport';
import { INITIAL_UNIDADES, INITIAL_BASE_CATEGORIES } from './data/initialBases';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500); // 1.5s delay to simulate loading
    return () => clearTimeout(timer);
  }, []);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('locgrupo_session');
    if (saved) {
      try {
        return JSON.parse(saved).user as AuthUser;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    const saved = localStorage.getItem('locgrupo_session');
    if (saved) {
      try {
        return JSON.parse(saved).token as string | null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const isAuthenticated = currentUser !== null;
  const [runTourTrigger, setRunTourTrigger] = useState(0);

  // Cada conta tem sua própria fatia do localStorage — sem isso, duas contas
  // usando o mesmo navegador enxergariam os dados uma da outra no cache local.
  // Enquanto ninguém logou ainda, cai numa chave "sem dono" só de transição
  // (a tela de login cobre a tela inteira nesse momento).
  const storageKey = (base: string) => (currentUser ? `${base}::${currentUser.id}` : base);

  const [unidades, setUnidades] = useState<any[]>(() => {
    const saved = localStorage.getItem(storageKey('locgrupo_unidades'));
    return saved ? JSON.parse(saved) : INITIAL_UNIDADES;
  });

  const [baseCategories, setBaseCategories] = useState<any[]>(() => {
    const saved = localStorage.getItem(storageKey('locgrupo_base_categories'));
    return saved ? JSON.parse(saved) : INITIAL_BASE_CATEGORIES;
  });

  useEffect(() => {
    localStorage.setItem(storageKey('locgrupo_unidades'), JSON.stringify(unidades));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidades, currentUser]);

  useEffect(() => {
    localStorage.setItem(storageKey('locgrupo_base_categories'), JSON.stringify(baseCategories));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCategories, currentUser]);

  const loadUserCache = <T,>(base: string, ownerId: string, fallback: T): T => {
    const saved = localStorage.getItem(`${base}::${ownerId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const handleLoginSuccess = (user: AuthUser, token: string | null) => {
    setCurrentUser(user);
    setSessionToken(token);
    localStorage.setItem('locgrupo_session', JSON.stringify({ user, token }));

    // Troca o cache local pro deste usuário (pode já ter algo salvo de uma
    // sessão anterior dele mesmo neste navegador).
    setItems(loadUserCache('locgrupo_recolhimentos', user.id, INITIAL_RECOLHIMENTOS));
    setGoalSettings(loadUserCache('locgrupo_goal_settings', user.id, INITIAL_GOAL_SETTINGS));
    setUnidades(loadUserCache('locgrupo_unidades', user.id, INITIAL_UNIDADES));
    setBaseCategories(loadUserCache('locgrupo_base_categories', user.id, INITIAL_BASE_CATEGORIES));
  };

  const handleLogout = () => {
    if (sessionToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }).catch(() => {});
    }
    setCurrentUser(null);
    setSessionToken(null);
    localStorage.removeItem('locgrupo_session');
    // Limpa da memória — a próxima conta a logar não deve ver rastro nenhum.
    setItems(INITIAL_RECOLHIMENTOS);
    setGoalSettings(INITIAL_GOAL_SETTINGS);
    setUnidades(INITIAL_UNIDADES);
    setBaseCategories(INITIAL_BASE_CATEGORIES);
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        document.getElementById('global-search-input')?.focus();
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        setActiveTab('tabela');
        if (tableManagerRef.current) {
          tableManagerRef.current.handleOpenAdd();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const tableManagerRef = React.useRef<any>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('locgrupo_dark_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('locgrupo_dark_mode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Animação de troca de tema: em vez de uma cor por cima (véu/tinta), usa a
  // View Transition API do navegador — ela tira um retrato real da tela antes
  // e depois da troca, e o círculo revela o retrato NOVO de verdade (ícones,
  // cores, tudo) crescendo a partir do botão clicado. Ou seja: os itens em si
  // vão "preenchendo" com a cor nova conforme o círculo passa, não uma camada
  // por cima deles. Sem suporte no navegador, cai pra troca instantânea.
  const THEME_ANIM_DURATION = 1600; // ms
  const [themeAnim, setThemeAnim] = useState<{ x: number; y: number; radius: number; toDark: boolean; key: number } | null>(null);

  useEffect(() => {
    if (!themeAnim) return;
    const t = setTimeout(() => setThemeAnim(null), THEME_ANIM_DURATION + 400);
    return () => clearTimeout(t);
  }, [themeAnim]);

  const handleThemeToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const toDark = !darkMode;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    setThemeAnim({ x, y, radius, toDark, key: Date.now() });

    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition) {
      setDarkMode(toDark);
      return;
    }

    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        setDarkMode(toDark);
        document.documentElement.classList.toggle('dark', toDark);
      });
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: THEME_ANIM_DURATION,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)',
        } as unknown as KeyframeAnimationOptions
      );
    });
  };

  const [items, setItems] = useState<RecolhimentoItem[]>(() => {
    const saved = localStorage.getItem(storageKey('locgrupo_recolhimentos'));
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_RECOLHIMENTOS;
      }
    }
    return INITIAL_RECOLHIMENTOS;
  });

  const [goalSettings, setGoalSettings] = useState<GoalSettings>(() => {
    const saved = localStorage.getItem(storageKey('locgrupo_goal_settings'));
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_GOAL_SETTINGS;
      }
    }
    return INITIAL_GOAL_SETTINGS;
  });

  useEffect(() => {
    // Cache local: garante que o sistema funciona normalmente mesmo sem banco
    // configurado, ou se a API estiver fora do ar. Isolado por usuário.
    localStorage.setItem(storageKey('locgrupo_recolhimentos'), JSON.stringify(items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, currentUser]);

  useEffect(() => {
    localStorage.setItem(storageKey('locgrupo_goal_settings'), JSON.stringify(goalSettings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalSettings, currentUser]);

  // Com DATABASE_URL configurada no servidor, os lançamentos passam a viver no
  // banco. Isso é o que permite o webhook do ASAAS atualizar o status sozinho
  // quando um pagamento é confirmado — este polling é o que traz essa mudança
  // pra tela sem precisar clicar em nada. Sem banco configurado, a chamada
  // falha (503) e o sistema segue 100% no localStorage, como antes.
  // Toda chamada a /api/items leva o token da sessão — o servidor usa isso
  // pra saber de quem são os dados e nunca devolve/aceita nada de outra conta.
  const itemsAuthHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  });

  useEffect(() => {
    if (!isAuthenticated || !sessionToken) return;
    let cancelled = false;

    const loadFromServer = async () => {
      try {
        const res = await fetch('/api/items', { headers: itemsAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data)) setItems(data);
        }
      } catch {
        // Banco não configurado ou API indisponível: mantém os dados locais.
      }
    };

    loadFromServer();
    const interval = setInterval(loadFromServer, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionToken]);

  const handleAddItem = (newItem: RecolhimentoItem) => {
    setItems((prev) => [newItem, ...prev]);
    fetch('/api/items', {
      method: 'POST',
      headers: itemsAuthHeaders(),
      body: JSON.stringify(newItem),
    }).catch(() => {});
  };

  const handleUpdateItem = (updated: RecolhimentoItem) => {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    fetch(`/api/items/${updated.id}`, {
      method: 'PUT',
      headers: itemsAuthHeaders(),
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  const handleDeleteItem = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      fetch(`/api/items/${id}`, { method: 'DELETE', headers: itemsAuthHeaders() }).catch(() => {});
    }
  };

  const handleImportBulk = (newItems: RecolhimentoItem[]) => {
    setItems((prev) => [...newItems, ...prev]);
    fetch('/api/items/bulk', {
      method: 'POST',
      headers: itemsAuthHeaders(),
      body: JSON.stringify(newItems),
    }).catch(() => {});
  };

  const pendingCount = items.filter((i) => i.status === 'Aguardando pagamento').length;

  if (isLoading) {
    return <PreloadView />;
  }

  if (!isAuthenticated) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 dark:bg-slate-950 dark:bg-none flex text-slate-900 dark:text-slate-100 font-sans transition-colors">
      {/* Confete da troca de tema — a revelação em si (ícones e cores de verdade,
          não uma camada por cima) é feita pela View Transition API no handler.
          O confete é só o brilho decorativo, num portal com z-index máximo. */}
      {themeAnim && createPortal(
        <div key={themeAnim.key} className="fixed inset-0 z-[2147483647] pointer-events-none overflow-hidden">
          {/* Confete decorativo saindo do mesmo ponto, acompanhando o crescimento */}
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.15;
            const distance = 110 + Math.random() * 260;
            const size = 6 + Math.random() * 16;
            const colors = themeAnim.toDark
              ? ['bg-slate-950', 'bg-slate-800', 'bg-indigo-950', 'bg-black']
              : ['bg-white', 'bg-blue-100', 'bg-indigo-100', 'bg-slate-200'];
            return (
              <motion.span
                key={i}
                className={`absolute rounded-full shadow-lg ${colors[i % colors.length]}`}
                style={{
                  left: themeAnim.x,
                  top: themeAnim.y,
                  width: size,
                  height: size,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                }}
                initial={{ opacity: 0.9, scale: 0, x: 0, y: 0 }}
                animate={{
                  opacity: 0,
                  scale: 1,
                  x: Math.cos(angle) * distance,
                  y: Math.sin(angle) * distance,
                }}
                transition={{ duration: (THEME_ANIM_DURATION / 1000) * 0.85, ease: 'easeOut', delay: i * 0.02 }}
              />
            );
          })}
        </div>,
        document.body
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        items={items}
        onAddNew={() => setActiveTab('tabela')}
        unreadNotificationsCount={pendingCount}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        onLogout={handleLogout}
        currentUser={currentUser}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Header Bar for Mobile Toggle & Quick Actions - Compact */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 px-4 sm:px-6 h-12 flex items-center justify-between shadow-sm transition-colors">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">
                {activeTab === 'dashboard' && 'Dashboard'}
                {activeTab === 'tabela' && 'Planilha'}
                {activeTab === 'metas' && 'Metas'}
                {activeTab === 'notificacoes' && 'Notificações'}
                {activeTab === 'asaas' && 'Integração ASAAS'}
                {activeTab === 'bases' && 'Gestão de Bases'}
                {activeTab === 'relatorios' && 'Relatórios'}
                {activeTab === 'usuarios' && 'Usuários'}
              </h2>
            </div>
          </div>

          <div className="flex-1 max-w-sm mx-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="global-search-input"
                type="text"
                placeholder="Buscar registros (Ctrl+F)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>

            <button
              id="tour-new-btn"
              onClick={() => setActiveTab('tabela')}
              className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black shadow-sm transition-all uppercase tracking-widest"
            >
              <Plus className="w-3 h-3" />
              <span>Novo</span>
            </button>

            <button
              id="tour-help-btn"
              onClick={() => setRunTourTrigger(prev => prev + 1)}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border border-slate-200 dark:border-slate-700"
              title="Ajuda / Tutorial"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>

            <button
              id="tour-theme-toggle"
              onClick={handleThemeToggle}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors border border-slate-200 dark:border-slate-700"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            </button>
          </div>
        </header>

        {/* Page Content - Compact padding */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <GuidedTour runTrigger={runTourTrigger} />
          <BrowserNotifications items={items} />
          <div className={['dashboard', 'asaas', 'tabela', 'bases', 'metas', 'notificacoes', 'relatorios', 'usuarios'].includes(activeTab) ? 'w-full' : 'max-w-7xl mx-auto'}>
            {activeTab === 'dashboard' && (
              <DashboardView
                items={items}
                goalSettings={goalSettings}
                onNavigateTable={() => setActiveTab('tabela')}
                searchTerm={searchTerm}
              />
            )}
            {activeTab === 'tabela' && (
              <TableManagerView
                ref={tableManagerRef}
                items={items}
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onImportBulk={handleImportBulk}
                unidades={unidades}
                baseCategories={baseCategories}
                onNavigateBases={() => setActiveTab('bases')}
                searchTerm={searchTerm}
              />
            )}
            {activeTab === 'bases' && (
              <BasesManagerView
                unidades={unidades}
                categorias={baseCategories}
                onAddUnidade={(u) => setUnidades(prev => [...prev, u])}
                onUpdateUnidade={(u) => setUnidades(prev => prev.map(item => item.id === u.id ? u : item))}
                onDeleteUnidade={(id) => confirm('Excluir unidade?') && setUnidades(prev => prev.filter(item => item.id !== id))}
                onAddCategoria={(c) => setBaseCategories(prev => [...prev, c])}
                onUpdateCategoria={(c) => setBaseCategories(prev => prev.map(item => item.id === c.id ? c : item))}
                onDeleteCategoria={(id) => confirm('Excluir categoria?') && setBaseCategories(prev => prev.filter(item => item.id !== id))}
              />
            )}
            {activeTab === 'relatorios' && (
              <ReportsView items={items} />
            )}
            {activeTab === 'metas' && (
              <MetasView
                goalSettings={goalSettings}
                onUpdateGoalSettings={setGoalSettings}
                items={items}
              />
            )}
            {activeTab === 'notificacoes' && (
              <NotificationsView items={items} goalSettings={goalSettings} searchTerm={searchTerm} />
            )}
            {activeTab === 'asaas' && (
              <AsaasIntegrationView items={items} unidades={unidades} onUpdateItem={handleUpdateItem} />
            )}
            {activeTab === 'usuarios' && currentUser?.role === 'admin' && (
              <AdminUsersView sessionToken={sessionToken} currentUserId={currentUser.id} />
            )}
          </div>
        </main>
      </div>
      <ChatAssistant items={items} goalSettings={goalSettings} />
    </div>
  );
}
