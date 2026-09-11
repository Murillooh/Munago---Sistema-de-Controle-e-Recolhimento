import React, { useEffect, useState } from 'react';
import { RecolhimentoItem } from '../types';
import { Bell, BellOff } from 'lucide-react';

interface BrowserNotificationsProps {
  items: RecolhimentoItem[];
}

export const BrowserNotifications: React.FC<BrowserNotificationsProps> = ({ items }) => {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    const res = await Notification.requestPermission();
    setPermission(res);
  };

  useEffect(() => {
    if (permission !== 'granted') return;

    // Check for upcoming deadlines (next 48 hours)
    const now = new Date();
    const pendingItems = items.filter(item => item.status === 'Aguardando pagamento');

    pendingItems.forEach(item => {
      // Parse DD/MM/YYYY
      const parts = item.vencimento.split('/');
      if (parts.length !== 3) return;
      
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      
      const dueDate = new Date(year, month - 1, day);
      
      const diffInTime = dueDate.getTime() - now.getTime();
      const diffInDays = diffInTime / (1000 * 3600 * 24);

      // If due within 2 days (or today/yesterday for urgency)
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
  }, [items, permission]);

  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {permission === 'default' && (
        <button
          onClick={requestPermission}
          className="flex items-center space-x-3 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl shadow-2xl shadow-blue-600/40 transition-all hover:scale-105 active:scale-95 animate-pulse"
        >
          <Bell className="w-5 h-5" />
          <span className="text-xs font-black uppercase tracking-widest">Ativar Alertas de Prazo</span>
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
