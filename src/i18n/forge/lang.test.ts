import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `lang.ts` detecta el idioma al importarse: cada test re-importa el módulo
// limpio después de preparar storage/navegador.
async function load() {
  vi.resetModules();
  return import('./lang');
}

describe('idioma de Wyrd Forge', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('primera vez: navegador en español → es', async () => {
    vi.stubGlobal('navigator', { language: 'es-MX' });
    const { getForgeLang } = await load();
    expect(getForgeLang()).toBe('es');
  });

  it('primera vez: navegador en otro idioma → en', async () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    const { getForgeLang } = await load();
    expect(getForgeLang()).toBe('en');
  });

  it('la elección guardada gana sobre el navegador y sobrevive a recargar', async () => {
    vi.stubGlobal('navigator', { language: 'es-MX' });
    const first = await load();
    first.setForgeLang('en');
    const reloaded = await load();
    expect(reloaded.getForgeLang()).toBe('en');
  });

  it('avisa a los suscriptores al cambiar, y sólo si cambia', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    const { setForgeLang, subscribeForgeLang } = await load();
    const fn = vi.fn();
    const off = subscribeForgeLang(fn);
    setForgeLang('en');
    expect(fn).not.toHaveBeenCalled();
    setForgeLang('es');
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it('t() e interpolación, y tn() con plural', async () => {
    const { t, tn } = await load();
    expect(t('lang.toggle.label', undefined, 'es')).toBe('Idioma');
    expect(tn('dashboard.projectCount', 1, undefined, 'es')).toBe('1 proyecto');
    expect(tn('dashboard.projectCount', 3, undefined, 'en')).toBe('3 projects');
  });
});
