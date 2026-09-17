import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RecolhimentoItem, Unidade } from '../types';
import {
  ExternalLink,
  Send,
  Loader2,
  QrCode,
  Building2,
  ShieldAlert,
  ShieldCheck,
  Search,
  Zap,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Percent,
  Tag,
  Mail,
  Phone,
  MapPin,
  Clock,
  XCircle,
  Folder,
  FolderOpen,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { findUnidadeForItem, ASAAS_AUTO_IMPORT_INTERVAL_MS } from '../utils/unidades';

// Campos de cliente que o ASAAS aceita ao criar/cobrar (fora nome/CNPJ, que
// já vêm da franquia) — buscados do cadastro existente pra "Cobrança Avulsa"
// não sair faltando o que o ASAAS pede.
interface AsaasCustomerInfo {
  email: string;
  phone: string;
  mobilePhone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string;
  province: string;
}

interface AsaasIntegrationViewProps {
  items: RecolhimentoItem[];
  unidades: Unidade[];
  sessionToken: string | null;
  onUpdateItem: (item: RecolhimentoItem) => void;
  onAddItem: (item: RecolhimentoItem) => void;
  // Força na hora a mesma varredura que o ciclo automático de 90s faz —
  // pedido explícito pra não depender só de esperar o próximo ciclo pra
  // trazer boleto antigo lançado direto no ASAAS.
  onImportAsaasHistory: () => Promise<{ imported: number }>;
}

const onlyDigits = (v: string) => (v || '').replace(/\D/g, '');

type AsaasBillingType = 'PIX' | 'BOLETO' | 'UNDEFINED';
const BILLING_TYPE_KEY = 'munago_asaas_billing_type';
const BILLING_TYPE_OPTIONS: { value: AsaasBillingType; label: string }[] = [
  { value: 'PIX', label: 'Pix' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'UNDEFINED', label: 'Pix + Boleto' },
];

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// "2026-08-30" (input date) -> "30/08/2026" (formato usado no resto do sistema).
const isoToBr = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
};
const competenciaFromIso = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? '' : `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
};

// Hora em que o import automático trouxe a cobrança do ASAAS pro Munago —
// dd/mm às hh:mm, no fuso do navegador de quem está olhando a tela.
const formatImportedAt = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${data} às ${hora}`;
};

const EMPTY_AD_HOC_FORM = {
  unidadeId: '',
  // Cliente — pré-preenchido pela busca no ASAAS (customerLookup) quando já existe cadastro.
  email: '',
  phone: '',
  postalCode: '',
  address: '',
  addressNumber: '',
  complement: '',
  province: '',
  // Cobrança
  valor: '',
  vencimento: '',
  descricao: '',
  cCusto: '',
  externalReference: '',
  billingType: 'UNDEFINED' as AsaasBillingType,
  jurosAtivo: false,
  jurosPercent: '1',
  multaAtiva: false,
  multaPercent: '2',
  descontoAtivo: false,
  descontoValor: '',
  descontoDias: '3',
};

