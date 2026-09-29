import type { ForgeLang } from './lang';

/** "hace 5 min" / "5 min ago": relativo hasta 7 días, fecha local después. */
export function formatRelativeDate(iso: string, lang: ForgeLang): string {
  const d = new Date(iso);
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
  if (diffMins < 60) return rtf.format(-diffMins, 'minute');
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return rtf.format(-diffHrs, 'hour');
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return rtf.format(-diffDays, 'day');
  return d.toLocaleDateString(lang);
}
