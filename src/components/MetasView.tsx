import React, { useState } from 'react';
import { GoalSettings, RecolhimentoItem, DetailedGoal } from '../types';
import { Target, Save, Mail, Bell, ShieldCheck, Award, Plus, Trash2, X, DollarSign, Clock, CalendarClock, ListChecks, PartyPopper, PieChart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DatePicker } from './DatePicker';

interface MetasViewProps {
  goalSettings: GoalSettings;
  onUpdateGoalSettings: (settings: GoalSettings) => void;
  items: RecolhimentoItem[];
}

// Cor por categoria — dá identidade visual a cada meta no grid e nos botões
// do modal, em vez de todo cartão sair igual só com o nome mudando.
const CATEGORY_STYLES: Record<string, { text: string; bg: string; ring: string; dot: string; gradient: string }> = {
  Royalties: {
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    ring: 'ring-blue-500/20',
    dot: 'bg-blue-500',
    gradient: 'from-blue-500 to-indigo-500',
  },
  Taxa: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    ring: 'ring-amber-500/20',
    dot: 'bg-amber-500',
    gradient: 'from-amber-500 to-orange-500',
  },
  'Fundo de Propaganda': {
    text: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    ring: 'ring-purple-500/20',
    dot: 'bg-purple-500',
    gradient: 'from-purple-500 to-fuchsia-500',
  },
  Outros: {
    text: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800',
    ring: 'ring-slate-400/20',
    dot: 'bg-slate-400',
    gradient: 'from-slate-500 to-slate-600',
  },
};
const DEFAULT_CATEGORY_STYLE = CATEGORY_STYLES.Outros;
const categoryStyle = (cat?: string) => (cat && CATEGORY_STYLES[cat]) || DEFAULT_CATEGORY_STYLE;

