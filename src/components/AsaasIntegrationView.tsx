import React, { useState, useEffect, useMemo } from 'react';
import { RecolhimentoItem, Unidade } from '../types';
import {
  CreditCard,
  ExternalLink,
  Send,
  Loader2,
  QrCode,
  Building2,
  ShieldAlert,
  Search,
  Zap,
} from 'lucide-react';
import { ASAAS_MODE_KEY, isAsaasSandbox } from '../utils/asaas';

interface AsaasIntegrationViewProps {
  items: RecolhimentoItem[];
  unidades: Unidade[];
  onUpdateItem: (item: RecolhimentoItem) => void;
}

const onlyDigits = (v: string) => (v || '').replace(/\D/g, '');

type AsaasBillingType = 'PIX' | 'BOLETO' | 'UNDEFINED';
const BILLING_TYPE_KEY = 'munago_asaas_billing_type';
const BILLING_TYPE_OPTIONS: { value: AsaasBillingType; label: string }[] = [
  { value: 'PIX', label: 'Pix' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'UNDEFINED', label: 'Pix + Boleto' },
];

export const AsaasIntegrationView: React.FC<AsaasIntegrationViewProps> = ({ items, unidades, onUpdateItem }) => {
  // Antes travado em sandbox sem nenhuma forma de mudar pela UI — mesmo com
  // uma chave de produção configurada, não tinha como emitir cobrança real.
  // Sempre começa em sandbox por segurança; só vira produção se o usuário
  // trocar explicitamente (e a escolha fica salva pro próximo acesso).
  const [sandbox, setSandbox] = useState(isAsaasSandbox);

  useEffect(() => {
    localStorage.setItem(ASAAS_MODE_KEY, String(sandbox));
  }, [sandbox]);

  // Antes o servidor gerava sempre PIX, sem opção nenhuma — nunca existia
  // boleto de verdade mesmo a tela falando "Pix/Boleto". "Pix + Boleto"
  // (billingType UNDEFINED no ASAAS) deixa o pagador escolher na hora,
  // por isso é o padrão.
  const [billingType, setBillingType] = useState<AsaasBillingType>(() => {
    const saved = localStorage.getItem(BILLING_TYPE_KEY);
    return saved === 'PIX' || saved === 'BOLETO' || saved === 'UNDEFINED' ? saved : 'UNDEFINED';
  });

  useEffect(() => {
    localStorage.setItem(BILLING_TYPE_KEY, billingType);
  }, [billingType]);
  // Conjunto em vez de um id só — geração em lote dispara várias ao mesmo
  // tempo, cada botão precisa saber só se A SUA cobrança está em andamento.
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [generatedCharges, setGeneratedCharges] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Resolve a unidade (e sua chave de API) que corresponde a um lançamento, via CNPJ.
  const findUnidade = (item: RecolhimentoItem) =>
    unidades.find((u) => onlyDigits(u.cnpj) && onlyDigits(u.cnpj) === onlyDigits(item.cnpj));

  // Devolve o motivo de erro em vez de já mostrar alert() — a geração em
  // lote precisa acumular os erros de vários itens numa mensagem só, não
  // interromper tudo no primeiro alert() como fazia o botão individual.
  const generateCharge = async (item: RecolhimentoItem): Promise<{ ok: true } | { ok: false; error: string }> => {
    const unidade = findUnidade(item);
    const apiKey = unidade?.asaasApiKey;
    if (!apiKey) {
      return { ok: false, error: `${item.franquia}: sem chave ASAAS configurada (Bases > Unidades).` };
    }

    setLoadingIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch('/api/asaas/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, sandbox, billingType, chargeData: item }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedCharges((prev) => ({ ...prev, [item.id]: data }));
        // Cobrança emitida != paga: mantém "Aguardando pagamento" com o asaasId
        // vinculado, para o botão "Sincronizar ASAAS" (Planilha) conseguir
        // consultar e atualizar o status quando o pagamento for confirmado.
        // invoiceUrl persiste no banco — sem isso o link só existia neste
        // estado local (generatedCharges) e sumia num F5.
        onUpdateItem({ ...item, asaasId: data.chargeId, asaasInvoiceUrl: data.invoiceUrl || undefined });
        return { ok: true };
      }
      return { ok: false, error: `${item.franquia}: ${data.error || 'erro desconhecido'}` };
    } catch {
      return { ok: false, error: `${item.franquia}: falha ao comunicar com a API do ASAAS.` };
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleGenerateCharge = async (item: RecolhimentoItem) => {
    const result = await generateCharge(item);
    if (result.ok === false) alert('Erro ao gerar cobrança no ASAAS: ' + result.error);
  };

  // Recebida/Confirmada já foi paga — não faz sentido gerar cobrança nova.
  const isBillableStatus = (status: string) => status === 'Aguardando pagamento' || status === 'Atrasado';

  const pendingItems = items.filter((i) => i.status === 'Aguardando pagamento');

  // Sem busca, mostra só quem está realmente aguardando pagamento (visão
  // padrão, sem poluir com franquias já pagas). Com busca, procura em TODOS
  // os status — sem isso não dava pra achar uma franquia já confirmada ou
  // atrasada só pra conferir/gerar uma cobrança pra ela.
  const filteredPendingItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendingItems;
    return items.filter(
      (i) => i.franquia.toLowerCase().includes(q) || onlyDigits(i.cnpj).includes(onlyDigits(q))
    );
  }, [items, pendingItems, search]);

  // Só entra na seleção/lote quem realmente pode ser gerado agora — item já
  // emitido, sem chave de unidade, ou já pago não tem o que fazer num "gerar em lote".
  const billableItems = filteredPendingItems.filter(
    (i) => !i.asaasId && Boolean(findUnidade(i)?.asaasApiKey) && isBillableStatus(i.status)
  );
  const allBillableSelected = billableItems.length > 0 && billableItems.every((i) => selectedIds.has(i.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllBillable = () => {
    setSelectedIds(allBillableSelected ? new Set() : new Set(billableItems.map((i) => i.id)));
  };

  const handleBulkGenerate = async () => {
    const targets = billableItems.filter((i) => selectedIds.has(i.id));
    if (targets.length === 0) return;
    setBulkGenerating(true);
    try {
      const results = await Promise.all(targets.map((item) => generateCharge(item)));
      const failures = results.filter((r): r is { ok: false; error: string } => !r.ok);
      setSelectedIds(new Set());
      if (failures.length > 0) {
        alert(`${targets.length - failures.length} de ${targets.length} cobranças geradas.\n\nFalhas:\n${failures.map((f) => f.error).join('\n')}`);
      }
    } finally {
      setBulkGenerating(false);
    }
  };

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

          <div className="flex items-center gap-1 bg-black/20 p-1 rounded-full">
            {BILLING_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBillingType(opt.value)}
                title="Tipo de cobrança gerada no ASAAS"
                className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                  billingType === opt.value ? 'bg-white text-emerald-800' : 'text-white/60 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Gerar Cobranças Pix / Boleto (ASAAS)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecione uma ou várias franquias pendentes para emitir cobrança via API do ASAAS.</p>
          </div>
          <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-bold px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800/50 shrink-0">
            {pendingItems.length} Pendentes
          </span>
        </div>

        {items.length > 0 && (
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-slate-50/50 dark:bg-slate-800/30">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por franquia ou CNPJ (qualquer status)..."
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none"
              />
            </div>
            <button
              onClick={handleBulkGenerate}
              disabled={selectedIds.size === 0 || bulkGenerating}
              title={selectedIds.size === 0 ? 'Selecione ao menos uma franquia' : undefined}
              className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all shrink-0"
            >
              {bulkGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              <span>{bulkGenerating ? 'Gerando...' : `Gerar em lote${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}</span>
            </button>
          </div>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredPendingItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs">
              {search.trim()
                ? `Nenhuma franquia encontrada para "${search}".`
                : 'Nenhuma franquia com pagamento pendente no momento para envio ao ASAAS.'}
            </div>
          ) : (
            <>
            {billableItems.length > 0 && (
              <label className="flex items-center space-x-2 px-4 sm:px-6 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer select-none bg-slate-50/50 dark:bg-slate-800/20">
                <input
                  type="checkbox"
                  checked={allBillableSelected}
                  onChange={toggleSelectAllBillable}
                  className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:bg-slate-700 dark:border-slate-600"
                />
                <span>Selecionar todas as prontas pra gerar ({billableItems.length})</span>
              </label>
            )}
            {filteredPendingItems.map((item) => {
              // asaasId persiste entre recarregamentos; generatedCharges só existe
              // na sessão atual (traz o link da fatura). O asaasId é quem decide
              // se já foi emitida, pra não duplicar cobrança num F5.
              const alreadyEmitted = Boolean(item.asaasId);
              const generated = generatedCharges[item.id];
              const invoiceUrl = generated?.invoiceUrl || item.asaasInvoiceUrl;
              const unidade = findUnidade(item);
              const hasKey = Boolean(unidade?.asaasApiKey);
              const alreadyPaid = !alreadyEmitted && !isBillableStatus(item.status);
              const canSelect = !alreadyEmitted && hasKey && isBillableStatus(item.status);
              return (
                <div key={item.id} className="p-4 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="space-y-1 flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      disabled={!canSelect}
                      title={!canSelect ? 'Já emitida, já paga, ou sem chave de API configurada' : undefined}
                      className="mt-1 w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:bg-slate-700 dark:border-slate-600 disabled:opacity-30 shrink-0"
                    />
                    <div>
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{item.franquia}</span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">({item.cnpj})</span>
                      {item.status !== 'Aguardando pagamento' && (
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          item.status === 'Atrasado'
                            ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                          {item.status}
                        </span>
                      )}
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
                          {invoiceUrl && (
                            <a
                              href={invoiceUrl}
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
                    {!alreadyEmitted && alreadyPaid && (
                      <div className="mt-2 flex items-center space-x-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Status "{item.status}" — nenhuma cobrança nova a gerar</span>
                      </div>
                    )}
                    {!alreadyEmitted && !alreadyPaid && !hasKey && (
                      <div className="mt-2 flex items-center space-x-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Chave ASAAS não configurada para esta unidade (Bases &gt; Unidades)</span>
                      </div>
                    )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right">
                      <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                        R$ {item.valor.toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleGenerateCharge(item)}
                      disabled={loadingIds.has(item.id) || alreadyEmitted || alreadyPaid || !hasKey}
                      title={
                        alreadyPaid
                          ? `Status "${item.status}" — nenhuma cobrança nova a gerar`
                          : !hasKey
                          ? 'Configure a chave de API desta unidade em Bases > Unidades'
                          : undefined
                      }
                      className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                        alreadyEmitted
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 cursor-not-allowed'
                          : alreadyPaid || !hasKey
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {loadingIds.has(item.id) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{alreadyEmitted ? 'Cobrança Emitida' : alreadyPaid ? item.status : 'Gerar no ASAAS'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
