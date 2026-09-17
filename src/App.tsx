import React, { useState, useEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ActiveTab, RecolhimentoItem, GoalSettings, AuthUser, EstoqueItem } from './types';
import { INITIAL_RECOLHIMENTOS, INITIAL_GOAL_SETTINGS } from './data/initialData';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { TableManagerView } from './components/TableManagerView';
import { EstoqueView } from './components/EstoqueView';
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
import { ConfirmDialog } from './components/ConfirmDialog';
import { motion } from 'motion/react';
import { Menu, Bell, Download, FileText, Plus, Sun, Moon, HelpCircle, Database, FileBarChart, Search, Undo2 } from 'lucide-react';
import { exportToExcel, exportToPDF } from './utils/exportImport';
import { INITIAL_UNIDADES, INITIAL_BASE_CATEGORIES } from './data/initialBases';
import { canAccessTab } from './utils/permissions';
import { ASAAS_AUTO_IMPORT_INTERVAL_MS } from './utils/unidades';

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

  // Se o que tá salvo é exatamente o conjunto antigo de categorias-padrão
  // (Taxa/Royalties/Fundo de Propaganda/Outros), troca sozinho pelo novo
  // padrão — sem isso, cada conta já usada teria que editar isso na mão em
  // Bases > Categorias, já que essa lista vive no localStorage, não no banco.
  // Quem já personalizou (conjunto diferente) não é mexido.
  const LEGACY_DEFAULT_CATEGORY_NAMES = ['Fundo de Propaganda', 'Outros', 'Royalties', 'Taxa'].sort();
  const migrateLegacyCategories = (parsed: any[]): any[] => {
    const names = (parsed || []).map((c: any) => c?.nome).sort();
    const isLegacyDefault =
      names.length === LEGACY_DEFAULT_CATEGORY_NAMES.length &&
      names.every((n: string, i: number) => n === LEGACY_DEFAULT_CATEGORY_NAMES[i]);
    return isLegacyDefault ? INITIAL_BASE_CATEGORIES : parsed;
  };

  const [baseCategories, setBaseCategories] = useState<any[]>(() => {
    const saved = localStorage.getItem(storageKey('locgrupo_base_categories'));
    if (!saved) return INITIAL_BASE_CATEGORIES;
    try {
      return migrateLegacyCategories(JSON.parse(saved));
    } catch {
      return INITIAL_BASE_CATEGORIES;
    }
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
    setBaseCategories(migrateLegacyCategories(loadUserCache('locgrupo_base_categories', user.id, INITIAL_BASE_CATEGORIES)));
    setEstoqueItems(loadUserCache('locgrupo_estoque', user.id, []));
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
    setEstoqueItems([]);
  };

  const VALID_TABS: ActiveTab[] = ['dashboard', 'tabela', 'metas', 'notificacoes', 'asaas', 'bases', 'relatorios', 'usuarios', 'estoque'];
  // Persiste a aba atual — sem isso, um F5 sempre voltava pro Dashboard,
  // mesmo estando em outra tela no meio de um trabalho.
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = localStorage.getItem(storageKey('locgrupo_active_tab'));
    return VALID_TABS.includes(saved as ActiveTab) ? (saved as ActiveTab) : 'dashboard';
  });
  useEffect(() => {
    localStorage.setItem(storageKey('locgrupo_active_tab'), activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser]);
  // Clique num card do Dashboard ("Em Aberto", "Confirmado"...) pode levar
  // pra Planilha já com esse status filtrado, em vez de cair na tabela toda.
  const [pendingStatusFilter, setPendingStatusFilter] = useState<string | null>(null);
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

  // Controle de Estoque — mesmo padrão de cache local + sync com servidor
  // dos recolhimentos, só que sem seed inicial (começa vazio até importar
  // uma planilha de inventário de verdade).
  const [estoqueItems, setEstoqueItems] = useState<EstoqueItem[]>(() => {
    const saved = localStorage.getItem(storageKey('locgrupo_estoque'));
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
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

  useEffect(() => {
    localStorage.setItem(storageKey('locgrupo_estoque'), JSON.stringify(estoqueItems));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estoqueItems, currentUser]);

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

  // Unidades (franquias + chave ASAAS) agora são compartilhadas entre todos
  // os usuários, não mais por conta — antes cada login tinha sua própria
  // cópia no localStorage, então uma chave ASAAS configurada por um usuário
  // nunca aparecia pros outros. Poll igual items/estoque; na primeira vez
  // que o servidor devolver a lista vazia mas já existir algo salvo
  // localmente (era assim que funcionava antes), o admin logado migra tudo
  // pro banco de uma vez, sem perder o que já estava configurado.
  const unidadesMigratedRef = React.useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !sessionToken) return;
    let cancelled = false;

    const loadUnidadesFromServer = async () => {
      try {
        const res = await fetch('/api/unidades', { headers: itemsAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;

        if (data.length === 0 && !unidadesMigratedRef.current && currentUser?.role === 'admin' && unidades.length > 0) {
          unidadesMigratedRef.current = true;
          try {
            const migrateRes = await fetch('/api/unidades/bulk', {
              method: 'POST',
              headers: itemsAuthHeaders(),
              body: JSON.stringify(unidades),
            });
            if (migrateRes.ok) {
              const migrateData = await migrateRes.json();
              if (!cancelled && Array.isArray(migrateData.unidades) && migrateData.unidades.length > 0) {
                setUnidades(migrateData.unidades);
              }
              return;
            }
          } catch {
            unidadesMigratedRef.current = false; // sem sorte agora — tenta de novo no próximo poll
          }
        }

        if (data.length > 0) setUnidades(data);
      } catch {
        // API indisponível: mantém as unidades locais como estão.
      }
    };

    loadUnidadesFromServer();
    const unidadesInterval = setInterval(loadUnidadesFromServer, 15000);
    return () => {
      cancelled = true;
      clearInterval(unidadesInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionToken]);

  // Escrita restrita a admin no servidor (requireAdmin) — a UI
  // (BasesManagerView) já esconde os controles de criar/editar/excluir de
  // quem não é admin, isso aqui é só a chamada de fato.
  const handleAddUnidade = async (u: any) => {
    setUnidades((prev) => [...prev, u]);
    try {
      const res = await fetch('/api/unidades', { method: 'POST', headers: itemsAuthHeaders(), body: JSON.stringify(u) });
      if (res.ok) {
        const saved = await res.json();
        setUnidades((prev) => prev.map((item) => (item.id === u.id ? saved : item)));
      }
    } catch {
      // fica só local até o próximo poll conseguir de novo
    }
  };

  const handleUpdateUnidade = async (u: any) => {
    setUnidades((prev) => prev.map((item) => (item.id === u.id ? u : item)));
    fetch(`/api/unidades/${u.id}`, { method: 'PUT', headers: itemsAuthHeaders(), body: JSON.stringify(u) }).catch(() => {});
  };

  const handleDeleteUnidade = (id: string) => {
    askConfirm('Excluir esta unidade? Essa ação não pode ser desfeita.', () => {
      setUnidades((prev) => prev.filter((item) => item.id !== id));
      fetch(`/api/unidades/${id}`, { method: 'DELETE', headers: itemsAuthHeaders() }).catch(() => {});
    });
  };

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

  useEffect(() => {
    if (!isAuthenticated || !sessionToken) return;
    let cancelled = false;

    const loadEstoqueFromServer = async () => {
      try {
        const res = await fetch('/api/estoque', { headers: itemsAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data)) setEstoqueItems(data);
        }
      } catch {
        // Banco não configurado ou API indisponível: mantém os dados locais.
      }
    };

    loadEstoqueFromServer();
    const interval = setInterval(loadEstoqueFromServer, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionToken]);

  // Reconsulta o próprio perfil periodicamente — é o que faz uma mudança de
  // permissão feita pelo admin (allowedTabs/role) valer pra quem já está
  // logado, sem precisar deslogar e logar de novo.
  useEffect(() => {
    if (!isAuthenticated || !sessionToken) return;
    let cancelled = false;

    const refreshProfile = async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: itemsAuthHeaders() });
        if (res.ok) {
          const user = await res.json();
          if (!cancelled) {
            setCurrentUser(user);
            localStorage.setItem('locgrupo_session', JSON.stringify({ user, token: sessionToken }));
          }
        } else if (res.status === 401 && !cancelled) {
          handleLogout();
        }
      } catch {
        // API indisponível: mantém a sessão local como está.
      }
    };

    const interval = setInterval(refreshProfile, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionToken]);

  // Se a permissão mudou e a aba atual não é mais permitida, cai pro
  // Dashboard (sempre liberado) em vez de deixar uma tela que o usuário não
  // devia mais ver.
  useEffect(() => {
    if (!currentUser) return;
    if (!canAccessTab(currentUser, activeTab)) {
      setActiveTab('dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, activeTab]);

  const handleAddEstoqueItem = (newItem: EstoqueItem) => {
    setEstoqueItems((prev) => [newItem, ...prev]);
    fetch('/api/estoque', {
      method: 'POST',
      headers: itemsAuthHeaders(),
      body: JSON.stringify(newItem),
    }).catch(() => {});
  };

  const handleUpdateEstoqueItem = (updated: EstoqueItem) => {
    setEstoqueItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    fetch(`/api/estoque/${updated.id}`, {
      method: 'PUT',
      headers: itemsAuthHeaders(),
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  const handleDeleteEstoqueItem = (id: string) => {
    askConfirm('Tem certeza que deseja excluir este item de estoque?', () => {
      const deleted = estoqueItems.find((item) => item.id === id);
      setEstoqueItems((prev) => prev.filter((item) => item.id !== id));
      fetch(`/api/estoque/${id}`, { method: 'DELETE', headers: itemsAuthHeaders() }).catch(() => {});
      if (deleted) showEstoqueUndo([deleted]);
    });
  };

  const handleDeleteMultipleEstoque = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const deleted = estoqueItems.filter((item) => idSet.has(item.id));
    setEstoqueItems((prev) => prev.filter((item) => !idSet.has(item.id)));
    fetch('/api/estoque/delete-bulk', {
      method: 'POST',
      headers: itemsAuthHeaders(),
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    if (deleted.length > 0) showEstoqueUndo(deleted);
  };

  const handleImportEstoqueBulk = async (newItems: EstoqueItem[]): Promise<boolean> => {
    const ids = new Set(newItems.map((i) => i.id));
    setEstoqueItems((prev) => [...newItems, ...prev]);
    try {
      const res = await fetch('/api/estoque/bulk', {
        method: 'POST',
        headers: itemsAuthHeaders(),
        body: JSON.stringify(newItems),
      });
      if (!res.ok) throw new Error('Falha ao importar em lote.');
      const data = await res.json();
      if (Array.isArray(data.items)) {
        // Troca os itens otimistas pelos que o servidor confirmou salvos de
        // verdade — mesmo raciocínio do import de recolhimentos: sem isso,
        // uma falha silenciosa no meio do lote deixa item "fantasma" na tela
        // que o polling de 15s depois some sozinho, sem aviso nenhum.
        setEstoqueItems((prev) => [...data.items, ...prev.filter((i) => !ids.has(i.id))]);
      }
      return true;
    } catch {
      return false;
    }
  };

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

  // Sempre acessível de dentro do polling abaixo sem precisar recriar o
  // intervalo a cada mudança de `items` (que muda o tempo todo — cada
  // importação alimenta o próprio `items`).
  const itemsRef = React.useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const MONTHS_PT_ASAAS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // Cobranças lançadas direto no painel do ASAAS (sem passar pelo botão
  // "Gerar no ASAAS" daqui) não tinham como entrar no Munago — o sistema só
  // conferia status de cobranças que ELE MESMO criou. Isso varre, pra cada
  // unidade com chave configurada, a lista de cobranças da conta ASAAS e
  // cria um lançamento novo pra qualquer uma que ainda não exista aqui
  // (checado pelo asaasId). Sem revisão manual — pedido assim de propósito.
  // Extraída da closure do efeito de import automático pra também poder ser
  // chamada na hora por um botão manual (AsaasIntegrationView) — pedido do
  // usuário pra não depender só do ciclo silencioso de 90s pra trazer
  // boleto antigo do ASAAS. `cancelledRef` é opcional: o efeito passa a
  // dele (unmount cancela o ciclo em andamento); o botão manual não passa
  // nada, então nunca cancela sozinho.
  const runAsaasImport = async (cancelledRef?: { current: boolean }): Promise<{ imported: number }> => {
    const unidadesComChave = unidades.filter((u: any) => u.hasAsaasKey);
    if (unidadesComChave.length === 0) return { imported: 0 };

    // Acumula tudo e manda num POST em lote só no final, em vez de um
    // fetch individual (handleAddItem) por cobrança nova — um backlog
    // grande pra importar de uma vez (primeira vez rodando, ou muita
    // cobrança lançada direto no ASAAS) virava uma rajada de dezenas de
    // requisições simultâneas, cada uma abrindo sua própria conexão de
    // banco; foi isso que já estourou o limite de conexões do RDS e
    // derrubou a API inteira uma vez ("too many clients already").
    const newItems: RecolhimentoItem[] = [];
    const existingAsaasIds = new Set(itemsRef.current.filter((i) => i.asaasId).map((i) => i.asaasId));

    for (const unidade of unidadesComChave) {
      if (cancelledRef?.current) return { imported: 0 };
      try {
        const res = await fetch('/api/asaas/list-payments', {
          method: 'POST',
          headers: itemsAuthHeaders(),
          body: JSON.stringify({ unidadeId: unidade.id, sandbox: false }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const payments = Array.isArray(data.payments) ? data.payments : [];

        for (const p of payments) {
          if (existingAsaasIds.has(p.id)) continue;

          const [y, m, d] = String(p.dueDate || '').split('-');
          const vencimento = d && m && y ? `${d}/${m}/${y}` : '';
          const dueDate = p.dueDate ? new Date(`${p.dueDate}T00:00:00`) : null;
          const competencia = dueDate && !isNaN(dueDate.getTime())
            ? `${MONTHS_PT_ASAAS[dueDate.getMonth()]}/${String(dueDate.getFullYear()).slice(-2)}`
            : '';

          newItems.push({
            id: `asaas-${p.id}`,
            franquia: unidade.nome,
            cnpj: unidade.cnpj || '',
            cCusto: unidade.cCustoPadrao || unidade.nome,
            dataCriacao: new Date().toLocaleDateString('pt-BR'),
            vencimento,
            vencimentoOriginal: vencimento,
            dataPagamento: p.paymentDate ? p.paymentDate.split('-').reverse().join('/') : '',
            valor: Number(p.value) || 0,
            status: p.status || 'Aguardando pagamento',
            competenciaRecolhimento: competencia,
            competenciaPagamento: '',
            descricao: p.description || `Cobrança importada do ASAAS (${unidade.nome})`,
            asaasId: p.id,
            asaasInvoiceUrl: p.invoiceUrl || undefined,
            asaasImportedAt: new Date().toISOString(),
          });
          existingAsaasIds.add(p.id);
        }
      } catch {
        // Chave com problema momentâneo ou API fora do ar — tenta de novo no próximo ciclo.
      }
    }

    if (cancelledRef?.current || newItems.length === 0) return { imported: 0 };
    const result = await handleImportBulk(newItems);
    if (result.ok === false) throw new Error(result.error);
    return { imported: newItems.length };
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const cancelledRef = { current: false };

    runAsaasImport(cancelledRef);
    const interval = setInterval(() => runAsaasImport(cancelledRef), ASAAS_AUTO_IMPORT_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, unidades]);

  // Modal de confirmação genérico (substitui confirm() nativo) — quem quiser
  // confirmar algo só passa a mensagem e o que fazer se o usuário confirmar.
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const askConfirm = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm });

  // Excluir some da tela e do banco na hora (não trava em "pendente" —
  // isso conflitaria com o polling de 15s acima, que traria o item de
  // volta se ele ainda existisse no banco). "Desfazer" é literalmente
  // recriar o registro, não cancelar a exclusão em si — mais simples e
  // não briga com o polling. Só um lote de cada vez: desfazer substitui
  // qualquer aviso anterior ainda na tela (o de antes continua excluído).
  const UNDO_WINDOW_MS = 8000;
  const [undoState, setUndoState] = useState<{ items: RecolhimentoItem[]; timeoutId: ReturnType<typeof setTimeout> } | null>(null);

  const showUndo = (deletedItems: RecolhimentoItem[]) => {
    setUndoState((prev) => {
      if (prev) clearTimeout(prev.timeoutId);
      const timeoutId = setTimeout(() => setUndoState(null), UNDO_WINDOW_MS);
      return { items: deletedItems, timeoutId };
    });
  };

  const handleUndoDelete = () => {
    setUndoState((prev) => {
      if (!prev) return null;
      clearTimeout(prev.timeoutId);
      setItems((current) => [...prev.items, ...current]);
      prev.items.forEach((item) => {
        fetch('/api/items', { method: 'POST', headers: itemsAuthHeaders(), body: JSON.stringify(item) }).catch(() => {});
      });
      return null;
    });
  };

  const handleDeleteItem = (id: string) => {
    askConfirm('Tem certeza que deseja excluir este registro?', () => {
      const deleted = items.find((item) => item.id === id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      fetch(`/api/items/${id}`, { method: 'DELETE', headers: itemsAuthHeaders() }).catch(() => {});
      if (deleted) showUndo([deleted]);
    });
  };

  // Exclusão em massa vem de quem já pediu confirmação uma vez pro lote
  // inteiro (TableManagerView) — nada de pedir confirmação de novo aqui,
  // e nada de chamar handleDeleteItem em loop (cada chamada dispararia sua
  // própria confirmação e só a última sobrevivia, apagando 1 item só).
  const handleDeleteMultiple = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const deleted = items.filter((item) => idSet.has(item.id));
    setItems((prev) => prev.filter((item) => !idSet.has(item.id)));
    fetch('/api/items/delete-bulk', {
      method: 'POST',
      headers: itemsAuthHeaders(),
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    if (deleted.length > 0) showUndo(deleted);
  };

  // Mesmo mecanismo de desfazer acima, só que pros itens de Controle de
  // Estoque — são dois "toasts" independentes porque são dois tipos de
  // registro diferentes (não faz sentido misturar no mesmo aviso).
  const [estoqueUndoState, setEstoqueUndoState] = useState<{ items: EstoqueItem[]; timeoutId: ReturnType<typeof setTimeout> } | null>(null);

  const showEstoqueUndo = (deletedItems: EstoqueItem[]) => {
    setEstoqueUndoState((prev) => {
      if (prev) clearTimeout(prev.timeoutId);
      const timeoutId = setTimeout(() => setEstoqueUndoState(null), UNDO_WINDOW_MS);
      return { items: deletedItems, timeoutId };
    });
  };

  const handleUndoDeleteEstoque = () => {
    setEstoqueUndoState((prev) => {
      if (!prev) return null;
      clearTimeout(prev.timeoutId);
      setEstoqueItems((current) => [...prev.items, ...current]);
      prev.items.forEach((item) => {
        fetch('/api/estoque', { method: 'POST', headers: itemsAuthHeaders(), body: JSON.stringify(item) }).catch(() => {});
      });
      return null;
    });
  };

  // Espera a confirmação do servidor antes de considerar sucesso — um import
  // grande fica frágil como fire-and-forget: se a gravação falhar no meio
  // (rede caiu, conexão do banco caiu), o polling de 15s reflete o banco de
  // verdade por cima e os itens "somem sozinhos" pouco depois, sem aviso
  // nenhum. Devolve true/false pra quem chamou poder avisar o usuário.
  const handleImportBulk = async (newItems: RecolhimentoItem[]): Promise<{ ok: true } | { ok: false; error: string }> => {
    const ids = new Set(newItems.map((i) => i.id));
    setItems((prev) => [...newItems, ...prev]);
    try {
      const res = await fetch('/api/items/bulk', {
        method: 'POST',
        headers: itemsAuthHeaders(),
        body: JSON.stringify(newItems),
      });
      // 503 = banco não configurado ainda: modo local de sempre, não é falha
      // de verdade — os itens ficam só no navegador, sem rollback.
      if (res.status === 503) return { ok: true };
      if (!res.ok) {
        setItems((prev) => prev.filter((item) => !ids.has(item.id)));
        // O motivo real do servidor (ex: erro de conexão com o banco, linha
        // com dado que a coluna recusa) ia pro limbo antes — só um "tente de
        // novo" genérico que não ajuda a saber o que corrigir na planilha.
        const data = await res.json().catch(() => ({}) as any);
        return { ok: false, error: data.error || data.details || `Servidor recusou o import (HTTP ${res.status}).` };
      }
      return { ok: true };
    } catch (err: any) {
      setItems((prev) => prev.filter((item) => !ids.has(item.id)));
      return { ok: false, error: err?.message || 'Falha de conexão com o servidor.' };
    }
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
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/40 sticky top-0 z-20 px-4 sm:px-6 h-12 flex items-center justify-between shadow-sm transition-colors">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 hover:shadow-sm"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2 glow-pulse hidden sm:inline-block"></span>
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
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                id="global-search-input"
                type="text"
                placeholder="Buscar registros (Ctrl+F)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-100/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50 transition-all hover:bg-slate-100/80 dark:hover:bg-slate-800/80"
              />
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <div className="h-6 w-px bg-slate-200/80 dark:bg-slate-800/80 mx-1 hidden sm:block"></div>

            <button
              id="tour-new-btn"
              onClick={() => setActiveTab('tabela')}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-[10px] font-black shadow-md shadow-blue-500/20 transition-all uppercase tracking-widest hover:scale-105 active:scale-95"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">Novo</span>
            </button>

            <button
              id="tour-help-btn"
              onClick={() => setRunTourTrigger(prev => prev + 1)}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-800/50 text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-all border border-slate-200/60 dark:border-slate-700/40 hover:border-blue-200 hover:shadow-sm"
              title="Ajuda / Tutorial"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>

            <button
              id="tour-theme-toggle"
              onClick={handleThemeToggle}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all border border-slate-200/60 dark:border-slate-700/40 hover:shadow-sm"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
            </button>
          </div>
        </header>

        {/* Page Content - Compact padding */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <GuidedTour runTrigger={runTourTrigger} />
          <BrowserNotifications items={items} sessionToken={sessionToken} />
          <div className={['dashboard', 'asaas', 'tabela', 'bases', 'metas', 'notificacoes', 'relatorios', 'usuarios', 'estoque'].includes(activeTab) ? 'w-full' : 'max-w-7xl mx-auto'}>
            {activeTab === 'dashboard' && (
              <DashboardView
                items={items}
                estoqueItems={estoqueItems}
                goalSettings={goalSettings}
                onNavigateTable={(status) => {
                  setPendingStatusFilter(status ?? null);
                  setActiveTab('tabela');
                }}
                onNavigateMetas={() => setActiveTab('metas')}
                searchTerm={searchTerm}
              />
            )}
            {activeTab === 'tabela' && canAccessTab(currentUser, 'tabela') && (
              <TableManagerView
                ref={tableManagerRef}
                items={items}
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onDeleteMultiple={handleDeleteMultiple}
                onImportBulk={handleImportBulk}
                unidades={unidades}
                onAddUnidade={handleAddUnidade}
                baseCategories={baseCategories}
                onNavigateBases={() => setActiveTab('bases')}
                searchTerm={searchTerm}
                sessionToken={sessionToken}
                initialStatusFilter={pendingStatusFilter}
              />
            )}
            {activeTab === 'bases' && canAccessTab(currentUser, 'bases') && (
              <BasesManagerView
                unidades={unidades}
                categorias={baseCategories}
                canEditUnidades={currentUser?.role === 'admin'}
                onAddUnidade={handleAddUnidade}
                onUpdateUnidade={handleUpdateUnidade}
                onDeleteUnidade={handleDeleteUnidade}
                onAddCategoria={(c) => setBaseCategories(prev => [...prev, c])}
                onUpdateCategoria={(c) => setBaseCategories(prev => prev.map(item => item.id === c.id ? c : item))}
                onDeleteCategoria={(id) => askConfirm('Excluir esta categoria? Essa ação não pode ser desfeita.', () => setBaseCategories(prev => prev.filter(item => item.id !== id)))}
              />
            )}
            {activeTab === 'relatorios' && canAccessTab(currentUser, 'relatorios') && (
              <ReportsView items={items} sessionToken={sessionToken} />
            )}
            {activeTab === 'metas' && canAccessTab(currentUser, 'metas') && (
              <MetasView
                goalSettings={goalSettings}
                onUpdateGoalSettings={setGoalSettings}
                items={items}
              />
            )}
            {activeTab === 'notificacoes' && canAccessTab(currentUser, 'notificacoes') && (
              <NotificationsView items={items} goalSettings={goalSettings} searchTerm={searchTerm} sessionToken={sessionToken} />
            )}
            {activeTab === 'asaas' && canAccessTab(currentUser, 'asaas') && (
              <AsaasIntegrationView items={items} unidades={unidades} sessionToken={sessionToken} onUpdateItem={handleUpdateItem} onAddItem={handleAddItem} onImportAsaasHistory={runAsaasImport} />
            )}
            {activeTab === 'usuarios' && currentUser?.role === 'admin' && (
              <AdminUsersView sessionToken={sessionToken} currentUserId={currentUser.id} />
            )}
            {activeTab === 'estoque' && canAccessTab(currentUser, 'estoque') && (
              <EstoqueView
                items={estoqueItems}
                onAddItem={handleAddEstoqueItem}
                onUpdateItem={handleUpdateEstoqueItem}
                onDeleteItem={handleDeleteEstoqueItem}
                onDeleteMultiple={handleDeleteMultipleEstoque}
                onImportBulk={handleImportEstoqueBulk}
                searchTerm={searchTerm}
                sessionToken={sessionToken}
              />
            )}
          </div>
        </main>
      </div>
      <ChatAssistant items={items} estoqueItems={estoqueItems} goalSettings={goalSettings} sessionToken={sessionToken} />
      {undoState && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-slate-900 dark:bg-slate-800 text-white pl-4 pr-2 py-2 rounded-2xl shadow-2xl border border-white/10">
          <span className="text-xs font-bold">
            {undoState.items.length > 1
              ? `${undoState.items.length} registros excluídos.`
              : 'Registro excluído.'}
          </span>
          <button
            onClick={handleUndoDelete}
            className="flex items-center space-x-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Desfazer</span>
          </button>
        </div>
      )}
      {estoqueUndoState && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-slate-900 dark:bg-slate-800 text-white pl-4 pr-2 py-2 rounded-2xl shadow-2xl border border-white/10">
          <span className="text-xs font-bold">
            {estoqueUndoState.items.length > 1
              ? `${estoqueUndoState.items.length} itens de estoque excluídos.`
              : 'Item de estoque excluído.'}
          </span>
          <button
            onClick={handleUndoDeleteEstoque}
            className="flex items-center space-x-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Desfazer</span>
          </button>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmState}
        message={confirmState?.message ?? ''}
        onConfirm={() => {
          confirmState?.onConfirm();
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
