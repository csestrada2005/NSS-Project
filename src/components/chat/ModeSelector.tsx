import { useEffect, useRef, useState } from 'react';
import type { ChatSendMode } from '@/utils/chatModeMark.js';

/**
 * ModeSelector — el dropdown de modo (1.3 del rediseño). SUSTITUYE al checkbox
 * "Plan Mode" que vivía junto al input (CIRUGÍA B3) — mismo par valor/setter
 * (`mode`/`onChange`, aquí como string en vez de boolean), ningún camino
 * nuevo hacia el pipeline. El padre sigue siendo dueño del valor
 * (sessionStorage vive en StudioEngine, sin cambios).
 */
export function ModeSelector({
  mode,
  onChange,
  disabled,
}: {
  mode: ChatSendMode;
  onChange: (mode: ChatSendMode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const select = (next: ChatSendMode) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="fc-modo" ref={rootRef}>
      <button
        type="button"
        className="fc-modo-btn"
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className={`fc-glifo ${mode === 'plan' ? 'fc-plan' : 'fc-auto'}`} />
        <span>{mode === 'plan' ? 'Plan' : 'Automático'}</span>
        <span className="fc-flecha">▲</span>
      </button>
      <div className={`fc-modo-menu ${open ? 'fc-abierto' : ''}`} role="menu">
        <button
          type="button"
          className="fc-modo-opt"
          role="menuitemradio"
          aria-checked={mode === 'auto'}
          onClick={() => select('auto')}
        >
          <span className="fc-glifo fc-auto" />
          <span>
            <strong>Automático</strong>
            <span>Wyrd construye de una. Rápido para cambios chicos.</span>
          </span>
        </button>
        <button
          type="button"
          className="fc-modo-opt"
          role="menuitemradio"
          aria-checked={mode === 'plan'}
          onClick={() => select('plan')}
        >
          <span className="fc-glifo fc-plan" />
          <span>
            <strong>Plan</strong>
            <span>Wyrd te enseña qué va a hacer y espera tu visto bueno.</span>
          </span>
        </button>
      </div>
    </div>
  );
}
