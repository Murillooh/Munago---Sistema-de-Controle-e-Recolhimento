import { useEffect } from 'react';

declare const __APP_BUILD_ID__: string;

const CHECK_INTERVAL_MS = 2 * 60 * 1000;

// Usuário digitando num campo não perde o que escreveu — espera ele sair do
// campo (ou a aba ficar em segundo plano) pra recarregar.
function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

// Recarrega a página quando um deploy novo sai — compara o id embutido no
// bundle com o /version.json atual do servidor (ver buildVersionPlugin no
// vite.config.ts). Evita aba esquecida rodando versão antiga indefinidamente.
export function useAutoReloadOnNewVersion() {
  useEffect(() => {
    // Build local (sem SHA do commit da Vercel) não tem deploy pra comparar.
    if (__APP_BUILD_ID__.startsWith('local-')) return;
    let newVersionFound = false;
    let stopped = false;

    const tryReload = () => {
      if (newVersionFound && (document.hidden || !isEditing())) window.location.reload();
    };

    const check = async () => {
      if (stopped) return;
      if (newVersionFound) return tryReload();
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (buildId && buildId !== __APP_BUILD_ID__) {
          newVersionFound = true;
          tryReload();
        }
      } catch {
        // offline/rede instável — tenta no próximo ciclo
      }
    };

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisibility = () => { if (!document.hidden) check(); else tryReload(); };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('focusout', tryReload);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusout', tryReload);
    };
  }, []);
}
