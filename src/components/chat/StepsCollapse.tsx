import { useState } from 'react';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

/**
 * StepsCollapse — el bloque colapsable de pasos al pie de toda tarjeta de
 * resultado (Bloque 3, regla compartida por las 5 variantes).
 *
 * `completedCount === steps.length` → "N pasos completados" (caso normal).
 * `completedCount < steps.length` → "X de N pasos completados" (CANCELADO:
 * los pasos no ejecutados se pintan en gris apagado, mismo tratamiento visual
 * que un paso fallido — la tarjeta ya deja claro con su propio texto que fue
 * una cancelación, no un error).
 *
 * max-height + opacity, nunca display:none, para que anime al abrir/cerrar.
 */
export function StepsCollapse({
  steps,
  completedCount,
  open: controlledOpen,
  onToggle,
}: {
  steps: string[];
  completedCount: number;
  /** Modo controlado (SeguridadCard: "Ver qué cambió" abre este mismo bloque). Si se omite, el estado es propio. */
  open?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const { t, tn } = useForgeLang();
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (onToggle) onToggle(next);
    else setLocalOpen(next);
  };
  const label =
    completedCount >= steps.length
      ? tn('chat.steps.done', steps.length)
      : t('chat.steps.partial', { done: completedCount, total: steps.length });

  return (
    <div>
      <button
        type="button"
        className="fc-colapso"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="fc-marca-ok" />
        <span>{label}</span>
        <span className="fc-caret">▶</span>
      </button>
      <div className={`fc-detalle ${open ? 'fc-abierto' : ''}`}>
        <ul className="fc-pasos">
          {steps.map((text, i) => (
            <li key={i} className={`fc-paso ${i < completedCount ? 'fc-listo' : 'fc-fallo'}`}>
              <span className="fc-marca" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
