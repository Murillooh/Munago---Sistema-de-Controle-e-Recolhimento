import { useEffect, useState } from 'react';

declare const __APP_BUILD_ID__: string;

const CHECK_INTERVAL_MS = 2 * 60 * 1000;

// Detecta deploy novo comparando o id embutido no bundle com o
// /version.json atual do servidor (ver buildVersionPlugin no vite.config.ts).
// Evita aba esquecida rodando versão antiga indefinidamente.
//
// Aba em segundo plano recarrega sozinha (ninguém está olhando). Aba aberta
// e em uso NÃO recarrega no meio do trabalho — devolve `updateAvailable`
// pra tela avisar e o usuário escolher a hora; se ele deixar pra depois, a
// recarga acontece na próxima vez que a aba for pra segundo plano.
export function useNewVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Build local (sem SHA do commit da Vercel) não tem deploy pra comparar.
    if (__APP_BUILD_ID__.startsWith('local-')) return;
    let newVersionFound = false;
    let stopped = false;

    const check = async () => {
      if (stopped || newVersionFound) return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (stopped || !buildId || buildId === __APP_BUILD_ID__) return;
        newVersionFound = true;
        if (document.hidden) window.location.reload();
        else setUpdateAvailable(true);
      } catch {
        // offline/rede instável — tenta no próximo ciclo
      }
    };

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.hidden) {
        if (newVersionFound) window.location.reload();
      } else {
        check();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return {
    updateAvailable,
    reloadNow: () => window.location.reload(),
    dismiss: () => setUpdateAvailable(false),
  };
}