export const AsaasIntegrationView: React.FC<AsaasIntegrationViewProps> = ({ items, unidades, sessionToken, onUpdateItem, onAddItem, onImportAsaasHistory }) => {
  // Antes existia toggle Sandbox/Produção — pedido explícito do usuário pra
  // sempre ser real, sem alternância nenhuma (evita esquecer trocado e uma
  // cobrança de verdade cair como teste, ou vice-versa).
  const sandbox = false;

  // Rotas /api/asaas/* exigem sessão (requireAuth) — sem login, qualquer um
  // na internet podia gerar cobrança de verdade ou ler dado financeiro só
  // adivinhando um unidadeId.
  const asaasAuthHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  });

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

  // Cronômetro visual da próxima checagem automática de cobranças novas no
  // ASAAS (import feito em App.tsx, a cada ASAAS_AUTO_IMPORT_INTERVAL_MS) —
  // só de exibição, roda um intervalo próprio em vez de tentar sincronizar
  // com o timer real do App (não vale a pena o acoplamento pra um cronômetro).
  const [secondsUntilImportCheck, setSecondsUntilImportCheck] = useState(ASAAS_AUTO_IMPORT_INTERVAL_MS / 1000);
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsUntilImportCheck((s) => (s <= 1 ? ASAAS_AUTO_IMPORT_INTERVAL_MS / 1000 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  const importCountdownLabel = `${Math.floor(secondsUntilImportCheck / 60)}:${String(secondsUntilImportCheck % 60).padStart(2, '0')}`;

  const [importingHistory, setImportingHistory] = useState(false);
  const handleImportHistoryNow = async () => {
    setImportingHistory(true);
    try {
      const { imported } = await onImportAsaasHistory();
      if (imported > 0) {
        showNotice('success', 'Histórico importado', [
          `${imported} boleto${imported > 1 ? 's' : ''} do ASAAS que ainda não ${imported > 1 ? 'estavam' : 'estava'} no Munago entrou${imported > 1 ? 'ram' : ''} agora.`,
        ]);
      } else {
        showNotice('success', 'Nada novo pra importar', ['Todo o histórico das unidades com chave ASAAS já está no Munago.']);
      }
    } catch (err: any) {
      showNotice('error', 'Falha ao importar histórico do ASAAS', [err?.message || 'Tenta de novo em alguns segundos.']);
    } finally {
      setImportingHistory(false);
    }
  };

  // Notificação in-app no lugar do alert() nativo do navegador (feio, trava
  // a tela, corta mensagem longa) — usada pros erros de geração de cobrança.
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; title: string; lines: string[] } | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (type: 'error' | 'success', title: string, lines: string[] = []) => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    setNotice({ type, title, lines });
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 8000);
  };

  // Conjunto em vez de um id só — geração em lote dispara várias ao mesmo
  // tempo, cada botão precisa saber só se A SUA cobrança está em andamento.
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [generatedCharges, setGeneratedCharges] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Resolve a unidade (e sua chave de API) que corresponde a um lançamento —
  // por CNPJ, com fallback por nome da unidade x C. Custo (ver utils/unidades.ts).
  const findUnidade = (item: RecolhimentoItem) => findUnidadeForItem(unidades, item);

  // Ver o boleto sem sair do Munago — abre um preview embutido (iframe) em
  // vez de só linkar pro ASAAS numa aba nova. O ASAAS manda X-Frame-Options
  // nas próprias páginas (confirmado), então um iframe apontando direto pra
  // asaas.com sempre fica em branco, sem erro nenhum visível em JS — por
  // isso o PDF do boleto (bankSlipUrl) passa pelo proxy /api/asaas/boleto-pdf
  // (mesma origem do Munago, sem o header do ASAAS chegando ao navegador).
  // A página de fatura (invoiceUrl) é interativa — não dá pra proxyar sem
  // quebrar (scripts/relativos dela apontariam pro domínio errado), então
  // só entra como link "abrir no ASAAS" quando não existe boleto em PDF
  // (cobrança Pix pura, por exemplo).
  const [boletoViewer, setBoletoViewer] = useState<
    { title: string; loading: boolean; url?: string; fallbackUrl?: string; error?: string; noPdf?: boolean } | null
  >(null);

  const openBoletoViewer = async (item: RecolhimentoItem) => {
    const unidade = findUnidade(item);
    const fallback = item.asaasInvoiceUrl;
    if (!unidade?.hasAsaasKey || !item.asaasId) {
      if (fallback) window.open(fallback, '_blank', 'noreferrer');
      return;
    }
    setBoletoViewer({ title: item.franquia, loading: true, fallbackUrl: fallback });
    try {
      const res = await fetch('/api/asaas/get-payment-status', {
        method: 'POST',
        headers: asaasAuthHeaders(),
        body: JSON.stringify({ unidadeId: unidade.id, sandbox, paymentId: item.asaasId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBoletoViewer({ title: item.franquia, loading: false, error: data.error || 'Falha ao buscar o boleto no ASAAS.', fallbackUrl: fallback });
        return;
      }
      const invoiceUrl = data.invoiceUrl || fallback;
      if (data.bankSlipUrl) {
        setBoletoViewer({
          title: item.franquia,
          loading: false,
          url: `/api/asaas/boleto-pdf?url=${encodeURIComponent(data.bankSlipUrl)}&token=${encodeURIComponent(sessionToken || '')}`,
          fallbackUrl: invoiceUrl,
        });
      } else {
        setBoletoViewer({ title: item.franquia, loading: false, noPdf: true, fallbackUrl: invoiceUrl });
      }
    } catch {
      setBoletoViewer({ title: item.franquia, loading: false, error: 'Falha ao comunicar com a API do ASAAS.', fallbackUrl: fallback });
    }
  };

  // Devolve o motivo de erro em vez de já mostrar alert() — a geração em
  // lote precisa acumular os erros de vários itens numa mensagem só, não
  // interromper tudo no primeiro alert() como fazia o botão individual.
  const generateCharge = async (
    item: RecolhimentoItem,
    extra?: Partial<AsaasCustomerInfo> & { billingType?: AsaasBillingType; externalReference?: string; fine?: { value: number }; interest?: { value: number }; discount?: { value: number; dueDateLimitDays: number } }
  ): Promise<{ ok: true; invoiceUrl?: string } | { ok: false; error: string }> => {
    const unidade = findUnidade(item);
    if (!unidade?.hasAsaasKey) {
      return { ok: false, error: `${item.franquia}: sem chave ASAAS configurada (Bases > Unidades).` };
    }

    setLoadingIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch('/api/asaas/create-charge', {
        method: 'POST',
        headers: asaasAuthHeaders(),
        body: JSON.stringify({
          unidadeId: unidade.id,
          sandbox,
          billingType: extra?.billingType || billingType,
          chargeData: { ...item, ...extra },
        }),
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
        return { ok: true, invoiceUrl: data.invoiceUrl };
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
    if (result.ok === false) showNotice('error', 'Erro ao gerar cobrança no ASAAS', [result.error]);
  };

  // Cobrança avulsa: igual criar uma cobrança nova direto dentro do ASAAS
  // (escolhe o cliente, preenche valor/vencimento/descrição, gera) — sem
  // precisar já existir um lançamento pendente na Planilha antes.
  const [showAdHocModal, setShowAdHocModal] = useState(false);
  const [adHocStep, setAdHocStep] = useState<'cliente' | 'cobranca'>('cliente');
  const [adHocForm, setAdHocForm] = useState(EMPTY_AD_HOC_FORM);
  const [adHocGenerating, setAdHocGenerating] = useState(false);
  // Cadastro do cliente já existente no ASAAS pra essa franquia (CNPJ) —
  // 'idle' = nada buscado ainda, 'loading' = buscando, 'found'/'not-found' =
  // resultado da consulta. É o que garante que o boleto saia com e-mail/
  // telefone/endereço já cadastrados, sem faltar nada.
  const [customerLookup, setCustomerLookup] = useState<
    { status: 'idle' } | { status: 'loading' } | { status: 'found'; customer: AsaasCustomerInfo } | { status: 'not-found' } | { status: 'error'; error: string }
  >({ status: 'idle' });
  const [adHocResult, setAdHocResult] = useState<{ invoiceUrl?: string } | null>(null);

  const openAdHocModal = () => {
    setAdHocForm({ ...EMPTY_AD_HOC_FORM, billingType });
    setAdHocStep('cliente');
    setCustomerLookup({ status: 'idle' });
    setAdHocResult(null);
    setShowAdHocModal(true);
  };

  const adHocUnidade = unidades.find((u) => u.id === adHocForm.unidadeId);

  const handleAdHocUnidadeChange = async (unidadeId: string) => {
    const u = unidades.find((x) => x.id === unidadeId);
    setAdHocForm((prev) => ({
      ...prev,
      unidadeId,
      cCusto: u?.cCustoPadrao || prev.cCusto,
      // Limpa o que veio da franquia anterior — não faz sentido carregar
      // e-mail/endereço de outro cliente pra essa seleção nova.
      email: '',
      phone: '',
      postalCode: '',
      address: '',
      addressNumber: '',
      complement: '',
      province: '',
    }));
    setAdHocResult(null);

    if (!u?.hasAsaasKey || !u.cnpj) {
      setCustomerLookup({ status: 'idle' });
      return;
    }
    setCustomerLookup({ status: 'loading' });
    try {
      const res = await fetch('/api/asaas/customer-lookup', {
        method: 'POST',
        headers: asaasAuthHeaders(),
        body: JSON.stringify({ unidadeId: u.id, sandbox, cnpj: u.cnpj }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCustomerLookup({ status: 'error', error: data.error || 'Falha ao consultar cliente no ASAAS.' });
        return;
      }
      if (data.found) {
        setCustomerLookup({ status: 'found', customer: data.customer });
        // Pré-preenche com o que já existe no ASAAS — o objetivo de puxar o
        // cadastro é justamente não deixar faltar nada na hora de gerar.
        setAdHocForm((prev) => ({
          ...prev,
          email: data.customer.email || '',
          phone: data.customer.mobilePhone || data.customer.phone || '',
          postalCode: data.customer.postalCode || '',
          address: data.customer.address || '',
          addressNumber: data.customer.addressNumber || '',
          complement: data.customer.complement || '',
          province: data.customer.province || '',
        }));
      } else {
        setCustomerLookup({ status: 'not-found' });
      }
    } catch {
      setCustomerLookup({ status: 'error', error: 'Falha ao comunicar com a API do ASAAS.' });
    }
  };

  const handleGenerateAdHoc = async () => {
    if (!adHocUnidade || !adHocForm.valor || !adHocForm.vencimento) return;

    // O lançamento entra na Planilha ANTES de chamar o ASAAS — generateCharge
    // atualiza o item pelo id via onUpdateItem, que só acha algo que já
    // exista na lista. Se a cobrança falhar, o lançamento continua lá como
    // "Aguardando pagamento" normal, pronto pra tentar gerar de novo na lista.
    const newItem: RecolhimentoItem = {
      id: `item-${Date.now()}`,
      franquia: adHocUnidade.nome,
      cnpj: adHocUnidade.cnpj,
      cCusto: adHocForm.cCusto || adHocUnidade.cCustoPadrao || '',
      dataCriacao: new Date().toLocaleDateString('pt-BR'),
      vencimento: isoToBr(adHocForm.vencimento),
      vencimentoOriginal: isoToBr(adHocForm.vencimento),
      dataPagamento: '',
      valor: Number(adHocForm.valor) || 0,
      status: 'Aguardando pagamento',
      competenciaRecolhimento: competenciaFromIso(adHocForm.vencimento),
      competenciaPagamento: '',
      descricao: adHocForm.descricao || `Cobrança avulsa - ${adHocUnidade.nome}`,
    };

    setAdHocGenerating(true);
    try {
      onAddItem(newItem);
      // O servidor já busca o cliente por CNPJ e reaproveita cadastro
      // existente no ASAAS; os campos de contato abaixo só são usados de
      // verdade quando o cliente ainda não existe lá (customerLookup
      // 'not-found') — é o que garante que a criação não saia faltando nada.
      const result = await generateCharge(newItem, {
        email: adHocForm.email || undefined,
        phone: adHocForm.phone || undefined,
        postalCode: adHocForm.postalCode || undefined,
        address: adHocForm.address || undefined,
        addressNumber: adHocForm.addressNumber || undefined,
        complement: adHocForm.complement || undefined,
        province: adHocForm.province || undefined,
        billingType: adHocForm.billingType,
        externalReference: adHocForm.externalReference || undefined,
        fine: adHocForm.multaAtiva && Number(adHocForm.multaPercent) > 0 ? { value: Number(adHocForm.multaPercent) } : undefined,
        interest: adHocForm.jurosAtivo && Number(adHocForm.jurosPercent) > 0 ? { value: Number(adHocForm.jurosPercent) } : undefined,
        discount:
          adHocForm.descontoAtivo && Number(adHocForm.descontoValor) > 0
            ? { value: Number(adHocForm.descontoValor), dueDateLimitDays: Number(adHocForm.descontoDias) || 0 }
            : undefined,
      });
      if (result.ok === false) {
        showNotice('error', 'Lançamento adicionado, mas a cobrança falhou', [
          result.error,
          'Pode tentar gerar de novo na lista abaixo.',
        ]);
        setShowAdHocModal(false);
      } else {
        setAdHocResult({ invoiceUrl: result.invoiceUrl });
      }
    } finally {
      setAdHocGenerating(false);
    }
  };

  // Recebida/Confirmada já foi paga — não faz sentido gerar cobrança nova.
  const isBillableStatus = (status: string) => status === 'Aguardando pagamento' || status === 'Atrasado';

  // "Pastas" por unidade (Canindé, Barueri, Limão, Zona Sul...) — mesmo
  // critério de match usado pra achar a chave ASAAS (CNPJ, com fallback por
  // C. Custo). Lançamento que não bate com nenhuma unidade cai na pasta
  // "Sem unidade" em vez de sumir da visão por pasta.
  const folderGroups = useMemo(() => {
    const groups = unidades.map((u) => ({
      id: u.id,
      label: u.nome,
      items: items.filter((i) => findUnidadeForItem(unidades, i)?.id === u.id),
    }));
    const semUnidade = items.filter((i) => !findUnidadeForItem(unidades, i));
    if (semUnidade.length > 0) {
      groups.push({ id: '__sem_unidade__', label: 'Sem unidade', items: semUnidade });
    }
    return groups;
  }, [items, unidades]);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const selectedFolderLabel = folderGroups.find((g) => g.id === selectedFolder)?.label;

  // Fonte de itens depois de aplicar a pasta selecionada (antes da busca) —
  // null = todas as pastas juntas, comportamento de antes.
  const folderItems = useMemo(() => {
    if (!selectedFolder) return items;
    return folderGroups.find((g) => g.id === selectedFolder)?.items || [];
  }, [items, folderGroups, selectedFolder]);

  // Aguardando pagamento + Atrasado — as duas ainda precisam de boleto/Pix.
  // Antes só contava "Aguardando pagamento" aqui; se todos os pendentes de
  // uma unidade estivessem "Atrasado" (contado nas pastas via isBillableStatus),
  // o card da pasta mostrava N pendentes mas a lista abaixo vinha vazia.
  const pendingItems = folderItems.filter((i) => isBillableStatus(i.status));

  // Sem busca, mostra só quem realmente precisa de cobrança (visão padrão,
  // sem poluir com franquias já pagas). Com busca, procura em TODOS os
  // status — sem isso não dava pra achar uma franquia já confirmada só pra
  // conferir.
  // Busca global: qualquer campo visível no card bate — franquia, CNPJ,
  // C.Custo, status, competência ou vencimento. Antes só achava por
  // franquia/CNPJ; com 300+ lançamentos, procurar por "CANINDÉ" ou
  // "atrasado" ou "ago/26" direto é bem mais rápido que rolar a lista.
  const filteredPendingItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendingItems;
    const qDigits = onlyDigits(q);
    return folderItems.filter((i) => {
      if (i.franquia.toLowerCase().includes(q)) return true;
      if (qDigits && onlyDigits(i.cnpj).includes(qDigits)) return true;
      return [i.cCusto, i.status, i.competenciaRecolhimento, i.competenciaPagamento, i.vencimento, i.descricao]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q));
    });
  }, [folderItems, pendingItems, search]);

  // Só entra na seleção/lote quem realmente pode ser gerado agora — item já
  // emitido, sem chave de unidade, ou já pago não tem o que fazer num "gerar em lote".
  const billableItems = filteredPendingItems.filter(
    (i) => !i.asaasId && Boolean(findUnidade(i)?.hasAsaasKey) && isBillableStatus(i.status)
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
        showNotice(
          'error',
          `${targets.length - failures.length} de ${targets.length} cobranças geradas`,
          failures.map((f) => f.error)
        );
      } else {
        showNotice('success', `${targets.length} cobrança${targets.length > 1 ? 's' : ''} gerada${targets.length > 1 ? 's' : ''} com sucesso`);
      }
    } finally {
      setBulkGenerating(false);
    }
  };

  return (
    <div className="w-full space-y-6 pb-12">
      {notice && (
        <div className="fixed top-6 right-6 z-[200] w-full max-w-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className={`rounded-2xl shadow-2xl border p-4 flex items-start gap-3 ${
            notice.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-200'
              : 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200'
          }`}>
            {notice.type === 'error' ? (
              <XCircle className="w-5 h-5 shrink-0 text-rose-500" />
            ) : (
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug">{notice.title}</p>
              {notice.lines.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {notice.lines.map((line, idx) => (
                    <li key={idx} className="text-xs leading-relaxed opacity-90">{line}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setNotice(null)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header Banner — compacto: tudo numa linha só, sem o card de aviso
          repetido embaixo (o selo "Produção (real)" já avisa isso sempre,
          já que não existe mais alternância de ambiente). */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 rounded-2xl px-5 py-3.5 text-white shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-200 border border-emerald-400/30 shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold leading-tight truncate">Cobranças e Pagamentos via ASAAS</h2>
            <p className="text-emerald-200/80 text-[10px] truncate">Chave por unidade (Bases &gt; Unidades) • Integração Bancária Oficial</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <span
            title="Toda cobrança gerada aqui é real, com dinheiro de verdade envolvido"
            className="flex items-center gap-1.5 bg-rose-500/90 px-2.5 py-1 rounded-full"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white">Produção (real)</span>
          </span>

          <span
            className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded-full"
            title="Verificação automática de cobranças novas lançadas direto no ASAAS"
          >
            <Clock className="w-3 h-3 text-white/70" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/90">{importCountdownLabel}</span>
          </span>

          <button
            type="button"
            onClick={handleImportHistoryNow}
            disabled={importingHistory}
            title="Busca agora, na hora, todo o histórico de boletos do ASAAS (sem esperar o ciclo automático de 90s)"
            className="flex items-center gap-1.5 bg-black/20 hover:bg-black/30 disabled:opacity-60 px-2.5 py-1 rounded-full transition-colors"
          >
            {importingHistory ? (
              <Loader2 className="w-3 h-3 text-white/90 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 text-white/90" />
            )}
            <span className="text-[9px] font-black uppercase tracking-widest text-white/90">
              {importingHistory ? 'Importando...' : 'Importar histórico'}
            </span>
          </button>

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

      {/* Pastas por unidade — clica pra ver só os boletos daquela franquia/região */}
      {folderGroups.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pastas por unidade</h3>
            {selectedFolder && (
              <button
                onClick={() => setSelectedFolder(null)}
                className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:underline"
              >
                Ver todas
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {folderGroups.map((group) => {
              const isSelected = selectedFolder === group.id;
              const valorTotal = group.items.reduce((s, i) => s + (i.valor || 0), 0);
              const pendentesCount = group.items.filter((i) => isBillableStatus(i.status)).length;
              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedFolder(isSelected ? null : group.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                    isSelected
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-300 dark:hover:border-emerald-700'
                  }`}
                >
                  {isSelected ? <FolderOpen className="w-5 h-5 shrink-0" /> : <Folder className="w-5 h-5 shrink-0 text-amber-500" />}
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{group.label}</p>
                    <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'}`}>
                      {group.items.length} boleto{group.items.length !== 1 ? 's' : ''} • R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      {pendentesCount > 0 ? ` • ${pendentesCount} pendente${pendentesCount !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Items for ASAAS Billing */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Gerar Cobranças Pix / Boleto (ASAAS){selectedFolderLabel ? ` — ${selectedFolderLabel}` : ''}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedFolderLabel
                ? `Mostrando só os boletos da pasta "${selectedFolderLabel}".`
                : 'Selecione uma ou várias franquias pendentes para emitir cobrança via API do ASAAS.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-bold px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800/50">
              {pendingItems.length} Pendentes
            </span>
            <button
              onClick={openAdHocModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Cobrança</span>
            </button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-slate-50/50 dark:bg-slate-800/30">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por franquia, CNPJ, C.Custo, status, competência ou vencimento..."
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
                ? `Nenhuma franquia encontrada para "${search}"${selectedFolderLabel ? ` na pasta "${selectedFolderLabel}"` : ''}.`
                : selectedFolderLabel
                ? `Nenhum boleto na pasta "${selectedFolderLabel}" no momento.`
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
              const hasKey = Boolean(unidade?.hasAsaasKey);
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
                      {item.asaasImportedAt && (
                        <span
                          title="Hora em que o import automático trouxe essa cobrança do ASAAS pro Munago"
                          className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          Puxado às {formatImportedAt(item.asaasImportedAt)}
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
                          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-0.5">
                            <button
                              type="button"
                              onClick={() => openBoletoViewer(item)}
                              className="text-emerald-700 dark:text-emerald-300 hover:underline flex items-center space-x-1 font-bold"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Ver Boleto</span>
                            </button>
                            {invoiceUrl && (
                              <a
                                href={invoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                              >
                                <span>Abrir Link da Fatura Pix/Boleto</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
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

      {showAdHocModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">Nova Cobrança Avulsa</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Cria o lançamento na Planilha e gera a cobrança no ASAAS na hora — igual criar direto no ASAAS.</p>
                </div>
                <button onClick={() => setShowAdHocModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!adHocResult && (
                <div className="flex items-center gap-2 mt-4">
                  {([['cliente', '1. Cliente'], ['cobranca', '2. Cobrança']] as const).map(([step, label]) => (
                    <div
                      key={step}
                      className={`flex-1 h-1.5 rounded-full transition-colors ${
                        adHocStep === step || (step === 'cliente' && adHocStep === 'cobranca')
                          ? 'bg-emerald-500'
                          : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                      title={label}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
            {adHocResult ? (
              <>
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Cobrança gerada no ASAAS</p>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                      Lançamento criado na Planilha. Abra a fatura pra conferir o boleto/Pix antes de enviar pro cliente.
                    </p>
                  </div>
                </div>

                {adHocResult.invoiceUrl && (
                  <a
                    href={adHocResult.invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-600 text-white font-black rounded-xl text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 uppercase tracking-widest"
                  >
                    <span>Abrir Fatura no ASAAS</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setShowAdHocModal(false)}
                  className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Concluir
                </button>
              </>
            ) : adHocStep === 'cliente' ? (
              <>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Franquia (Unidade)</label>
                  <select
                    value={adHocForm.unidadeId}
                    onChange={(e) => handleAdHocUnidadeChange(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  >
                    <option value="">Selecione a franquia...</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                  {adHocUnidade && (
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">{adHocUnidade.cnpj || 'sem CNPJ cadastrado'}</p>
                  )}
                  {adHocUnidade && !adHocUnidade.hasAsaasKey && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1">Sem chave ASAAS configurada para esta unidade (Bases &gt; Unidades).</p>
                  )}

                  {customerLookup.status === 'loading' && (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Consultando cadastro do cliente no ASAAS...</span>
                    </div>
                  )}
                  {customerLookup.status === 'found' && (
                    <div className="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-[10px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <p className="font-bold">Cliente já cadastrado no ASAAS — dados abaixo vieram de lá. Pra mudar, edite direto no ASAAS.</p>
                    </div>
                  )}
                  {customerLookup.status === 'not-found' && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>Nenhum cadastro encontrado — preencha abaixo pra criar o cliente no ASAAS.</span>
                    </div>
                  )}
                  {customerLookup.status === 'error' && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>{customerLookup.error}</span>
                    </div>
                  )}
                </div>

                {(() => {
                  const readOnly = customerLookup.status === 'found';
                  const fieldsDisabled = !adHocUnidade || customerLookup.status === 'loading';
                  const inputCls = `w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none disabled:opacity-50 ${readOnly ? 'text-slate-500 dark:text-slate-400' : ''}`;
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">E-mail</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="email"
                              value={adHocForm.email}
                              disabled={fieldsDisabled || readOnly}
                              onChange={(e) => setAdHocForm({ ...adHocForm, email: e.target.value })}
                              className={inputCls}
                              placeholder="financeiro@franquia.com.br"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Telefone</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="text"
                              value={adHocForm.phone}
                              disabled={fieldsDisabled || readOnly}
                              onChange={(e) => setAdHocForm({ ...adHocForm, phone: e.target.value })}
                              className={inputCls}
                              placeholder="(00) 00000-0000"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">CEP</label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="text"
                              value={adHocForm.postalCode}
                              disabled={fieldsDisabled || readOnly}
                              onChange={(e) => setAdHocForm({ ...adHocForm, postalCode: e.target.value })}
                              className={inputCls}
                              placeholder="00000-000"
                            />
                          </div>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Bairro</label>
                          <input
                            type="text"
                            value={adHocForm.province}
                            disabled={fieldsDisabled || readOnly}
                            onChange={(e) => setAdHocForm({ ...adHocForm, province: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none disabled:opacity-50"
                            placeholder="Ex: Centro"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Endereço</label>
                          <input
                            type="text"
                            value={adHocForm.address}
                            disabled={fieldsDisabled || readOnly}
                            onChange={(e) => setAdHocForm({ ...adHocForm, address: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none disabled:opacity-50"
                            placeholder="Ex: Rua das Franquias"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Número</label>
                          <input
                            type="text"
                            value={adHocForm.addressNumber}
                            disabled={fieldsDisabled || readOnly}
                            onChange={(e) => setAdHocForm({ ...adHocForm, addressNumber: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none disabled:opacity-50"
                            placeholder="s/n"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Complemento</label>
                        <input
                          type="text"
                          value={adHocForm.complement}
                          disabled={fieldsDisabled || readOnly}
                          onChange={(e) => setAdHocForm({ ...adHocForm, complement: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none disabled:opacity-50"
                          placeholder="Sala, bloco, referência..."
                        />
                      </div>
                    </>
                  );
                })()}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdHocModal(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!adHocUnidade || !adHocUnidade.hasAsaasKey || customerLookup.status === 'loading'}
                    onClick={() => setAdHocStep('cobranca')}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-black rounded-xl text-xs hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-600/20 uppercase tracking-widest flex items-center justify-center space-x-2"
                  >
                    <span>Próximo: Cobrança</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tipo de cobrança</label>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                    {BILLING_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAdHocForm({ ...adHocForm, billingType: opt.value })}
                        className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                          adHocForm.billingType === opt.value
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Valor (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={adHocForm.valor}
                      onChange={(e) => setAdHocForm({ ...adHocForm, valor: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Vencimento</label>
                    <input
                      type="date"
                      value={adHocForm.vencimento}
                      onChange={(e) => setAdHocForm({ ...adHocForm, vencimento: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">C. Custo</label>
                    <input
                      type="text"
                      value={adHocForm.cCusto}
                      onChange={(e) => setAdHocForm({ ...adHocForm, cCusto: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="Ex: CANINDÉ"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Referência externa</label>
                    <input
                      type="text"
                      value={adHocForm.externalReference}
                      onChange={(e) => setAdHocForm({ ...adHocForm, externalReference: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="Nº do pedido (opcional)"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Descrição</label>
                  <input
                    type="text"
                    value={adHocForm.descricao}
                    onChange={(e) => setAdHocForm({ ...adHocForm, descricao: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                    placeholder="Ex: PAGAMENTO REF AO RECOLHIMENTO DE SETEMBRO 2026"
                  />
                </div>

                {/* Juros e multa — opcional, igual a seção equivalente do ASAAS na criação de cobrança. */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <label className="flex items-center justify-between gap-3 p-3.5 cursor-pointer bg-slate-50 dark:bg-slate-800/50">
                    <span className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <Percent className="w-3.5 h-3.5 text-slate-400" />
                      Juros e multa por atraso
                    </span>
                    <input
                      type="checkbox"
                      checked={adHocForm.jurosAtivo && adHocForm.multaAtiva}
                      onChange={(e) => setAdHocForm({ ...adHocForm, jurosAtivo: e.target.checked, multaAtiva: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 shrink-0 bg-slate-300 dark:bg-slate-700 peer-checked:bg-emerald-600 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
                  </label>
                  {adHocForm.jurosAtivo && adHocForm.multaAtiva && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 border-t border-slate-200 dark:border-slate-700">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Multa (%)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={adHocForm.multaPercent}
                          onChange={(e) => setAdHocForm({ ...adHocForm, multaPercent: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Juros ao mês (%)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={adHocForm.jurosPercent}
                          onChange={(e) => setAdHocForm({ ...adHocForm, jurosPercent: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Desconto por antecipação — opcional. */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <label className="flex items-center justify-between gap-3 p-3.5 cursor-pointer bg-slate-50 dark:bg-slate-800/50">
                    <span className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <Tag className="w-3.5 h-3.5 text-slate-400" />
                      Desconto por antecipação
                    </span>
                    <input
                      type="checkbox"
                      checked={adHocForm.descontoAtivo}
                      onChange={(e) => setAdHocForm({ ...adHocForm, descontoAtivo: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 shrink-0 bg-slate-300 dark:bg-slate-700 peer-checked:bg-emerald-600 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
                  </label>
                  {adHocForm.descontoAtivo && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 border-t border-slate-200 dark:border-slate-700">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Desconto (%)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={adHocForm.descontoValor}
                          onChange={(e) => setAdHocForm({ ...adHocForm, descontoValor: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Dias antes do vencimento</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={adHocForm.descontoDias}
                          onChange={(e) => setAdHocForm({ ...adHocForm, descontoDias: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAdHocStep('cliente')}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1.5"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Voltar</span>
                  </button>
                  <button
                    type="button"
                    disabled={adHocGenerating || !adHocForm.valor || !adHocForm.vencimento}
                    onClick={handleGenerateAdHoc}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-black rounded-xl text-xs hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-600/20 uppercase tracking-widest flex items-center justify-center space-x-2"
                  >
                    {adHocGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{adHocGenerating ? 'Gerando...' : 'Gerar no ASAAS'}</span>
                  </button>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {boletoViewer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[92vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">Boleto — {boletoViewer.title}</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Direto do ASAAS, sem sair do Munago.</p>
              </div>
              <button onClick={() => setBoletoViewer(null)} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-950 relative">
              {boletoViewer.loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs font-semibold">Buscando o boleto no ASAAS...</span>
                </div>
              ) : boletoViewer.error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                  <ShieldAlert className="w-6 h-6 text-rose-500" />
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{boletoViewer.error}</p>
                  {boletoViewer.fallbackUrl && (
                    <a href={boletoViewer.fallbackUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-1">
                      <span>Abrir no ASAAS mesmo assim</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : boletoViewer.url ? (
                <iframe src={boletoViewer.url} title={`Boleto — ${boletoViewer.title}`} className="w-full h-full border-0" />
              ) : boletoViewer.noPdf ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 text-slate-400 dark:text-slate-500">
                  <QrCode className="w-6 h-6" />
                  <p className="text-xs font-bold">Essa cobrança é só Pix — sem PDF de boleto pra mostrar aqui.</p>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                  Boleto ainda não disponível pra essa cobrança.
                </div>
              )}
            </div>

            {!boletoViewer.loading && boletoViewer.fallbackUrl && (
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/50">
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  {boletoViewer.noPdf ? 'Abra a fatura no ASAAS pra ver o QR Code Pix.' : 'Não carregou? O ASAAS pode bloquear a exibição embutida.'}
                </p>
                <a
                  href={boletoViewer.fallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-[11px] font-bold hover:opacity-90 transition-opacity"
                >
                  <span>Abrir em nova aba</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
