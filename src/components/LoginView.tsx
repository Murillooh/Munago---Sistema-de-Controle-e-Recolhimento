import React, { useState, useEffect } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { AuthUser } from '../types';

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser, token: string | null) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);

    try {
      if (mode === 'register') {
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
          // Primeiro usuário do sistema: já entra direto como admin.
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
        // Banco ainda não configurado: mantém o acesso local de sempre, sem travar o sistema.
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

  useEffect(() => {
    // Canvas animation logic
    const canvas = document.getElementById('stars') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;
    let stars: any[] = [];
    let shooters: any[] = [];
    let lastShot = 0;
    let nextShotDelay = 2000;

    function rand(a: number, b: number) { return a + Math.random() * (b - a); }

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      stars = [];
      const count = Math.max(70, Math.min(220, Math.round((W * H) / 5200)));
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.pow(Math.random(), 1.35) * H,
          r: rand(0.5, 1.6),
          base: rand(0.25, 0.85),
          amp: rand(0.15, 0.45),
          speed: rand(0.4, 1.4),
          phase: rand(0, Math.PI * 2),
          drift: rand(-1.5, 1.5)
        });
      }
    }

    function frame(t: number) {
      ctx.clearRect(0, 0, W, H);
      stars.forEach(s => {
        const tw = Math.max(0, Math.min(1, s.base + s.amp * Math.sin(t * 0.001 * s.speed + s.phase)));
        ctx.fillStyle = `rgba(255,250,238,${tw})`;
        ctx.beginPath();
        ctx.arc(s.x + Math.sin(t * 0.00012 + s.phase) * s.drift * 6, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      if (t - lastShot > nextShotDelay) {
        shooters.push({
          x: rand(W * 0.05, W * 0.75), y: rand(H * 0.02, H * 0.28),
          vx: Math.cos(rand(18, 32) * Math.PI / 180) * rand(9, 14),
          vy: Math.sin(rand(18, 32) * Math.PI / 180) * rand(9, 14),
          life: 0, maxLife: rand(38, 58), len: rand(70, 130)
        });
        lastShot = t;
        nextShotDelay = rand(2600, 5200);
      }

      shooters.forEach((sh, i) => {
        sh.x += sh.vx; sh.y += sh.vy; sh.life++;
        const p = sh.life / sh.maxLife;
        const fade = Math.max(0, Math.min(1, p < 0.15 ? p / 0.15 : (1 - (p - 0.15) / 0.85)));
        ctx.strokeStyle = `rgba(59,130,246,${0.5 * fade})`;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - (sh.vx * sh.len / 12), sh.y - (sh.vy * sh.len / 12));
        ctx.stroke();
        if (sh.life > sh.maxLife) shooters.splice(i, 1);
      });
      requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#07070a] text-[#f5f5f0] font-sans">
      <canvas id="stars" className="absolute inset-0 z-0"></canvas>
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(60%_100%_at_50%_0%,rgba(59,130,246,0.14),rgba(59,130,246,0)_70%)] mix-blend-screen" />
      
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-6">
        <div className="flex items-center gap-4 mb-10 drop-shadow-[0_0_22px_rgba(212,160,23,0.25)]">
          <svg className="w-14 h-14" viewBox="0 0 240 240">
            <defs>
              <linearGradient id="login-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f2ca5c" />
                <stop offset="50%" stopColor="#d4a017" />
                <stop offset="100%" stopColor="#a3760a" />
              </linearGradient>
            </defs>
            <circle cx="120" cy="100" r="36" fill="url(#login-grad)"/>
            <polygon points="120,64 156,100 120,172 84,100" fill="url(#login-grad)"/>
            <path d="M103,100 L115,112 L139,84" fill="none" stroke="#0a0a0a" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <h1 className="text-[29px] font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-[#f2ca5c] via-[#d4a017] to-[#a3760a]">Munago</h1>
            <div className="w-[26px] h-0.5 bg-gradient-to-r from-[#f2ca5c] to-[#a3760a] my-2"></div>
            <div className="text-[10.5px] font-semibold tracking-[1.4px] text-[#918f9a]">SISTEMA DE CONTROLE E RECOLHIMENTO</div>
          </div>
        </div>

        <form className="w-full max-w-[360px] bg-white/5 dark:bg-[#111014]/60 backdrop-blur-2xl border border-white/10 dark:border-[#242229]/60 rounded-3xl p-8 shadow-2xl shadow-black/50 space-y-5" onSubmit={handleSubmit}>
          {errorMsg && (
            <div className="text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {infoMsg}
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-[10px] font-black tracking-widest text-[#918f9a] mb-2 uppercase">Nome</label>
              <input required type="text" value={name} onChange={e => setName(e.target.value)} className="login-input w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white placeholder-white/30" placeholder="Seu nome" />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-black tracking-widest text-[#918f9a] mb-2 uppercase">E-mail</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="login-input w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white placeholder-white/30" placeholder="seu@email.com" />
          </div>
          <div>
            <label className="block text-[10px] font-black tracking-widest text-[#918f9a] mb-2 uppercase">Senha</label>
            <div className="relative">
              <input
                required
                minLength={mode === 'register' ? 6 : undefined}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="login-input w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-4 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white placeholder-white/30"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          
          <div className="pt-2 space-y-3">
            <button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center font-black text-xs text-white tracking-wider disabled:opacity-60 hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-500/25 active:scale-95 group relative overflow-hidden">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative z-10 flex items-center gap-2">
                {mode === 'login' ? <Lock className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                {loading ? (mode === 'register' ? 'Criando Conta...' : 'Entrando...') : (mode === 'register' ? 'Criar Conta' : 'Entrar no Sistema')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErrorMsg(''); setInfoMsg(''); }}
              className="w-full h-12 rounded-xl border border-white/10 flex items-center justify-center font-bold text-xs text-white/70 tracking-wider hover:bg-white/5 hover:text-white transition-all"
            >
              {mode === 'login' ? 'Criar Nova Conta' : 'Já Tenho Conta'}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
};
