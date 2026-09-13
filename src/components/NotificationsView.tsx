import React, { useState } from 'react';
import { RecolhimentoItem, GoalSettings } from '../types';
import { Bell, Clock, AlertTriangle, CheckCircle2, ShieldAlert, BellRing, Info, XCircle } from 'lucide-react';

interface NotificationsViewProps {
  items: RecolhimentoItem[];
  goalSettings: GoalSettings;
  searchTerm: string;
}

// dd/mm/aaaa -> Date, pra ordenar por vencimento mais próximo primeiro.
const parseVencimento = (v: string): Date | null => {
  if (!v) return null;
  const parts = v.split('/');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  return isNaN(d.getTime()) ? null : d;
};

const byVencimentoAsc = (a: RecolhimentoItem, b: RecolhimentoItem) => {
  const da = parseVencimento(a.vencimento);
  const db = parseVencimento(b.vencimento);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
};

export const NotificationsView: React.FC<NotificationsViewProps> = ({ items, goalSettings, searchTerm }) => {
  const matchesSearch = (item: RecolhimentoItem) =>
    item.franquia.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.cnpj.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.descricao.toLowerCase().includes(searchTerm.toLowerCase());

  const overdueItems = items.filter((i) => i.status === 'Atrasado').filter(matchesSearch).sort(byVencimentoAsc);
  const pendingItems = items.filter((i) => i.status === 'Aguardando pagamento').filter(matchesSearch).sort(byVencimentoAsc);

  const overdueValue = overdueItems.reduce((sum, i) => sum + (i.valor || 0), 0);
  const pendingValue = pendingItems.reduce((sum, i) => sum + (i.valor || 0), 0);

  const confirmedValue = items
    .filter((i) => i.status === 'Confirmada' || i.status === 'Recebida')
    .reduce((sum, i) => sum + (i.valor || 0), 0);

  const goalPercentage = Math.min(Math.round((confirmedValue / goalSettings.monthlyGoal) * 100), 100);
  const goalReached = confirmedValue >= goalSettings.monthlyGoal;

  // Feedback dentro do próprio app — o popup nativo do navegador pode ser
  // silenciosamente engolido pelo sistema operacional (Foco Assistido do
  // Windows, notificações do Chrome desligadas no SO, etc.) sem lançar erro
  // nenhum. Sem isso, clicar no botão nesse cenário parece "não fazer nada".
  const [pushStatus, setPushStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const testBrowserNotification = () => {
    setPushStatus(null);

    if (!('Notification' in window)) {
      setPushStatus({ type: 'error', message: 'Seu navegador não suporta notificações.' });
      return;
    }

    if (!window.isSecureContext) {
      setPushStatus({ type: 'error', message: 'Notificações exigem HTTPS ou localhost. Este endereço não é um contexto seguro.' });
      return;
    }

    const fire = () => {
      try {
        const n = new Notification('Munago - Teste de Notificação', {
          body: 'Esta é uma notificação de teste do seu sistema de controle.',
          icon: '/logo.png',
          tag: 'munago-teste',
        });
        n.onerror = (e) => {
          console.error('Notification error:', e);
          setPushStatus({ type: 'error', message: 'O navegador rejeitou a notificação. Veja o console para detalhes.' });
        };
        n.onshow = () => setPushStatus({ type: 'success', message: 'Notificação enviada com sucesso!' });
        // Se "onshow" não disparar em ~1.5s, o navegador aceitou o pedido mas o SO
        // pode ter engolido a exibição — isso é o mais comum no Windows.
        setPushStatus({
          type: 'success',
          message:
            'Comando de notificação enviado. Não apareceu nada na tela? No Windows, confira Configurações > Sistema > Notificações (o Chrome/Edge precisa estar liberado lá) e se o Foco Assistido não está ativo.',
        });
      } catch (err) {
        console.error('Falha ao criar notificação:', err);
        setPushStatus({ type: 'error', message: 'Falha ao exibir notificação. Veja o console para detalhes.' });
      }
    };

    if (Notification.permission === 'granted') {
      fire();
    } else if (Notification.permission === 'denied') {
      setPushStatus({
        type: 'error',
        message: 'Permissão de notificação bloqueada para este site. Libere clicando no cadeado ao lado do endereço > Notificações > Permitir.',
      });
    } else {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          fire();
        } else {
          setPushStatus({ type: 'error', message: 'A permissão para notificações foi negada ou fechada.' });
        }
      });
    }
  };

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-white/10">
        <div className="absolute right-0 top-0 -translate-x-12 translate-y-12 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Central de Alertas</h2>
              <p className="text-[10px] text-blue-200 uppercase font-bold tracking-widest mt-0.5">
                Monitoramento automático de vencimentos e metas
              </p>
            </div>
          </div>

          <button
            onClick={testBrowserNotification}
            className="flex items-center space-x-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 shrink-0"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>Testar Notificação Push</span>
          </button>
        </div>
      </div>

      {pushStatus && (
        <div
          className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs font-semibold ${
            pushStatus.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-start space-x-2">
            {pushStatus.type === 'success' ? (
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{pushStatus.message}</span>
          </div>
          <button
            onClick={() => setPushStatus(null)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            title="Fechar"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-0.5">Atrasadas</p>
          <h3 className="text-xl font-black text-rose-600 dark:text-rose-400">
            R$ {overdueValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-rose-600/70 dark:text-rose-400/70">
            <ShieldAlert className="w-3 h-3 mr-1" />
            {overdueItems.length} FRANQUIA(S)
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-0.5">Aguardando Pagamento</p>
          <h3 className="text-xl font-black text-amber-600 dark:text-amber-400">
            R$ {pendingValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-amber-600/70 dark:text-amber-400/70">
            <Clock className="w-3 h-3 mr-1" />
            {pendingItems.length} FRANQUIA(S)
          </div>
        </div>

        <div className="bg-indigo-600 p-5 rounded-xl border border-indigo-500 shadow-lg">
          <div className="flex justify-between items-start mb-0.5">
            <p className="text-[9px] font-black text-indigo-100 uppercase tracking-widest">Meta Mensal</p>
            <span className="text-[10px] font-black text-white">{goalPercentage}%</span>
          </div>
          <h3 className="text-xl font-black text-white">
            R$ {goalSettings.monthlyGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <div className="w-full bg-white/20 h-1 rounded-full mt-3 overflow-hidden">
            <div className="bg-white h-full rounded-full transition-all duration-1000" style={{ width: `${goalPercentage}%` }} />
          </div>
        </div>
      </div>

      {/* Goal Notification */}
      <div
        className={`p-4 rounded-xl border flex items-start space-x-3 ${
          goalReached
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-300'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-300'
        }`}
      >
        {goalReached ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <h4 className="text-xs font-bold uppercase tracking-wider">
            {goalReached ? 'Meta Atingida!' : 'Alerta de Meta Mensal'}
          </h4>
          <p className="text-xs mt-1">
            {goalReached
              ? `Parabéns! A arrecadação confirmada de R$ ${confirmedValue.toFixed(2)} atingiu ou superou a meta estabelecida de R$ ${goalSettings.monthlyGoal.toFixed(2)}.`
              : `A arrecadação atual (R$ ${confirmedValue.toFixed(2)}) está abaixo da meta de R$ ${goalSettings.monthlyGoal.toFixed(2)}. Faltam R$ ${(goalSettings.monthlyGoal - confirmedValue).toFixed(2)} para atingir a meta.`}
          </p>
          <span className="text-[10px] opacity-75 mt-2 block">Atualizado agora • Sistema automático</span>
        </div>
      </div>

      {/* Overdue Section — prioridade máxima */}
      {overdueItems.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-rose-500 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Franquias Atrasadas ({overdueItems.length})</span>
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {overdueItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50/50 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-start justify-between gap-3"
              >
                <div className="flex items-start space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.franquia}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Vencimento: {item.vencimento} • Competência: <span className="uppercase font-semibold">{item.competenciaRecolhimento}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">R$ {item.valor.toFixed(2)}</span>
                  <span className="block text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">Atrasado</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Section */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Franquias Aguardando Pagamento ({pendingItems.length})
        </h3>

        {pendingItems.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            Nenhuma pendência de pagamento no momento. Todas as franquias estão em dia!
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-start justify-between gap-3"
              >
                <div className="flex items-start space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.franquia}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Vencimento: {item.vencimento} • C. Custo: {item.cCusto} • Competência:{' '}
                      <span className="uppercase font-semibold">{item.competenciaRecolhimento}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">R$ {item.valor.toFixed(2)}</span>
                  <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">Aguardando Pagamento</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
