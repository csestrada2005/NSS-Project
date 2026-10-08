import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInterface } from '../ChatInterface';
import type { ForgePhase } from '@/services/AIOrchestrator';
import { setForgeLang } from '@/i18n/forge/lang';

// Tarjeta de progreso (2026-10-08, P2): cambia con cada etapa real.

type OnPhase = (phase: ForgePhase, detail?: string) => void;

describe('Tarjeta de progreso por etapas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('pregunta en Automático: Entendiendo → frase del clasificador → título "Pensando la respuesta"', async () => {
    setForgeLang('es');
    let phase: OnPhase = () => {};
    let finish: (v: unknown) => void = () => {};
    const onSend = vi.fn((_m, _p, _r, _pl, _a, onPhase: OnPhase) => {
      phase = onPhase;
      return new Promise((resolve) => { finish = resolve; });
    });
    const { container, rerender } = render(
      <ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p" sendMode="auto" />
    );
    await userEvent.type(screen.getByPlaceholderText(/.+/), '¿Crees que esta foto sirve?{Enter}');
    // El padre marca "cargando" mientras trabaja: así se ve la tarjeta.
    rerender(<ChatInterface isLoading onSendMessage={onSend} selectedElement={null} projectId="p" sendMode="auto" />);
    await waitFor(() => expect(container.textContent).toContain('Entendiendo tu pedido…'));
    expect(container.textContent).not.toContain('Trabajando en tu pedido');

    act(() => phase('understanding'));
    act(() => phase('headline', 'Analizando si la foto sirve para la página…'));
    await waitFor(() => expect(container.textContent).toContain('Analizando si la foto sirve para la página…'));
    act(() => phase('answering'));
    await waitFor(() => expect(container.textContent).toContain('Pensando la respuesta'));
    // La frase a la medida se queda; no vuelve a lo genérico.
    expect(container.textContent).toContain('Analizando si la foto sirve para la página…');

    await act(async () => finish({ success: true, modifiedFiles: [], chatResponse: 'Sí sirve.' }));
    rerender(<ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p" sendMode="auto" />);
  });

  it('un adjunto se lee primero, y la revisión final se agrega como línea', async () => {
    setForgeLang('es');
    let phase: OnPhase = () => {};
    const onSend = vi.fn((_m, _p, _r, _pl, _a, onPhase: OnPhase) => {
      phase = onPhase;
      return new Promise(() => {});
    });
    const { container, rerender } = render(
      <ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p" sendMode="auto" />
    );
    await userEvent.type(screen.getByPlaceholderText(/.+/), 'Haz el menú con este PDF{Enter}');
    rerender(<ChatInterface isLoading onSendMessage={onSend} selectedElement={null} projectId="p" sendMode="auto" />);
    act(() => phase('reading', 'menu.pdf'));
    await waitFor(() => expect(container.textContent).toContain('Leyendo menu.pdf…'));
    act(() => phase('understanding'));
    await waitFor(() => expect(container.textContent).toContain('Haciendo el menú con este PDF…'));
    act(() => phase('checking'));
    await waitFor(() => expect(container.textContent).toContain('Revisando que todo funcione…'));
  });
});
