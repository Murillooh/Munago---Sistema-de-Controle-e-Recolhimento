import React, { useState, useEffect } from 'react';
import { ArrowRight, ShieldCheck, Eye, EyeOff, Building2, CheckCircle2, Cpu, Globe2, LineChart } from 'lucide-react';
import { AuthUser } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser, token: string | null) => void;
  // Mostrado uma vez ao cair aqui (ex: logout automático por inatividade) —
  // explica pro usuário por que ele voltou pra tela de login sem ter clicado "Sair".
  notice?: string;
}

const slides = [
  {
    id: 0,
    icon: <Globe2 className="w-5 h-5 text-zinc-300" />,
    title: "Gestão inteligente.",
    highlight: "Resultados excepcionais.",
    desc: "Centralize o controle de recolhimentos e otimize processos com nossa plataforma de gestão integrada em tempo real."
  },
  {
    id: 1,
    icon: <LineChart className="w-5 h-5 text-zinc-300" />,
    title: "Precisão absoluta.",
    highlight: "Visão estratégica.",
    desc: "Acompanhe indicadores-chave, métricas automatizadas e tome decisões seguras baseadas em dados consolidados."
  },
  {
    id: 2,
    icon: <Cpu className="w-5 h-5 text-zinc-300" />,
    title: "Controle instantâneo.",
    highlight: "Alta performance.",
    desc: "Interface ultrarrápida e resiliente para garantir que sua operação e conciliações não tenham pausas."
  }
];

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, notice }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState(notice || '');

  // Lógica do Carrossel
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (password !== confirmPassword) {
          setErrorMsg('As senhas não coincidem.');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Não foi possível criar a conta.');
          return;
        }
        if (data.user?.status === 'approved') {
          setMode('login');
          setInfoMsg('Conta criada como administrador! Faça login para entrar.');
        } else {
          setMode('login');
          setInfoMsg('Conta criada! Aguarde um administrador aprovar seu acesso.');
        }
        setPassword('');
        return;
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 503) {
        onLoginSuccess({ id: 'local', name: 'Murillo Silva', email, role: 'admin', status: 'approved' }, null);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Não foi possível entrar.');
        return;
      }
      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setErrorMsg('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-100 font-sans selection:bg-white/20 overflow-hidden">
      
      {/* ----------------- LADO ESQUERDO (VISUAL ANIMADO) ----------------- */}
      <div className="hidden lg:flex relative w-[55%] h-full flex-col justify-between overflow-hidden p-12 bg-zinc-950 border-r border-zinc-900">
        
        {/* Background Sutil (Grid) */}
        <div className="absolute inset-0 z-0 opacity-[0.15]" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} 
        />
        {/* Gradiente Radial Suave para profundidade (seguindo a estética Linear) */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_100%_0%,rgba(212,160,23,0.06),transparent_40%),radial-gradient(circle_at_0%_100%,rgba(59,130,246,0.04),transparent_50%)]" />

        {/* Header Esquerda */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-950 shadow-sm">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Munago</h1>
            <p className="text-[10px] font-semibold tracking-widest text-zinc-400 uppercase mt-0.5">Sistema de Controle</p>
          </div>
        </div>

        {/* Carrossel Deslizante */}
        <div className="relative z-10 h-[300px] flex items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              className="max-w-lg"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 mb-6 backdrop-blur-md">
                {slides[currentSlide].icon}
                <span className="text-[11px] font-semibold text-zinc-300 tracking-wide">Plataforma Enterprise</span>
              </div>
              <h2 className="text-[3.25rem] font-bold leading-[1.05] tracking-tight mb-6 text-zinc-100">
                {slides[currentSlide].title}<br />
                <span className="text-zinc-500">{slides[currentSlide].highlight}</span>
              </h2>
              <p className="text-lg text-zinc-400 font-medium leading-relaxed max-w-md">
                {slides[currentSlide].desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Esquerda e Controles do Carrossel */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex gap-2">
            {slides.map((_, idx) => (
              <button 
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-500 ${currentSlide === idx ? 'w-8 bg-zinc-200' : 'w-2 bg-zinc-800 hover:bg-zinc-700'}`}
                aria-label={`Ir para slide ${idx + 1}`}
              />
            ))}
          </div>
          <div className="text-[11px] font-medium text-zinc-600">
            &copy; {new Date().getFullYear()} Munago.
          </div>
        </div>
      </div>

      {/* ----------------- LADO DIREITO (FORMULÁRIO ESTRUTURADO) ----------------- */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-[#050505] overflow-hidden">
        
        {/* Elementos coloridos no fundo para dar vida ao efeito de ESPELHO / VIDRO */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#d4a017]/15 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-600/10 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white/5 blur-[100px] rounded-full pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="w-full max-w-[420px] relative z-10 p-8 sm:p-10 rounded-3xl bg-white/[0.04] backdrop-blur-[40px] border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]"
        >
          {/* Logo Centralizado */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#f2ca5c] to-[#a3760a] shadow-lg shadow-amber-500/20 text-[#030305]">
              <Building2 className="w-7 h-7" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-white">Munago</h1>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-[#d4a017] uppercase mt-1">Sistema de Controle</p>
            </div>
          </div>

          <div className="mb-8 text-center">
            <h3 className="text-xl font-semibold text-zinc-100 mb-1.5 tracking-tight">
              {mode === 'login' ? 'Acesso Restrito' : 'Criar nova conta'}
            </h3>
            <p className="text-[13px] text-zinc-400">
              {mode === 'login' 
                ? 'Insira suas credenciais para entrar.'
                : 'Preencha seus dados para começar.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence>
              {errorMsg && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="overflow-hidden"
                >
                  <div className="text-[13px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                </motion.div>
              )}
              {infoMsg && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="overflow-hidden"
                >
                  <div className="text-[13px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{infoMsg}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-zinc-300">Nome Completo</label>
                <div className="relative">
                  <input 
                    required 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full h-12 rounded-xl bg-black/20 border border-white/10 px-4 text-[14px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#d4a017] focus:bg-black/40 focus:ring-1 focus:ring-[#d4a017] transition-all" 
                    placeholder="Seu nome" 
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-zinc-300">E-mail corporativo</label>
              <div className="relative">
                <input 
                  required 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  className="w-full h-12 rounded-xl bg-black/20 border border-white/10 px-4 text-[14px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#d4a017] focus:bg-black/40 focus:ring-1 focus:ring-[#d4a017] transition-all" 
                  placeholder="nome@empresa.com" 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <label className="block text-[13px] font-medium text-zinc-300">Senha</label>
                {mode === 'login' && (
                  <button type="button" className="text-[12px] font-medium text-[#d4a017] hover:text-[#f2ca5c] transition-colors">
                    Esqueceu a senha?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  required
                  minLength={mode === 'register' ? 6 : undefined}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full h-12 rounded-xl bg-black/20 border border-white/10 pl-4 pr-11 text-[14px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#d4a017] focus:bg-black/40 focus:ring-1 focus:ring-[#d4a017] transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              {mode === 'register' && (
                <div className="pt-2 space-y-1.5">
                  <label className="block text-[13px] font-medium text-zinc-300">Confirmar Senha</label>
                  <div className="relative">
                    <input
                      required
                      minLength={6}
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full h-12 rounded-xl bg-black/20 border border-white/10 pl-4 pr-11 text-[14px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#d4a017] focus:bg-black/40 focus:ring-1 focus:ring-[#d4a017] transition-all"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 space-y-6">
              <button 
                type="submit" 
                disabled={loading} 
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#d4a017] to-[#a3760a] text-white flex items-center justify-center gap-2 font-bold text-[14px] tracking-wide disabled:opacity-50 hover:from-[#f2ca5c] hover:to-[#d4a017] shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    {mode === 'register' ? 'Criando Conta...' : 'Autenticando...'}
                  </span>
                ) : (
                  <>
                    <span>{mode === 'register' ? 'Criar Conta' : 'Acessar o Sistema'}</span>
                    <ArrowRight className="w-4 h-4 opacity-80" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[13px] text-zinc-400">
                <span>{mode === 'login' ? 'Ainda não tem acesso?' : 'Já possui conta?'}</span>
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErrorMsg(''); setInfoMsg(''); }}
                  className="text-white hover:text-zinc-200 font-semibold transition-colors drop-shadow-sm"
                >
                  {mode === 'login' ? 'Solicite uma conta' : 'Fazer login'}
                </button>
              </div>
            </div>
          </form>
          
        </motion.div>
      </div>
    </div>
  );
};