const formatMoney = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export const MetasView: React.FC<MetasViewProps> = ({
  goalSettings,
  onUpdateGoalSettings,
  items,
}) => {
  const [formData, setFormData] = useState<GoalSettings>(goalSettings);
  const [successMessage, setSuccessMessage] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<DetailedGoal | null>(null);
  const [tempGoal, setTempGoal] = useState<Partial<DetailedGoal>>({});

  const confirmedValue = items
    .filter((i) => i.status === 'Confirmada' || i.status === 'Recebida')
    .reduce((sum, i) => sum + (i.valor || 0), 0);

  const rawProgress = formData.monthlyGoal > 0 ? (confirmedValue / formData.monthlyGoal) * 100 : 0;
  const progress = Math.min(Math.round(rawProgress), 100);
  // Meta batida e ultrapassada: em vez de travar em "100% / falta R$ 0,00"
  // (parecia quebrado com 224k confirmado numa meta de 15k), mostra quanto
  // passou de verdade.
  const overshootPercent = Math.max(Math.round(rawProgress) - 100, 0);
  const goalReached = formData.monthlyGoal > 0 && confirmedValue >= formData.monthlyGoal;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateGoalSettings(formData);
    setSuccessMessage(true);
    setTimeout(() => setSuccessMessage(false), 3000);
  };

  const handleOpenModal = (goal?: DetailedGoal) => {
    if (goal) {
      setEditingGoal(goal);
      setTempGoal(goal);
    } else {
      setEditingGoal(null);
      setTempGoal({
        name: '',
        value: 0,
        deadline: '',
        category: 'Royalties'
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveGoal = () => {
    let newDetailed: DetailedGoal[];
    if (editingGoal) {
      newDetailed = (formData.detailedGoals || []).map(g =>
        g.id === editingGoal.id ? { ...g, ...tempGoal } as DetailedGoal : g
      );
    } else {
      const newGoal: DetailedGoal = {
        id: Math.random().toString(36).substr(2, 9),
        name: tempGoal.name || '',
        value: tempGoal.value || 0,
        deadline: tempGoal.deadline,
        category: tempGoal.category
      };
      newDetailed = [...(formData.detailedGoals || []), newGoal];
    }

    const totalValue = newDetailed.reduce((sum, g) => sum + g.value, 0);
    const updated = {
      ...formData,
      detailedGoals: newDetailed,
      monthlyGoal: totalValue > 0 ? totalValue : formData.monthlyGoal
    };

    setFormData(updated);
    onUpdateGoalSettings(updated);
    setIsModalOpen(false);
    setSuccessMessage(true);
    setTimeout(() => setSuccessMessage(false), 3000);
  };

  const handleDeleteGoal = (id: string) => {
    const newDetailed = (formData.detailedGoals || []).filter(g => g.id !== id);
    const totalValue = newDetailed.reduce((sum, g) => sum + g.value, 0);
    const updated = {
      ...formData,
      detailedGoals: newDetailed,
      monthlyGoal: totalValue > 0 ? totalValue : formData.monthlyGoal
    };
    setFormData(updated);
    onUpdateGoalSettings(updated);
  };

  const activeGoalsCount = formData.detailedGoals?.length || 0;
  const remainingValue = Math.max(formData.monthlyGoal - confirmedValue, 0);

  // Soma por categoria — só pra desenhar a barrinha de composição da meta
  // total no card de resumo (dado 100% derivado da própria configuração,
  // sem inventar relação com lançamentos).
  const categoryBreakdown = (formData.detailedGoals || []).reduce<Record<string, number>>((acc, g) => {
    const key = g.category || 'Outros';
    acc[key] = (acc[key] || 0) + g.value;
    return acc;
  }, {});
  const totalDetailedValue = Object.values(categoryBreakdown).reduce((s, v) => s + v, 0);

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 bg-white/15 text-blue-100 px-3 py-1 rounded-full text-xs font-semibold mb-2 backdrop-blur-md">
              <Target className="w-3.5 h-3.5" />
              <span>Planejamento Financeiro</span>
            </div>
            <h2 className="text-2xl font-bold">Metas de Arrecadação</h2>
            <p className="text-blue-100 text-sm mt-1 max-w-2xl">
              Acompanhe e configure seus objetivos financeiros de {formData.targetYear}.
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center space-x-2 px-5 py-2.5 bg-white text-blue-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all hover:scale-[1.03] active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Meta</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_360px] gap-6 items-start">
      {/* Left column: goals, config */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {successMessage && (
          <div className="mb-6 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl font-semibold flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Metas atualizadas com sucesso!</span>
          </div>
        )}

        {/* Individual Goals Grid (Quadradinhos) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {formData.detailedGoals && formData.detailedGoals.length > 0 ? (
            formData.detailedGoals.map((goal) => {
              const style = categoryStyle(goal.category);
              const share = totalDetailedValue > 0 ? Math.round((goal.value / totalDetailedValue) * 100) : 0;
              return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={goal.id}
                onClick={() => handleOpenModal(goal)}
                className="p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-24 h-24 ${style.bg} rounded-full -mr-12 -mt-12 opacity-60`} />

                <div className="flex justify-between items-start relative z-10 mb-4">
                  <div className="flex items-center space-x-2">
                    <div className={`p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 ${style.text} shadow-sm group-hover:scale-110 transition-transform`}>
                      <Target className="w-4 h-4" />
                    </div>
                    {goal.category && (
                      <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${style.text} ${style.bg} px-2 py-1 rounded-md`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {goal.category}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteGoal(goal.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="relative z-10 space-y-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                      {goal.name || 'Meta s/ nome'}
                    </h4>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {formatMoney(goal.value)}
                    </p>
                  </div>

                  {/* Fatia dessa meta dentro do total configurado — dado derivado só
                      das metas cadastradas, sem tentar casar com lançamentos. */}
                  <div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${style.gradient}`} style={{ width: `${share}%` }} />
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                      {share}% da meta total
                    </p>
                  </div>

                  {goal.deadline && (
                    <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800 w-fit">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>Prazo: {new Date(goal.deadline).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              </motion.div>
              );
            })
          ) : (
            <div
              onClick={() => handleOpenModal()}
              className="col-span-full py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Target className="w-7 h-7 text-blue-400 dark:text-blue-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Nenhuma meta configurada</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest font-black">
                Clique aqui para criar sua primeira meta
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-8 mt-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Configurações Gerais</h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Meta Total Mensal (R$)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="number"
                    step="100"
                    value={formData.monthlyGoal}
                    readOnly={formData.detailedGoals && formData.detailedGoals.length > 0}
                    onChange={(e) =>
                      setFormData({ ...formData, monthlyGoal: parseFloat(e.target.value) || 0 })
                    }
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none ${formData.detailedGoals && formData.detailedGoals.length > 0 ? 'opacity-70 cursor-not-allowed' : ''}`}
                    required
                  />
                </div>
                {formData.detailedGoals && formData.detailedGoals.length > 0 && (
                  <p className="text-[10px] text-blue-500 mt-1.5 font-medium">
                    Calculado automaticamente pelas metas acima.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Ano de Exercício</label>
                <div className="relative">
                  <CalendarClock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="number"
                    value={formData.targetYear}
                    onChange={(e) =>
                      setFormData({ ...formData, targetYear: parseInt(e.target.value) || 2026 })
                    }
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  E-mail de Notificações
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    value={formData.alertEmail}
                    onChange={(e) => setFormData({ ...formData, alertEmail: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 gap-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${formData.enableNotifications ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100">Alertas Inteligentes</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Notificar sobre atrasos e conquistas de metas.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enableNotifications}
                  onChange={(e) => setFormData({ ...formData, enableNotifications: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-[51px] h-[31px] bg-slate-200 peer-focus:outline-none dark:bg-slate-700 rounded-full peer-checked:bg-blue-600 transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[27px] after:w-[27px] after:shadow-[0_1px_3px_rgba(0,0,0,0.3)] after:transition-transform after:duration-200 after:ease-in-out peer-checked:after:translate-x-[20px]"></div>
              </label>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                className="flex items-center space-x-2 px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Tudo</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right column: performance + quick summary, sticky on wide screens */}
      <div className="space-y-6 2xl:sticky 2xl:top-6">
        {/* Progress Card */}
        <div className={`rounded-2xl p-5 text-white relative overflow-hidden shadow-xl ${goalReached ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 shadow-emerald-500/20' : 'bg-blue-600 shadow-blue-500/20'}`}>
          <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full -mr-12 -mt-12 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/10 rounded-full -ml-8 -mb-8 blur-2xl" />

          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-white/20 backdrop-blur-md rounded-full text-[9px] font-black uppercase tracking-widest">
              {goalReached ? <PartyPopper className="w-3 h-3" /> : <Award className="w-3 h-3" />}
              <span>{goalReached ? 'Meta Batida' : 'Desempenho Atual'}</span>
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xl font-black leading-tight truncate">
                  {formatMoney(confirmedValue)}
                </h3>
                <p className="text-white/80 text-[11px] font-medium mt-1">
                  Confirmado em {formData.targetYear}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-black">{progress}%</div>
                {overshootPercent > 0 && (
                  <div className="text-[9px] font-black text-white/80 uppercase tracking-widest">+{overshootPercent}% acima</div>
                )}
              </div>
            </div>

            <div>
              <div className="w-full bg-white/20 h-2.5 rounded-full overflow-hidden backdrop-blur-sm">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="bg-white h-full rounded-full shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                />
              </div>
              <div className="flex justify-between mt-2 text-[9px] font-black text-white/80 uppercase tracking-widest">
                <span>R$ 0,00</span>
                <span>Meta: {formatMoney(formData.monthlyGoal)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/15 flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">
                {goalReached ? 'Excedente sobre a meta' : 'Falta pra bater a meta'}
              </span>
              <span className="text-xs font-black shrink-0">
                {goalReached ? formatMoney(confirmedValue - formData.monthlyGoal) : formatMoney(remainingValue)}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Summary */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 space-y-3">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Resumo Rápido</h4>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
              <ListChecks className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold">Metas ativas</span>
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-slate-100">{activeGoalsCount}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
              <CalendarClock className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold">Ano de exercício</span>
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-slate-100">{formData.targetYear}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
              <Bell className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold">Alertas inteligentes</span>
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
              formData.enableNotifications
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}>
              {formData.enableNotifications ? 'Ativos' : 'Desativados'}
            </span>
          </div>

          {totalDetailedValue > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 mb-2.5">
                <PieChart className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-semibold">Composição da meta</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                {Object.entries(categoryBreakdown).map(([cat, val]) => (
                  <div
                    key={cat}
                    className={`h-full bg-gradient-to-r ${categoryStyle(cat).gradient}`}
                    style={{ width: `${(val / totalDetailedValue) * 100}%` }}
                    title={`${cat}: ${formatMoney(val)}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5">
                {Object.entries(categoryBreakdown).map(([cat, val]) => (
                  <div key={cat} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <span className={`w-1.5 h-1.5 rounded-full ${categoryStyle(cat).dot}`} />
                    <span>{cat}</span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span>{Math.round((val / totalDetailedValue) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      {/* Modal for Multiple Goals */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                      {editingGoal ? 'Editar Meta' : 'Nova Meta de Arrecadação'}
                    </h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">Configure os detalhes do objetivo</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nome da Meta</label>
                      <div className="relative">
                        <Target className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
                        <input
                          type="text"
                          placeholder="Ex: Franquias São Paulo"
                          value={tempGoal.name}
                          onChange={(e) => setTempGoal({ ...tempGoal, name: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Valor Alvo</label>
                      <div className="relative">
                        <DollarSign className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
                        <input
                          type="number"
                          placeholder="0,00"
                          value={tempGoal.value}
                          onChange={(e) => setTempGoal({ ...tempGoal, value: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Prazo Final</label>
                      <DatePicker
                        value={tempGoal.deadline || ''}
                        onChange={(v) => setTempGoal({ ...tempGoal, deadline: v })}
                        className="w-full flex items-center gap-2 pl-4 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Categoria</label>
                    <div className="relative flex flex-wrap gap-2 mt-2">
                      {['Royalties', 'Taxa', 'Fundo de Propaganda', 'Outros'].map((cat) => {
                        const style = categoryStyle(cat);
                        const active = tempGoal.category === cat;
                        return (
                          <button
                            key={cat}
                            onClick={() => setTempGoal({ ...tempGoal, category: cat })}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                              active
                                ? `bg-gradient-to-r ${style.gradient} border-transparent text-white shadow-lg`
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : style.dot}`} />
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-4 bg-slate-50/50 dark:bg-slate-800/50">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 text-xs font-black text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveGoal}
                  className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  {editingGoal ? 'Atualizar Meta' : 'Salvar Meta'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
