import React, { useState, useEffect } from 'react';
import { RecolhimentoItem, Unidade } from '../types';
import {
  CreditCard,
  ExternalLink,
  Send,
  Loader2,
  QrCode,
  Building2,
  ShieldAlert,
} from 'lucide-react';

interface AsaasIntegrationViewProps {
  items: RecolhimentoItem[];
  unidades: Unidade[];
  onUpdateItem: (item: RecolhimentoItem) => void;
}

const onlyDigits = (v: string) => (v || '').replace(/\D/g, '');

// Chave própria (não por usuário) — o modo sandbox/produção é uma escolha
// de ambiente, não um dado de conta; simples assim evita cobrança de
// verdade sem querer logo depois de trocar de sessão.
const ASAAS_MODE_KEY = 'munago_asaas_sandbox';

export const AsaasIntegrationView: React.FC<AsaasIntegrationViewProps> = ({ items, unidades, onUpdateItem }) => {
  // Antes travado em sandbox sem nenhuma forma de mudar pela UI — mesmo com
  // uma chave de produção configurada, não tinha como emitir cobrança real.
  // Sempre começa em sandbox por segurança; só vira produção se o usuário
  // trocar explicitamente (e a escolha fica salva pro próximo acesso).
  const [sandbox, setSandbox] = useState(() => localStorage.getItem(ASAAS_MODE_KEY) !== 'false');

  useEffect(() => {
    localStorage.setItem(ASAAS_MODE_KEY, String(sandbox));
  }, [sandbox]);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [generatedCharges, setGeneratedCharges] = useState<Record<string, any>>({});

  // Resolve a unidade (e sua chave de API) que corresponde a um lançamento, via CNPJ.
  const findUnidade = (item: RecolhimentoItem) =>
    unidades.find((u) => onlyDigits(u.cnpj) && onlyDigits(u.cnpj) === onlyDigits(item.cnpj));

  const handleGenerateCharge = async (item: RecolhimentoItem) => {
    const unidade = findUnidade(item);
    const apiKey = unidade?.asaasApiKey;

    if (!apiKey) {
      alert(`Nenhuma chave de API ASAAS configurada para esta unidade.\nConfigure em Bases > Unidades (${unidade?.nome || item.franquia}).`);
      return;
    }

    setLoadingItemId(item.id);
    try {
      const res = await fetch('/api/asaas/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          sandbox,
          chargeData: item,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedCharges((prev) => ({
          ...prev,
          [item.id]: data,
        }));
        // Cobrança emitida != paga: mantém "Aguardando pagamento" com o asaasId
        // vinculado, para o botão "Sincronizar ASAAS" (Planilha) conseguir
        // consultar e atualizar o status quando o pagamento for confirmado.
        onUpdateItem({
          ...item,
          asaasId: data.chargeId,
        });
      } else {
        alert('Erro ao gerar cobrança no ASAAS: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (err) {
      alert('Erro ao comunicar com a API do ASAAS.');
    } finally {
      setLoadingItemId(null);
    }
  };

  const pendingItems = items.filter((i) => i.status === 'Aguardando pagamento');

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-200 px-3 py-1 rounded-full text-xs font-semibold mb-2 backdrop-blur-md">
            <Building2 className="w-3.5 h-3.5" />
            <span>Integração Bancária Oficial • ASAAS API</span>
          </div>
          <h2 className="text-2xl font-bold">Cobranças e Pagamentos via ASAAS</h2>
          <p className="text-emerald-100 text-sm mt-1 max-w-2xl">
            Cada unidade usa sua própria chave de API ASAAS, configurada em Bases &gt; Unidades. A cobrança é gerada com a chave da unidade correspondente à franquia.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-200 border border-emerald-400/30">
            <CreditCard className="w-6 h-6" />
          </div>
          <label className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full cursor-pointer select-none">
            <span className={`text-[9px] font-black uppercase tracking-widest ${sandbox ? 'text-white' : 'text-white/50'}`}>Sandbox</span>
            <span className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={!sandbox}
                onChange={(e) => setSandbox(!e.target.checked)}
                className="sr-only peer"
              />
              <span className="w-9 h-5 bg-white/25 peer-checked:bg-rose-500 rounded-full transition-colors" />
              <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </span>
            <span className={`text-[9px] font-black uppercase tracking-widest ${!sandbox ? 'text-white' : 'text-white/50'}`}>Produção</span>
          </label>
        </div>
      </div>

      {!sandbox && (
        <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-300 text-xs font-bold flex items-center space-x-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Modo PRODUÇÃO ativo — cobranças geradas agora são reais, com dinheiro de verdade envolvido.</span>
        </div>
      )}

      {/* Pending Items for ASAAS Billing */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Gerar Cobranças Pix / Boleto (ASAAS)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecione uma franquia pendente para emitir a cobrança instantaneamente via API do ASAAS.</p>
          </div>
          <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-bold px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800/50">
            {pendingItems.length} Pendentes
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {pendingItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs">
              Nenhuma franquia com pagamento pendente no momento para envio ao ASAAS.
            </div>
          ) : (
            pendingItems.map((item) => {
              // asaasId persiste entre recarregamentos; generatedCharges só existe
              // na sessão atual (traz o link da fatura). O asaasId é quem decide
              // se já foi emitida, pra não duplicar cobrança num F5.
              const alreadyEmitted = Boolean(item.asaasId);
              const generated = generatedCharges[item.id];
              const unidade = findUnidade(item);
              const hasKey = Boolean(unidade?.asaasApiKey);
              return (
                <div key={item.id} className="p-4 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{item.franquia}</span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">({item.cnpj})</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Vencimento: <strong className="text-slate-700 dark:text-slate-300">{item.vencimento}</strong> • C. Custo:{' '}
                      <strong className="text-slate-700 dark:text-slate-300">{item.cCusto}</strong> • Competência:{' '}
                      <span className="uppercase font-semibold">{item.competenciaRecolhimento}</span>
                    </p>
                    {alreadyEmitted && (
                      <div className="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                        <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div>
                          <p className="font-bold">Cobrança Gerada no ASAAS (ID: {generated?.chargeId || item.asaasId}) • Aguardando confirmação de pagamento</p>
                          {generated?.invoiceUrl && (
                            <a
                              href={generated.invoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 mt-0.5"
                            >
                              <span>Abrir Link da Fatura Pix/Boleto</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {!alreadyEmitted && !hasKey && (
                      <div className="mt-2 flex items-center space-x-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Chave ASAAS não configurada para esta unidade (Bases &gt; Unidades)</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right">
                      <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                        R$ {item.valor.toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleGenerateCharge(item)}
                      disabled={loadingItemId === item.id || alreadyEmitted || !hasKey}
                      title={!hasKey ? 'Configure a chave de API desta unidade em Bases > Unidades' : undefined}
                      className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                        alreadyEmitted
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 cursor-not-allowed'
                          : !hasKey
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {loadingItemId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{alreadyEmitted ? 'Cobrança Emitida' : 'Gerar no ASAAS'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
