import React from 'react';
import { motion } from 'motion/react';

// Mesmo ícone/gradiente dourado do MunagoLogo (usado no app, no favicon e
// no cabeçalho do PDF) — antes o preload usava um spinner azul genérico
// sem nenhuma identidade da marca.
export const PreloadView = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07070a] overflow-hidden">
      {/* Halos de fundo — mesmo clima da capa escura do PDF/relatório */}
      <div className="absolute -top-24 -left-16 w-80 h-80 bg-[#d4a017]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-24 -right-16 w-80 h-80 bg-[#d4a017]/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative flex flex-col items-center"
      >
        <div className="relative w-20 h-20 mb-6">
          {/* Halo pulsante atrás do ícone */}
          <motion.div
            animate={{ scale: [1, 1.35, 1], opacity: [0.35, 0, 0.35] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-full"
            style={{ background: 'radial-gradient(circle, #f2ca5c 0%, transparent 70%)' }}
          />
          <motion.svg
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="relative w-full h-full"
            viewBox="0 0 240 240"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="preload-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f2ca5c" />
                <stop offset="50%" stopColor="#d4a017" />
                <stop offset="100%" stopColor="#a3760a" />
              </linearGradient>
            </defs>
            <circle cx="120" cy="100" r="36" fill="url(#preload-grad)" />
            <polygon points="120,64 156,100 120,172 84,100" fill="url(#preload-grad)" />
            <path
              d="M103,100 L115,112 L139,84"
              fill="none"
              stroke="#0a0a0a"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        </div>

        <h1
          className="text-3xl font-black tracking-tight leading-none"
          style={{
            background: 'linear-gradient(90deg, #f2ca5c, #d4a017, #a3760a)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Munago
        </h1>
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase mt-1.5" style={{ color: '#d4a017' }}>
          Sistema de Controle e Recolhimento
        </p>

        {/* Barra de progresso indeterminada — mais viva que só um texto parado */}
        <div className="relative w-40 h-1 mt-7 rounded-full overflow-hidden bg-white/10">
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent, #f2ca5c, #d4a017, transparent)' }}
            animate={{ left: ['-35%', '100%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        <p className="text-[9px] font-semibold text-[#6b6558] mt-3 tracking-[0.15em] uppercase">
          Carregando sistema...
        </p>
      </motion.div>
    </div>
  );
};
