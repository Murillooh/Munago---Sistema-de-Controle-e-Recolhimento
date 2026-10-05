import React from 'react';

interface MunagoLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const MunagoLogo: React.FC<MunagoLogoProps> = ({ size = 'md', showSubtitle = true }) => {
  const iconSize = size === 'sm' ? 32 : size === 'md' ? 44 : 56;
  const titleSize = size === 'sm' ? 'text-base' : size === 'md' ? 'text-xl' : 'text-3xl';
  const subSize = size === 'sm' ? 'text-[9px]' : size === 'md' ? 'text-[10px]' : 'text-xs';

  return (
    <div className="flex items-center space-x-3.5 select-none">
      <svg
        className="flex-none"
        style={{ width: iconSize, height: iconSize }}
        viewBox="0 0 240 240"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="munago-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="100" r="36" fill="url(#munago-grad)" />
        <polygon points="120,64 156,100 120,172 84,100" fill="url(#munago-grad)" />
        <path
          d="M103,100 L115,112 L139,84"
          fill="none"
          stroke="#ffffff"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex flex-col">
        <h1
          className={`${titleSize} font-extrabold tracking-tight leading-none text-slate-900 dark:text-white`}
        >
          Munago
        </h1>
        <div
          className="my-1"
          style={{
            width: size === 'sm' ? '20px' : size === 'md' ? '28px' : '36px',
            height: '2px',
            background: 'linear-gradient(90deg, #2563eb, #4f46e5)',
          }}
        ></div>
        {showSubtitle && (
          <span
            className={`${subSize} font-bold tracking-[1.5px] uppercase text-blue-600 dark:text-blue-400`}
          >
            Sistema de Controle e Recolhimento
          </span>
        )}
      </div>
    </div>
  );
};
