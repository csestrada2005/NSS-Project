import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInterface } from '../ChatInterface';
import { setForgeLang } from '@/i18n/forge/lang';

// Modo Chat (2026-10-08): tercera opción del menú; y en modo Chat, el botón de
// la sugerencia cambia a Automático y lo construye (B1).

describe('Modo Chat en la barra', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('el menú ofrece Chat y al elegirlo avisa al padre', async () => {
    setForgeLang('es');
    const onSendModeChange = vi.fn();
    render(
      <ChatInterface isLoading={false} onSendMessage={vi.fn()} selectedElement={null} projectId="p"
        sendMode="auto" onSendModeChange={onSendModeChange} />
    );
    await userEvent.click(screen.getByRole('button', { name: /Automático/ }));
    const chat = screen.getByRole('menuitemradio', { name: /Chat/ });
    expect(chat.textContent).toContain('Sólo responde. No cambia nada del proyecto.');
    await userEvent.click(chat);
    expect(onSendModeChange).toHaveBeenCalledWith('chat');
  });

  it('en modo Chat, el botón de la sugerencia cambia a Automático y la envía', async () => {
    setForgeLang('es');
    const onSendModeChange = vi.fn();
    const onSend = vi.fn().mockResolvedValue({
      success: true, modifiedFiles: [],
      chatResponse: 'Los precios coinciden con el PDF.',
      suggestedAction: 'Ajusta el precio del rafting a $900',
    });
    render(
      <ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p"
        sendMode="chat" onSendModeChange={onSendModeChange} />
    );
    await userEvent.type(screen.getByPlaceholderText(/.+/), '¿Están bien los precios?{Enter}');
    const suggestion = await screen.findByRole('button', { name: 'Ajusta el precio del rafting a $900' });
    expect(onSendModeChange).not.toHaveBeenCalled();

    await userEvent.click(suggestion);
    expect(onSendModeChange).toHaveBeenCalledWith('auto');
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend.mock.calls[1][0]).toBe('Ajusta el precio del rafting a $900');
  });
});
