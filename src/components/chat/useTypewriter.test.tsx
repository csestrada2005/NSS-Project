import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { TypewriterText, resetTypewriterMemory } from './useTypewriter';

// 2026-10-01 (Samuel): el texto de Wyrd se escribe solo, como Claude.
const mockMotion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

describe('TypewriterText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTypewriterMemory();
  });
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error — jsdom no trae matchMedia; se deja como estaba.
    delete window.matchMedia;
  });

  it('se escribe poco a poco y termina con el texto completo en ≤ 3.5 s', () => {
    mockMotion(false);
    const text = 'Agrega la columna nombre a la tabla de suscriptores del newsletter.';
    const { container } = render(<TypewriterText text={text} />);
    expect(container.textContent).toBe('');
    act(() => { vi.advanceTimersByTime(200); });
    const partial = container.textContent ?? '';
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(text.length);
    expect(text.startsWith(partial)).toBe(true);
    act(() => { vi.advanceTimersByTime(3500); });
    expect(container.textContent).toBe(text);
  });

  it('un texto largo nunca tarda más de 3.5 s', () => {
    mockMotion(false);
    const text = 'x'.repeat(5000);
    const { container } = render(<TypewriterText text={text} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect((container.textContent ?? '').length).toBeLessThan(text.length);
    act(() => { vi.advanceTimersByTime(600); });
    expect(container.textContent).toBe(text);
  });

  it('un texto ya escrito no se vuelve a animar al montarse de nuevo', () => {
    mockMotion(false);
    const text = 'Respuesta ya mostrada';
    const first = render(<TypewriterText text={text} />);
    act(() => { vi.advanceTimersByTime(3600); });
    first.unmount();
    const { container } = render(<TypewriterText text={text} />);
    expect(container.textContent).toBe(text);
  });

  it('con "reducir movimiento" aparece completo de inmediato', () => {
    mockMotion(true);
    const { container } = render(<TypewriterText text="Sin animación" />);
    expect(container.textContent).toBe('Sin animación');
  });
});
