import { describe, expect, it } from 'vitest';
import { t } from '@/i18n/forge/lang';
import { isTypeFixRequest } from './laneRouting';
import { buildTypeFixPrompt } from '@/components/chat/ResultCards';

// El orquestador reconoce "Arreglar ahora" por su frase fija; si alguien
// cambia el texto del diccionario sin cambiar laneRouting.js, el pedido
// volvería a morir en "no encuentro errores activos". Este test lo impide.
describe('pedido de "Arreglar ahora"', () => {
  const errors = [{ file: 'src/A.tsx', line: 1, column: 1, code: 6133, message: "'x' is declared but its value is never read." }];

  it('el pedido que arma la UI se reconoce en los dos idiomas', () => {
    for (const lang of ['es', 'en'] as const) {
      const prompt = t('chat.types.fixPrompt', { list: '- src/A.tsx(1,1): TS6133 x' }, lang);
      expect(isTypeFixRequest(prompt)).toBe(true);
    }
    expect(isTypeFixRequest(buildTypeFixPrompt(errors))).toBe(true);
  });
});

// Seguridad (S2, 2026-10-01): el "Arreglar" de la pestaña Seguridad también se
// reconoce por su frase fija; si el diccionario cambia, este test lo frena.
describe('pedido de "Arreglar" en Seguridad', () => {
  it('se reconoce en los dos idiomas', async () => {
    const { isSecurityFixRequest } = await import('./securityFix.js');
    for (const lang of ['es', 'en'] as const) {
      expect(isSecurityFixRequest(t('security.fixPrompt', { list: '- x' }, lang))).toBe(true);
    }
  });
});
