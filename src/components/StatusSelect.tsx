import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { RecolhimentoItem } from '../types';

// Dropdown de status com o tema do sistema — o <select> nativo (mesmo com o
// GATILHO estilizado como pill colorido) abre um popup renderizado pelo
// navegador/SO pras opções, que não dá pra restilizar via CSS (mesmo bug do
// <input type="date">, ver DatePicker.tsx).

type Status = RecolhimentoItem['status'];

interface StatusSelectProps {
  value: Status;
  onChange: (status: Status) => void;
}

const STATUS_META: { value: Status; label: string; dot: string; text: string; bg: string; border: string }[] = [
  { value: 'Recebida', label: 'Recebida', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800/50' },
  { value: 'Confirmada', label: 'Confirmada', dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800/50' },
  { value: 'Aguardando pagamento', label: 'Pendente', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800/50' },
  { value: 'Atrasado', label: 'Atrasado', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800/50' },
];

export const StatusSelect: React.FC<StatusSelectProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const current = STATUS_META.find((s) => s.value === value) || STATUS_META[2];

  // Portal fora da árvore (mesma razão do DatePicker) — a célula da tabela
  // fica dentro de um contêiner com overflow-x-auto, que corta qualquer
  // dropdown posicionado normalmente (position:absolute preso ao pai).
  const updateCoords = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left });
  };

  useLayoutEffect(() => {
    if (open) updateCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => updateCoords();
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-xs cursor-pointer transition-colors ${current.bg} ${current.text} ${current.border}`}
      >
        <span>{current.label}</span>
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left }}
          className="z-[100] w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150"
        >
          {STATUS_META.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                onChange(s.value);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                s.value === value
                  ? `${s.bg} ${s.text}`
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
              <span className="flex-1 text-left">{s.label}</span>
              {s.value === value && <Check className="w-3 h-3 shrink-0" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};
