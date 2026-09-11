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
            <stop offset="0%" stopColor="#f2ca5c" />
            <stop offset="50%" stopColor="#d4a017" />
            <stop offset="100%" stopColor="#a3760a" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="100" r="36" fill="url(#munago-grad)" />
        <polygon points="120,64 156,100 120,172 84,100" fill="url(#munago-grad)" />
        <path
          d="M103,100 L115,112 L139,84"
          fill="none"
          stroke="#0a0a0a"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex flex-col">
        <h1
          className={`${titleSize} font-extrabold tracking-tight leading-none`}
          style={{
            background: 'linear-gradient(90deg, #f2ca5c, #d4a017, #a3760a)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Munago
        </h1>
        <div
          className="my-1"
          style={{
            width: size === 'sm' ? '20px' : size === 'md' ? '28px' : '36px',
            height: '2px',
            background: 'linear-gradient(90deg, #f2ca5c, #a3760a)',
          }}
        ></div>
        {showSubtitle && (
          <span
            className={`${subSize} font-bold tracking-[1.5px] uppercase`}
            style={{ color: '#d4a017' }}
          >
            Sistema de Controle e Recolhimento
          </span>
        )}
      </div>
    </div>
  );
};
