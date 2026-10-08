import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissingSecretsCard } from './MissingSecretsCard';
import { SecretsPanel } from '../settings/db/SecretsPanel';
import { platformService } from '../../services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';

// Llaves "como Lovable" (2026-10-08): la tarjeta del chat pide lo que falta y
// Ajustes → Secretos lista por estado sin mostrar nunca un valor.

describe('Tarjeta de llaves que faltan (chat)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('pide la llave que falta, la manda al servidor del proyecto y desaparece', async () => {
    setForgeLang('es');
    const list = vi.spyOn(platformService, 'listProjectSecrets').mockResolvedValue({
      server: 'ready',
      secrets: [{ name: 'BANXICO_TOKEN', status: 'missing', usedBy: ['tipo-cambio'] }],
    });
    const set = vi.spyOn(platformService, 'setProjectSecret').mockResolvedValue();
    render(<MissingSecretsCard projectId="p" checkKey={0} />);

    await screen.findByText('Falta una llave para que esto funcione');
    expect(list).toHaveBeenCalledWith('p', { missingOnly: true });
    screen.getByText('BANXICO_TOKEN');
    screen.getByText(/la usa: tipo-cambio/);

    const input = screen.getByLabelText('BANXICO_TOKEN') as HTMLInputElement;
    expect(input.type).toBe('password');
    await userEvent.type(input, 'tok-123');
    await userEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => expect(set).toHaveBeenCalledWith('p', 'BANXICO_TOKEN', 'tok-123'));
    await screen.findByText('BANXICO_TOKEN guardada en el servidor del proyecto.');
    expect(screen.queryByLabelText('BANXICO_TOKEN')).toBeNull();
    expect(document.body.textContent).not.toContain('tok-123');
  });

  it('sin base de datos lo explica y no ofrece guardar', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'listProjectSecrets').mockResolvedValue({
      server: 'none',
      secrets: [{ name: 'STRIPE_SECRET_KEY', status: 'missing', usedBy: ['pagos'] }],
    });
    render(<MissingSecretsCard projectId="p" checkKey={0} />);
    await screen.findByText(/no tiene base de datos/);
    expect(screen.queryByLabelText('STRIPE_SECRET_KEY')).toBeNull();
  });

  it('nada que falte: no aparece; "Ahora no" la oculta hasta el siguiente pedido', async () => {
    setForgeLang('es');
    const list = vi.spyOn(platformService, 'listProjectSecrets').mockResolvedValue({ server: 'ready', secrets: [] });
    const { container, rerender } = render(<MissingSecretsCard projectId="p" checkKey={0} />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(container.textContent).toBe('');

    list.mockResolvedValue({ server: 'ready', secrets: [{ name: 'OPENAI_API_KEY', status: 'missing', usedBy: ['chat'] }] });
    rerender(<MissingSecretsCard projectId="p" checkKey={1} />);
    await screen.findByText('OPENAI_API_KEY');
    await userEvent.click(screen.getByText('Ahora no'));
    expect(screen.queryByText('OPENAI_API_KEY')).toBeNull();

    rerender(<MissingSecretsCard projectId="p" checkKey={2} />);
    await screen.findByText('OPENAI_API_KEY');
  });
});

describe('Ajustes → Secretos', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lista por estado, reemplaza y borra sin mostrar valores; rechaza nombres SUPABASE_', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'checkPlatformServices').mockResolvedValue({});
    const list = vi.spyOn(platformService, 'listProjectSecrets').mockResolvedValue({
      server: 'ready',
      secrets: [
        { name: 'PERPLEXITY_API_KEY', status: 'missing', usedBy: ['ask'] },
        { name: 'STRIPE_SECRET_KEY', status: 'set', usedBy: ['pagos'] },
        { name: 'OLD_KEY', status: 'unused', usedBy: [] },
      ],
    });
    const set = vi.spyOn(platformService, 'setProjectSecret').mockResolvedValue();
    const del = vi.spyOn(platformService, 'deleteProjectSecret').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SecretsPanel projectId="p" />);

    await screen.findByText('PERPLEXITY_API_KEY');
    screen.getByText('Falta');
    screen.getByText('Configurada');
    screen.getByText('Configurada · ninguna función la usa');
    expect(list).toHaveBeenCalledWith('p');
    expect(screen.getAllByRole('button', { name: 'Reemplazar' })).toHaveLength(2);

    await userEvent.type(screen.getByLabelText('STRIPE_SECRET_KEY'), 'sk-nueva');
    await userEvent.click(screen.getAllByRole('button', { name: 'Reemplazar' })[0]);
    await waitFor(() => expect(set).toHaveBeenCalledWith('p', 'STRIPE_SECRET_KEY', 'sk-nueva'));

    await userEvent.click(screen.getByLabelText('Borrar OLD_KEY'));
    await waitFor(() => expect(del).toHaveBeenCalledWith('p', 'OLD_KEY'));

    await userEvent.type(screen.getByLabelText('NOMBRE (p. ej. PERPLEXITY_API_KEY)'), 'supabase_url');
    screen.getByText(/no puede empezar con SUPABASE_/);
  });
});
