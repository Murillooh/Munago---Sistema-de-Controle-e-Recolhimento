import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Sparkles, Minimize2, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { RecolhimentoItem, GoalSettings } from '../types';
import { exportToPDF } from '../utils/exportImport';

interface Message {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

interface ChatAssistantProps {
  items: RecolhimentoItem[];
  goalSettings: GoalSettings;
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
// navegador, então nem precisa passar pelo Gemini pra isso: mais rápido,
// sem custo, e o arquivo sai idêntico ao que o resto do sistema já gera).
const PDF_SCOPES: { match: RegExp; status: RecolhimentoItem['status'] | null; label: string }[] = [
  { match: /atrasad/, status: 'Atrasado', label: 'atrasados' },
  { match: /pendent|aguardand/, status: 'Aguardando pagamento', label: 'pendentes' },
  { match: /recebid/, status: 'Recebida', label: 'recebidos' },
  { match: /confirmad/, status: 'Confirmada', label: 'confirmados' },
];

function detectPdfRequest(text: string) {
  const t = text.toLowerCase();
  if (!/\bpdf\b/.test(t)) return null;
  const scope = PDF_SCOPES.find((s) => s.match.test(t));
  return scope || { match: /.*/, status: null, label: 'de todos os registros' };
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ items, goalSettings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const prompt = input;
    const userMessage: Message = { role: 'user', parts: [{ text: prompt }] };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const pdfRequest = detectPdfRequest(prompt);
    if (pdfRequest) {
      try {
        const filtered = pdfRequest.status ? items.filter((i) => i.status === pdfRequest.status) : items;
        if (filtered.length === 0) {
          setMessages(prev => [...prev, {
            role: 'model',
            parts: [{ text: `Não achei nenhum registro ${pdfRequest.label} pra colocar no PDF.` }],
          }]);
        } else {
          await exportToPDF(filtered);
          const total = filtered.reduce((s, i) => s + (i.valor || 0), 0);
          setMessages(prev => [...prev, {
            role: 'model',
            parts: [{ text: `Prontinho! Gerei o PDF ${pdfRequest.label} — **${filtered.length} registro${filtered.length > 1 ? 's' : ''}**, R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. O download deve ter começado já.` }],
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
            className={`mb-4 w-[350px] sm:w-[400px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-300`}
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <Sparkles className="w-4 h-4 text-blue-100" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest">Inteligência Munago</h3>
                  <p className="text-[9px] text-blue-100 font-bold opacity-80">Assistente LocGrupo</p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
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
                  className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/50"
                >
                  {messages.length === 0 && (
                    <div className="text-center py-8 space-y-3">
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
                        <Bot className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">Olá Murillo!</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 px-8">
                          Como posso ajudar você hoje? Posso analisar os recolhimentos, verificar metas ou dar recomendações estratégicas.
                        </p>
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
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          msg.role === 'user' ? 'bg-slate-200 dark:bg-slate-800' : 'bg-blue-600'
                        }`}>
                          {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-slate-600" /> : <Bot className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className={`p-3 rounded-2xl text-[11px] leading-relaxed shadow-sm ${
                          msg.role === 'user' 
                            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tr-none' 
                            : 'bg-blue-50 dark:bg-blue-900/20 text-slate-800 dark:text-slate-200 rounded-tl-none border border-blue-100 dark:border-blue-900/30'
                        }`}>
                          <div className="markdown-body prose prose-slate dark:prose-invert max-w-none prose-xs">
                            <ReactMarkdown>
                              {msg.parts[0].text}
                            </ReactMarkdown>
                          </div>
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
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Pergunte qualquer coisa..."
                      className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl py-2.5 pl-4 pr-10 text-[11px] focus:ring-2 focus:ring-blue-500 transition-all outline-none text-slate-900 dark:text-white"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className="absolute right-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md active:scale-95"
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
          isOpen ? 'bg-slate-100 dark:bg-slate-800 text-slate-600' : 'bg-blue-600 text-white'
        }`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        {!isOpen && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white dark:border-slate-950 rounded-full flex items-center justify-center"
          >
            <Sparkles className="w-2.5 h-2.5 text-white" />
          </motion.div>
        )}
      </motion.button>
    </div>
  );
};
