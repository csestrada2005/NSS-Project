import { Monitor, Tablet, Smartphone } from 'lucide-react';
import type { ViewportMode } from './types';

const ORDER: ViewportMode[] = ['desktop', 'tablet', 'mobile'];
const ICON: Record<ViewportMode, typeof Monitor> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };
const LABEL: Record<ViewportMode, string> = { desktop: 'Escritorio', tablet: 'Tablet (768px)', mobile: 'Celular (390px)' };

/**
 * ViewportToggle — UN solo botón que cicla desktop→tablet→móvil→desktop
 * (pedido explícito, reemplaza los 3 botones separados que había antes).
 */
export function ViewportToggle({ mode, onChange }: { mode: ViewportMode; onChange: (mode: ViewportMode) => void }) {
  const Icon = ICON[mode];
  const next = () => onChange(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]);
  return (
    <button
      type="button"
      onClick={next}
      title={`Vista: ${LABEL[mode]} — clic para cambiar`}
      className="wf-btn wf-icon-only"
    >
      <Icon size={14} />
    </button>
  );
}
