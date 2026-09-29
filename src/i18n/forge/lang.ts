// Idioma de Wyrd Forge: un store mínimo fuera de React para que lo lean
// igual las pantallas (vía `useForgeLang`) y el código que no es pantalla
// (AIOrchestrator, toasts disparados desde servicios). Se guarda en el
// navegador; la primera vez se toma del idioma del navegador.
import { en, type ForgeKey } from './en';
import { es } from './es';

export type ForgeLang = 'en' | 'es';

const STORAGE_KEY = 'wyrd-forge-lang';
const DICTS: Record<ForgeLang, Record<ForgeKey, string>> = { en, es };

function detectInitial(): ForgeLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // Sin acceso a storage (modo privado, etc.): cae al idioma del navegador.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('es') ? 'es' : 'en';
}

let current: ForgeLang = detectInitial();
const listeners = new Set<() => void>();

export function getForgeLang(): ForgeLang {
  return current;
}

export function setForgeLang(lang: ForgeLang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // La elección vale para esta sesión aunque no se pueda guardar.
  }
  listeners.forEach((fn) => fn());
}

export function subscribeForgeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type TParams = Record<string, string | number>;

function interpolate(text: string, params?: TParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m
  );
}

/** Traduce `key` al idioma actual (o a `lang` si se pasa). */
export function t(key: ForgeKey, params?: TParams, lang: ForgeLang = current): string {
  return interpolate(DICTS[lang][key] ?? en[key] ?? key, params);
}

/** Plural: busca `<base>_one` / `<base>_other`; `{count}` queda disponible. */
export function tn(base: string, count: number, params?: TParams, lang: ForgeLang = current): string {
  const key = `${base}_${count === 1 ? 'one' : 'other'}` as ForgeKey;
  return t(key, { count, ...params }, lang);
}
