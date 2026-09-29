import { Monitor, Tablet, Smartphone } from 'lucide-react';
import type { ViewportMode } from './types';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import type { ForgeKey } from '@/i18n/forge/en';

const ORDER: ViewportMode[] = ['desktop', 'tablet', 'mobile'];
const ICON: Record<ViewportMode, typeof Monitor> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };
const LABEL: Record<ViewportMode, ForgeKey> = { desktop: 'studio.viewport.desktop', tablet: 'studio.viewport.tablet', mobile: 'studio.viewport.mobile' };

/**
 * ViewportToggle — UN solo botón que cicla desktop→tablet→móvil→desktop
 * (pedido explícito, reemplaza los 3 botones separados que había antes).
 */
export function ViewportToggle({ mode, onChange }: { mode: ViewportMode; onChange: (mode: ViewportMode) => void }) {
  const Icon = ICON[mode];
  const { t } = useForgeLang();
  const title = t('studio.viewport.title', { mode: t(LABEL[mode]) });
  const next = () => onChange(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]);
  return (
    <button
      type="button"
      onClick={next}
      title={title}
      aria-label={title}
      className="wf-btn wf-icon-only"
    >
      <Icon size={14} />
    </button>
  );
}
