import React, { useEffect, useState } from 'react';
import { RecolhimentoItem } from '../types';
import { Bell, BellOff, Loader2 } from 'lucide-react';

interface BrowserNotificationsProps {
  items: RecolhimentoItem[];
  sessionToken: string | null;
}

// VAPID vem em base64url; a Push API do navegador quer Uint8Array.
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
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
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !sessionToken) return false;

    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const keyRes = await fetch('/api/push/public-key');
      const { publicKey } = await keyRes.json();
      if (!publicKey) return false; // servidor sem VAPID configurada de verdade

      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ subscription }),
      });
      if (!res.ok) return false;

      // Confirmação imediata — prova que funciona sem esperar um prazo vencer de verdade.
      fetch('/api/push/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }).catch(() => {});

      return true;
    } catch (err) {
      console.error('Erro ao ativar push:', err);
      return false;
    }
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
  if (permission === 'granted' && !pushSubscribed && !busy) {
    return (
      <div className="fixed bottom-6 right-6 z-[60]">
        <div className="bg-slate-900/80 backdrop-blur-md text-amber-300 px-4 py-2 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest flex items-center space-x-2">
          <Bell className="w-3.5 h-3.5" />
          <span>Alertas ativos só com o sistema aberto</span>
        </div>
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
