import { Languages } from 'lucide-react';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

/**
 * Interruptor EN/ES de Wyrd Forge. Muestra el idioma ACTUAL; un click cambia
 * al otro. Sólo afecta a Wyrd Forge (el CRM tiene su propio idioma). El
 * `className` lo pone quien lo monta para heredar el estilo de su barra.
 */
export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useForgeLang();
  return (
    <button
      type="button"
      className={className}
      onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
      aria-label={`${t('lang.toggle.label')}: ${lang.toUpperCase()} — ${t('lang.toggle.switchTo')}`}
      title={t('lang.toggle.switchTo')}
    >
      <Languages size={15} />
      <span>{lang.toUpperCase()}</span>
    </button>
  );
}
