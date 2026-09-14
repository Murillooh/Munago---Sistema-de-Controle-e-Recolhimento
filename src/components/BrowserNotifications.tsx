import React, { useEffect, useState } from 'react';
import { RecolhimentoItem } from '../types';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { ensurePushSubscription } from '../utils/push';

interface BrowserNotificationsProps {
  items: RecolhimentoItem[];
  sessionToken: string | null;
}

export const BrowserNotifications: React.FC<BrowserNotificationsProps> = ({ items, sessionToken }) => {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Se já tem inscrição de push ativa neste navegador (de uma sessão anterior),
  // não mostra o botão de novo — o alerta já funciona mesmo com tudo fechado.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushSubscribed(!!sub))
      .catch(() => {});
  }, []);

  const enablePush = async (): Promise<boolean> => {
    const result = await ensurePushSubscription(sessionToken);
    if (!result.ok) return false;

    // Confirmação imediata — prova que funciona sem esperar um prazo vencer de verdade.
    fetch('/api/push/test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    }).catch(() => {});

    return true;
  };

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    setBusy(true);
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === 'granted') {
        const ok = await enablePush();
        setPushSubscribed(ok);
      }
    } finally {
      setBusy(false);
    }
  };

  // Permissão do navegador já concedida, só tentar de novo (sem pedir permissão
  // de novo) — usado tanto pelo clique manual quanto pela promoção automática
  // abaixo, quando a sessão passa a ter um token de verdade (login real).
  const retryEnablePush = async () => {
    setBusy(true);
    try {
      const ok = await enablePush();
      setPushSubscribed(ok);
    } finally {
      setBusy(false);
    }
  };

  // Se o usuário ativou o alerta enquanto a sessão ainda era o modo local
  // (sem token, ex: banco fora do ar na hora), promove pro push de verdade
  // sozinho assim que um login de verdade traz um token — sem precisar
  // clicar em nada de novo.
  useEffect(() => {
    if (permission === 'granted' && !pushSubscribed && sessionToken) {
      retryEnablePush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  // Fallback pra quando o push de verdade não está disponível (sem banco
  // configurado, ou navegador sem suporte): checa prazos com a aba aberta,
  // igual antes. Some sozinho assim que o push de verdade estiver ativo.
  useEffect(() => {
    if (permission !== 'granted' || pushSubscribed) return;

    const now = new Date();
    const pendingItems = items.filter((item) => item.status === 'Aguardando pagamento');

    pendingItems.forEach((item) => {
      const parts = item.vencimento.split('/');
      if (parts.length !== 3) return;

      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      const dueDate = new Date(year, month - 1, day);

      const diffInDays = (dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24);

      if (diffInDays >= -1 && diffInDays <= 2) {
        const notifiedKey = `munago_notified_${item.id}`;
        if (!sessionStorage.getItem(notifiedKey)) {
          try {
            new Notification('Munago - Alerta de Prazo', {
              body: `A franquia ${item.franquia} tem um recolhimento de R$ ${item.valor.toFixed(2)} vencendo em ${item.vencimento}.`,
              tag: `deadline-${item.id}`,
            });
            sessionStorage.setItem(notifiedKey, 'true');
          } catch (e) {
            console.error('Erro ao enviar notificação:', e);
          }
        }
      }
    });
  }, [items, permission, pushSubscribed]);

  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (permission === 'granted' && pushSubscribed) return null; // já ativo, não precisa mostrar nada

  // Permissão já concedida mas o push de verdade não ficou disponível (sem
  // DATABASE_URL/VAPID configurados, por exemplo): não tem mais nada pra
  // pedir ao usuário, só avisar que o alerta só funciona com a aba aberta.
  if (permission === 'granted' && !pushSubscribed) {
    return (
      <div className="fixed bottom-6 right-6 z-[60]">
        <button
          onClick={retryEnablePush}
          disabled={busy}
          className="flex items-center space-x-2 bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md text-amber-300 px-4 py-2 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-70"
          title="Clique pra tentar ativar notificação de verdade (chega com o sistema fechado)"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
          <span>{busy ? 'Ativando...' : 'Alertas ativos só com o sistema aberto — tentar de novo'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {permission !== 'denied' && (
        <button
          onClick={requestPermission}
          disabled={busy}
          className="flex items-center space-x-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white px-5 py-3 rounded-2xl shadow-2xl shadow-blue-600/40 transition-all hover:scale-105 active:scale-95 animate-pulse"
          title="Notificação de verdade do Windows, chega mesmo com o sistema fechado"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bell className="w-5 h-5" />}
          <span className="text-xs font-black uppercase tracking-widest">
            {busy ? 'Ativando...' : 'Ativar Alertas de Prazo'}
          </span>
        </button>
      )}
      {permission === 'denied' && (
        <div className="bg-slate-900/80 backdrop-blur-md text-slate-400 px-4 py-2 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest flex items-center space-x-2">
          <BellOff className="w-3.5 h-3.5" />
          <span>Notificações do Navegador Bloqueadas</span>
        </div>
      )}
    </div>
  );
};
