import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, ChevronLeft } from 'lucide-react';
import { useIsPhone } from '@/hooks/useIsPhone';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { LangToggle } from '../forge/LangToggle';

/**
 * PhoneGate — el editor (preview + chat + código) no está pensado para pantalla
 * de teléfono. En un teléfono se muestra este aviso EN LUGAR de montar el
 * editor (decidido con Samuel, ítem 5.4): no se carga el proyecto ni se
 * compila nada en segundo plano. El dashboard y el Hub sí funcionan en
 * teléfono.
 */
export function PhoneGate({ children }: { children: ReactNode }) {
  const isPhone = useIsPhone();
  const navigate = useNavigate();
  const { t } = useForgeLang();

  if (!isPhone) return <>{children}</>;

  return (
    <div className="nebu-modal flex flex-col h-screen bg-background text-foreground">
      <div className="flex justify-end p-4">
        <LangToggle className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Monitor size={40} className="text-primary" aria-hidden="true" />
        <h1 className="text-lg font-semibold">{t('phone.title')}</h1>
        <p className="text-sm text-muted-foreground max-w-xs">{t('phone.body')}</p>
        <button
          type="button"
          onClick={() => navigate('/forge')}
          className="nebu-cta mt-2 inline-flex items-center gap-2 h-11 px-5 bg-primary text-white text-sm font-medium rounded-md"
        >
          <ChevronLeft size={16} />
          {t('hub.back')}
        </button>
      </div>
    </div>
  );
}
