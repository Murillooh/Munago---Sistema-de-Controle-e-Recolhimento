import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Sparkles, Minimize2, Maximize2, Download, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { RecolhimentoItem, EstoqueItem, GoalSettings } from '../types';
import { exportToPDF, exportEstoqueToPDF } from '../utils/exportImport';

interface Message {
  role: 'user' | 'model';
  parts: [{ text: string }];
  // Presente só na resposta que gerou um PDF de verdade — vira botão de
  // download na bolha da mensagem em vez do usuário depender do download
  // automático do navegador (que às vezes é bloqueado) ou de um link falado.
  attachment?: { url: string; filename: string; label: string };
}

interface ChatAssistantProps {
  items: RecolhimentoItem[];
  estoqueItems: EstoqueItem[];
  goalSettings: GoalSettings;
  sessionToken: string | null;
}

// Manda um resumo em vez da lista inteira de lançamentos. Com a planilha
// carregada (centenas de linhas), o dump bruto vira uma requisição de
// dezenas de segundos pro Gemini — na Vercel (timeout de 10s no plano
// Hobby) isso simplesmente nunca responde e o chat parece quebrado.
function buildContextSummary(items: RecolhimentoItem[], goalSettings: GoalSettings) {
  const byStatus: Record<string, { count: number; total: number }> = {};
  for (const item of items) {
    const bucket = byStatus[item.status] || { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += item.valor || 0;
    byStatus[item.status] = bucket;
  }

  const parseVencimento = (v: string) => {
    const [d, m, y] = (v || '').split('/').map(Number);
    return d && m && y ? new Date(y, m - 1, d) : null;
  };

  const overdue = items
    .filter((i) => i.status === 'Atrasado')
    .sort((a, b) => (parseVencimento(a.vencimento)?.getTime() || 0) - (parseVencimento(b.vencimento)?.getTime() || 0))
    .slice(0, 8)
    .map((i) => ({ franquia: i.franquia, valor: i.valor, vencimento: i.vencimento }));

  const maioresPendentes = items
    .filter((i) => i.status === 'Aguardando pagamento')
    .sort((a, b) => (b.valor || 0) - (a.valor || 0))
    .slice(0, 8)
    .map((i) => ({ franquia: i.franquia, valor: i.valor, vencimento: i.vencimento }));

  return {
    totalRegistros: items.length,
    totalGeral: items.reduce((s, i) => s + (i.valor || 0), 0),
    porStatus: byStatus,
    exemplosAtrasados: overdue,
    maioresPendentes,
    metas: goalSettings,
  };
}

// Pedido de PDF vira geração de verdade na hora — reaproveita o mesmo PDF
// com logo e cabeçalho do botão "Exportar" da Planilha (jsPDF roda no
// navegador, então nem precisa passar pelo Gemini pra ISSO: mais rápido,
// sem custo, e o arquivo sai idêntico ao que o resto do sistema já gera).
//
// A INTENÇÃO (quantos itens, quais status, ordem, fração) é interpretada
// pelo servidor via IA (/api/chat/pdf-intent) em vez de regex fixo — regex
// nunca cobre "um item só", "metade", "os 3 menores atrasados" e toda
// variação que alguém pode digitar. Aqui só existe um gatilho leve e
// barato pra decidir SE vale a pena chamar aquele endpoint.
const ACTION_WORDS = /\b(ger[ae]|gerar|mand[ae]|mandar|quero|preciso|baix[ae]|baixar|export[ae]|exportar|cri[ae]|criar|envi[ae]|enviar|d[eê]\s*(pra|para)?\s*mim)\b/;
const REPORT_WORDS = /\b(relat[oó]rio|lista|planilha)\b/;

function wantsPdf(text: string): boolean {
  const t = text.toLowerCase();
  return /\bpdf\b/.test(t) || (ACTION_WORDS.test(t) && REPORT_WORDS.test(t));
}

// Pedido de PDF de estoque não passa pelo /api/chat/pdf-intent — esse
// endpoint só sabe interpretar o schema de Recolhimento. Aqui basta um
// gatilho de palavra-chave pra saber QUAL base usar, e um filtro simples
// (sobra/falta/divergência) sobre a diferença Vision x Físico.
const ESTOQUE_WORDS = /\b(estoque|invent[aá]rio|pe[çc]as?)\b/;

function wantsEstoque(text: string): boolean {
  return ESTOQUE_WORDS.test(text.toLowerCase());
}

type EstoqueFilter = 'todos' | 'sobras' | 'faltas' | 'divergentes';

function detectEstoqueFilter(text: string): EstoqueFilter {
  const t = text.toLowerCase();
  if (/\bsobr/.test(t)) return 'sobras';
  if (/\bfalt/.test(t)) return 'faltas';
  if (/diverg/.test(t)) return 'divergentes';
  return 'todos';
}

const ESTOQUE_FILTER_LABELS: Record<EstoqueFilter, string> = {
  todos: 'todos os itens',
  sobras: 'sobras',
  faltas: 'faltas',
  divergentes: 'divergências',
};

interface PdfIntent {
  status: RecolhimentoItem['status'] | null;
  limit: number | null;
  order: 'desc' | 'asc' | null;
  fraction: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  Confirmada: 'confirmados',
  Recebida: 'recebidos',
  'Aguardando pagamento': 'pendentes',
  Atrasado: 'atrasados',
};

// Atalhos exibidos na tela vazia do chat, antes da primeira mensagem — sem
// isso a tela fica só com o "Olá Murillo!" e ninguém sabe o que perguntar.
// Cobrem só os pedidos de PDF que o chat já resolve bem na hora (sem
// depender da IA acertar uma pergunta livre).
const SUGGESTIONS: string[] = [
  'Gerar PDF dos atrasados',
  'Gerar PDF dos recebidos',
  'PDF dos 10 maiores aguardando pagamento',
  'Gerar PDF dos confirmados',
  'PDF das divergências de estoque',
];

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ items, estoqueItems, goalSettings, sessionToken }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Web Speech API — nativa do navegador (Chrome/Edge), sem chave nem custo
  // nenhum. Firefox/Safari não suportam; o botão some sozinho nesse caso.
  const SpeechRecognitionAPI = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  const toggleRecording = () => {
    if (!SpeechRecognitionAPI) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Solta o microfone se o usuário fechar o chat com a gravação ainda ativa.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // Libera os blobs de PDF gerados quando o chat fecha de vez (componente desmonta).
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleSend = async (overrideText?: string) => {
    const promptText = overrideText ?? input;
    if (!promptText.trim() || isLoading) return;

    const prompt = promptText;
    const userMessage: Message = { role: 'user', parts: [{ text: prompt }] };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (wantsPdf(prompt) && wantsEstoque(prompt)) {
      try {
        const filterKind = detectEstoqueFilter(prompt);
        const diff = (i: EstoqueItem) => i.qtdFisico - i.qtdVision;
        let filtered = estoqueItems;
        if (filterKind === 'sobras') filtered = estoqueItems.filter((i) => diff(i) > 0);
        else if (filterKind === 'faltas') filtered = estoqueItems.filter((i) => diff(i) < 0);
        else if (filterKind === 'divergentes') filtered = estoqueItems.filter((i) => diff(i) !== 0);

        const label = ESTOQUE_FILTER_LABELS[filterKind];

        if (filtered.length === 0) {
          setMessages(prev => [...prev, {
            role: 'model',
            parts: [{ text: `Não achei nenhum item de estoque (${label}) pra colocar no PDF.` }],
          }]);
        } else {
          const filename = `relatorio_estoque_${filterKind}.pdf`;
          const blob = await exportEstoqueToPDF(filtered, filename, { returnBlob: true }, sessionToken) as Blob;
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.push(url);
          const valor = filtered.reduce((s, i) => s + i.custo * i.qtdFisico, 0);
          setMessages(prev => [...prev, {
            role: 'model',
            parts: [{ text: `Prontinho! Gerei o PDF de estoque (${label}) — **${filtered.length} item${filtered.length > 1 ? 's' : ''}**, R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.` }],
            attachment: { url, filename, label: `Baixar PDF (${label})` },
          }]);
        }
      } catch (err) {
        console.error('Estoque PDF generation error:', err);
        setMessages(prev => [...prev, { role: 'model', parts: [{ text: 'Deu ruim gerando o PDF de estoque. Tenta de novo?' }] }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (wantsPdf(prompt)) {
      try {
        // IA interpreta a intenção de verdade (quantidade, status, ordem,
        // fração) — cai pra "todos os registros" se o endpoint não
        // responder nada útil (banco/IA fora do ar), nunca trava o pedido.
        let intent: PdfIntent = { status: null, limit: null, order: null, fraction: null };
        try {
          const intentRes = await fetch('/api/chat/pdf-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: prompt }),
          });
          if (intentRes.ok) intent = { ...intent, ...(await intentRes.json()) };
        } catch {
          // segue com o fallback "todos os registros"
        }

        let filtered = intent.status ? items.filter((i) => i.status === intent.status) : items;

        if (intent.order) {
          filtered = [...filtered].sort((a, b) =>
            intent.order === 'desc' ? (b.valor || 0) - (a.valor || 0) : (a.valor || 0) - (b.valor || 0)
          );
        }

        let limit = intent.limit || undefined;
        if (!limit && intent.fraction) {
          limit = Math.max(1, Math.round(filtered.length * intent.fraction));
        }
        if (limit) filtered = filtered.slice(0, limit);

        const statusLabel = intent.status ? STATUS_LABELS[intent.status] : null;
        const parts = [statusLabel, limit ? `${limit} registro${limit > 1 ? 's' : ''}` : null, intent.order === 'desc' ? 'maiores valores' : intent.order === 'asc' ? 'menores valores' : null].filter(Boolean);
        const label = parts.length > 0 ? parts.join(', ') : 'todos os registros';

        if (filtered.length === 0) {
          setMessages(prev => [...prev, {
            role: 'model',
            parts: [{ text: `Não achei nenhum registro ${statusLabel || ''} pra colocar no PDF.` }],
          }]);
        } else {
          const filename = `relatorio_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.pdf`;
          const blob = await exportToPDF(filtered, filename, undefined, { returnBlob: true }, sessionToken) as Blob;
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.push(url);
          const total = filtered.reduce((s, i) => s + (i.valor || 0), 0);
          setMessages(prev => [...prev, {
            role: 'model',
            parts: [{ text: `Prontinho! Gerei o PDF (${label}) — **${filtered.length} registro${filtered.length > 1 ? 's' : ''}**, R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.` }],
            attachment: { url, filename, label: `Baixar PDF (${label})` },
          }]);
        }
      } catch (err) {
        console.error('PDF generation error:', err);
        setMessages(prev => [...prev, { role: 'model', parts: [{ text: 'Deu ruim gerando o PDF. Tenta de novo?' }] }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          history: messages,
          context: buildContextSummary(items, goalSettings)
        }),
      });

      if (!response.ok) throw new Error('Erro na comunicação com a IA');

      const data = await response.json();
      const modelMessage: Message = { role: 'model', parts: [{ text: data.text }] };
      setMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'model', 
        parts: [{ text: 'Desculpe, tive um problema técnico. Por favor, tente novamente em instantes.' }] 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: isMinimized ? '64px' : '500px'
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`mb-4 w-[350px] sm:w-[400px] rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] flex flex-col overflow-hidden transition-all duration-300 border border-white/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl`}
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white flex items-center justify-between shadow-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.12),transparent_60%)] pointer-events-none" />
              <div className="flex items-center space-x-2 relative z-10">
                <div className="p-1.5 bg-white/15 rounded-lg backdrop-blur-sm border border-white/10">
                  <Sparkles className="w-4 h-4 text-blue-100" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest">Inteligência Munago</h3>
                  <p className="text-[9px] text-blue-100/80 font-bold">Assistente LocGrupo</p>
                </div>
              </div>
              <div className="flex items-center space-x-1 relative z-10">
                <button 
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 dark:bg-slate-950/30"
                >
                  {messages.length === 0 && (
                    <div className="text-center py-8 space-y-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                        <Bot className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">Olá Murillo!</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 px-8">
                          Como posso ajudar você hoje? Posso analisar os recolhimentos, verificar metas ou dar recomendações estratégicas.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 px-3 pt-2">
                        {SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => handleSend(suggestion)}
                            disabled={isLoading}
                            className="px-3 py-2 bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 rounded-xl text-[9.5px] font-bold text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-sm hover:shadow-blue-500/10 transition-all duration-200 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`flex max-w-[85%] space-x-2 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          msg.role === 'user' ? 'bg-slate-200/80 dark:bg-slate-800' : 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm'
                        }`}>
                          {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-slate-600" /> : <Bot className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className={`p-3 rounded-2xl text-[11px] leading-relaxed ${
                          msg.role === 'user' 
                            ? 'bg-blue-600 text-white rounded-tr-sm shadow-md shadow-blue-600/20' 
                            : 'bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-100 dark:border-slate-700 shadow-sm'
                        }`}>
                          <div className={`markdown-body prose max-w-none prose-xs ${msg.role === 'user' ? 'prose-invert text-white' : 'prose-slate dark:prose-invert'}`}>
                            <ReactMarkdown>
                              {msg.parts[0].text}
                            </ReactMarkdown>
                          </div>
                          {msg.attachment && (
                            <a
                              href={msg.attachment.url}
                              download={msg.attachment.filename}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-[10px] font-black uppercase tracking-wide rounded-lg shadow-md shadow-blue-600/20 transition-all active:scale-95"
                            >
                              <Download className="w-3 h-3" />
                              {msg.attachment.label}
                            </a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex space-x-2 items-center bg-blue-50 dark:bg-blue-900/20 p-3 rounded-2xl rounded-tl-none border border-blue-100 dark:border-blue-900/30">
                        <div className="flex space-x-1">
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-blue-600 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-blue-600 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-blue-600 rounded-full" />
                        </div>
                        <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Processando...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-t border-white/40 dark:border-slate-800/60">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={isRecording ? 'Ouvindo...' : 'Pergunte qualquer coisa...'}
                      className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full py-3 pl-5 text-[11px] focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all outline-none text-slate-900 dark:text-white placeholder-slate-400 shadow-inner shadow-slate-100 dark:shadow-none ${SpeechRecognitionAPI ? 'pr-16' : 'pr-12'}`}
                    />
                    {SpeechRecognitionAPI && (
                      <button
                        onClick={toggleRecording}
                        title={isRecording ? 'Parar gravação' : 'Falar em vez de digitar'}
                        className={`absolute right-10 p-1.5 rounded-lg transition-all shadow-md active:scale-95 ${
                          isRecording
                            ? 'bg-rose-500 text-white animate-pulse'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                      >
                        {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => handleSend()}
                      disabled={!input.trim() || isLoading}
                      className="absolute right-2 p-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-full hover:from-blue-400 hover:to-indigo-500 disabled:opacity-50 transition-all shadow-md active:scale-95 flex items-center justify-center"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${
          isOpen ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 shadow-lg' : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-600/30'
        }`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        {!isOpen && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white dark:border-slate-950 rounded-full flex items-center justify-center glow-pulse"
          >
            <Sparkles className="w-2.5 h-2.5 text-white" />
          </motion.div>
        )}
      </motion.button>
    </div>
  );
};
