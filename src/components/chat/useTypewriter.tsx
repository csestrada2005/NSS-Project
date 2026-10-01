import { useEffect, useState } from 'react';

/**
 * Texto que se escribe solo, como cuando Claude responde (2026-10-01, pedido de
 * Samuel): las líneas de progreso y las respuestas del modal ya no aparecen de
 * golpe.
 *
 * - ~35 caracteres por segundo (Samuel lo pidió más lento que la primera
 *   versión, 70), y NUNCA más de 3.5 s por texto.
 * - Cada texto se anima UNA vez por sesión: una vez escrito completo, si
 *   vuelve a montarse (peek, reabrir el modal, cambio de estado de una línea)
 *   sale completo.
 * - Sin animación con "reducir movimiento" o sin matchMedia (tests/SSR).
 */
const CHARS_PER_SECOND = 35;
const MAX_MS = 3500;
const TICK_MS = 16;
const alreadyTyped = new Set<string>();

function shouldAnimate(text: string): boolean {
  if (!text || alreadyTyped.has(text)) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useTypewriter(text: string): string {
  const [shown, setShown] = useState(() => (shouldAnimate(text) ? '' : text));

  useEffect(() => {
    if (!shouldAnimate(text)) {
      setShown(text);
      return;
    }
    const totalMs = Math.min(MAX_MS, (text.length / CHARS_PER_SECOND) * 1000);
    const perTick = Math.max(1, Math.ceil(text.length / Math.max(1, totalMs / TICK_MS)));
    let count = 0;
    setShown('');
    const id = window.setInterval(() => {
      count = Math.min(text.length, count + perTick);
      setShown(text.slice(0, count));
      if (count >= text.length) {
        window.clearInterval(id);
        // Se marca al TERMINAR (no al empezar): el doble montaje de StrictMode
        // en desarrollo no debe dejarlo sin animación.
        alreadyTyped.add(text);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [text]);

  return shown;
}

/** Para pruebas: olvida qué textos ya se animaron. */
export function resetTypewriterMemory() {
  alreadyTyped.clear();
}

export function TypewriterText({ text }: { text: string }) {
  return <>{useTypewriter(text)}</>;
}
