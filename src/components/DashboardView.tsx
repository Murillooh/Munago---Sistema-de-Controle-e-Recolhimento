import React from 'react';
import { RecolhimentoItem, GoalSettings } from '../types';
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertTriangle,
  FileSpreadsheet,
  Target,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';

interface DashboardViewProps {
  items: RecolhimentoItem[];
  goalSettings: GoalSettings;
  onNavigateTable: () => void;
  searchTerm: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  items,
  goalSettings,
  onNavigateTable,
  searchTerm,
}) => {
  const filteredItems = items.filter(item => 
    item.franquia.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.cnpj.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.descricao.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Use filteredItems for calculations and rendering...
  const totalValue = filteredItems.reduce((sum, item) => sum + (item.valor || 0), 0);
  
  const confirmedValue = filteredItems
    .filter((i) => i.status === 'Confirmada' || i.status === 'Recebida')
    .reduce((sum, i) => sum + (i.valor || 0), 0);

  const pendingValue = filteredItems
    .filter((i) => i.status === 'Aguardando pagamento')
    .reduce((sum, i) => sum + (i.valor || 0), 0);

  const countConfirmed = filteredItems.filter(
    (i) => i.status === 'Confirmada' || i.status === 'Recebida'
  ).length;

  const countPending = filteredItems.filter((i) => i.status === 'Aguardando pagamento').length;

  // Goal progress percentage
  const goalPercentage = Math.min(
    Math.round((confirmedValue / goalSettings.monthlyGoal) * 100),
    100
  );

  // Evolution of the last 6 months
  const getMonthYear = (date: Date) => {
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${months[date.getMonth()]}/${date.getFullYear().toString().slice(-2)}`;
  };

  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    last6Months.push(getMonthYear(d));
  }

  const evolutionData = last6Months.map(month => {
    const data = filteredItems.filter(item => item.competenciaRecolhimento?.toLowerCase() === month.toLowerCase());
    return {
      month: month.toUpperCase(),
      Total: data.reduce((sum, item) => sum + (item.valor || 0), 0),
      Confirmado: data.filter(i => i.status === 'Confirmada' || i.status === 'Recebida').reduce((sum, i) => sum + (i.valor || 0), 0)
    };
  });

  return (
    <div className="space-y-4 pb-8">
      {/* Welcome Banner - Compact */}
      <div id="tour-welcome" className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-white/10">
        <div className="absolute right-0 top-0 -translate-x-12 translate-y-12 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute left-0 bottom-0 translate-x-8 -translate-y-4 w-48 h-48 bg-indigo-500/8 rounded-full blur-[60px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center space-x-2 bg-white/10 text-blue-200 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border border-white/5 backdrop-blur-md mb-2">
              <FileSpreadsheet className="w-3 h-3" />
              <span>Painel de Inteligência Financeira</span>
            </div>
            <h2 className="text-xl font-black tracking-tight leading-tight">Monitoramento de Performance e <br /><span className="text-blue-400">Evolução Estratégica</span></h2>
          </div>
          <button
            onClick={onNavigateTable}
            className="flex items-center space-x-2 bg-white text-slate-900 hover:bg-blue-50 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
          >
            <span>Gerenciar Planilha</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Cards - Compact grid */}
      <div id="tour-kpis" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800/60 shadow-sm relative overflow-hidden group card-lift accent-top" style={{'--accent-from': '#3b82f6', '--accent-to': '#6366f1'} as React.CSSProperties}>
          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Total Geral</p>
          <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">
            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-slate-500">
            <span className="bg-slate-100/80 dark:bg-slate-800/80 px-1.5 py-0.5 rounded-md mr-1.5">{items.length}</span>
            REGISTROS
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800/60 shadow-sm group card-lift accent-top" style={{'--accent-from': '#10b981', '--accent-to': '#059669'} as React.CSSProperties}>
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Confirmado</p>
          <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            R$ {confirmedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-emerald-600/70">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {countConfirmed} UNIDADES
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800/60 shadow-sm group card-lift accent-top" style={{'--accent-from': '#f59e0b', '--accent-to': '#d97706'} as React.CSSProperties}>
          <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-0.5">Em Aberto</p>
          <h3 className="text-xl font-black text-amber-600 dark:text-amber-400">
            R$ {pendingValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center text-[9px] font-bold text-amber-600/70">
            <Clock className="w-3 h-3 mr-1" />
            {countPending} PENDÊNCIAS
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-5 rounded-xl border border-indigo-400/20 shadow-lg shadow-indigo-600/15 relative overflow-hidden card-lift">
          <div className="absolute inset-0 shimmer pointer-events-none" />
          <div className="relative z-10">
          <div className="flex justify-between items-start mb-0.5">
            <p className="text-[9px] font-black text-indigo-100 uppercase tracking-widest">Meta Mensal</p>
            <span className="text-[10px] font-black text-white bg-white/15 px-2 py-0.5 rounded-full">{goalPercentage}%</span>
          </div>
          <h3 className="text-xl font-black text-white">
            R$ {goalSettings.monthlyGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <div className="w-full bg-white/20 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-white h-full rounded-full transition-all duration-1000 shadow-sm"
              style={{ width: `${goalPercentage}%` }}
            />
          </div>
          </div>
        </div>
      </div>

      {/* Evolution Trend Chart - MAIN FOCUS */}
      <div id="tour-charts" className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/60 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tight">Monitoramento Estratégico de Evolução</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Análise de crescimento e conversão nos últimos 6 meses</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-lg shadow-blue-500/20"></div>
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Faturamento Bruto</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20"></div>
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Receita Confirmada</span>
            </div>
          </div>
        </div>

        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorConfirmado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.05} />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                tickFormatter={(val) => `R$ ${val >= 1000 ? (val / 1000) + 'k' : val}`}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  border: 'none', 
                  borderRadius: '12px', 
                  padding: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                }}
                itemStyle={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 0' }}
                labelStyle={{ color: '#94a3b8', fontSize: '9px', fontWeight: 'black', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]}
              />
              <Area 
                type="monotone" 
                dataKey="Total" 
                stroke="#3b82f6" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorTotal)" 
                activeDot={{ r: 6, strokeWidth: 0, fill: '#3b82f6' }}
              />
              <Area 
                type="monotone" 
                dataKey="Confirmado" 
                stroke="#10b981" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorConfirmado)" 
                activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity Table Preview - Compact */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">Últimos Lançamentos</h3>
          <button onClick={onNavigateTable} className="text-[10px] font-bold text-blue-600 hover:text-blue-700">Ver todos ({filteredItems.length}) &rarr;</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                <th className="py-2.5 px-5">Franquia</th>
                <th className="py-2.5 px-5">Vencimento</th>
                <th className="py-2.5 px-5">Valor</th>
                <th className="py-2.5 px-5">Status</th>
                <th className="py-2.5 px-5">Competência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.slice(-5).reverse().map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="py-2 px-5 font-bold text-slate-900 dark:text-slate-100">{item.franquia}</td>
                  <td className="py-2 px-5 text-slate-500">{item.vencimento}</td>
                  <td className="py-2 px-5 font-bold text-slate-900 dark:text-slate-100">R$ {item.valor.toFixed(2)}</td>
                  <td className="py-2 px-5">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold ${
                      item.status === 'Recebida' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 
                      item.status === 'Confirmada' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 
                      'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="py-2 px-5 text-slate-400 font-medium">{item.competenciaRecolhimento}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
