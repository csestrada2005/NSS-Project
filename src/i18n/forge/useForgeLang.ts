import { useCallback, useSyncExternalStore } from 'react';
import { getForgeLang, setForgeLang, subscribeForgeLang, t as translate, tn as translatePlural, type ForgeLang, type TParams } from './lang';
import type { ForgeKey } from './en';

/** Idioma de Wyrd Forge dentro de un componente: re-renderiza al cambiarlo. */
export function useForgeLang() {
  const lang = useSyncExternalStore(subscribeForgeLang, getForgeLang, getForgeLang);
  const t = useCallback((key: ForgeKey, params?: TParams) => translate(key, params, lang), [lang]);
  const tn = useCallback((base: string, count: number, params?: TParams) => translatePlural(base, count, params, lang), [lang]);
  return { lang, setLang: setForgeLang as (lang: ForgeLang) => void, t, tn };
}
