import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { wyrdConfirm, wyrdPrompt } from './wyrdDialog';
import { setForgeLang } from '@/i18n/forge/lang';

// Ventanas propias de Wyrd en lugar de "<dominio> says…" del navegador (2026-10-08).

const gone = () => waitFor(() => expect(document.querySelector('[data-wyrd-dialog]')).toBeNull());

describe('wyrdConfirm / wyrdPrompt', () => {
  afterEach(() => vi.restoreAllMocks());

  it('confirmar: título desde el mensaje, botón propio y responde true', async () => {
    setForgeLang('es');
    const answer = wyrdConfirm({ message: '¿Borrar X?\n\nNo se puede deshacer.', confirmLabel: 'Borrar', danger: true });
    const dialog = await screen.findByRole('alertdialog');
    within(dialog).getByRole('heading', { name: '¿Borrar X?' });
    within(dialog).getByText('No se puede deshacer.');
    // Destructivo: el foco empieza en Cancelar (Enter no borra por accidente).
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar' }));
    expect(await answer).toBe(true);
    await gone();
  });

  it('Cancelar, Escape y clic fuera responden false', async () => {
    setForgeLang('es');
    let answer = wyrdConfirm({ message: '¿Seguro?' });
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(await answer).toBe(false);
    await gone();

    answer = wyrdConfirm({ message: '¿Seguro?' });
    await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    expect(await answer).toBe(false);
    await gone();
  });

  it('pedir un texto: devuelve lo escrito, o null si se cancela', async () => {
    setForgeLang('es');
    let answer = wyrdPrompt({ message: 'Nombre del paquete', confirmLabel: 'Instalar' });
    let dialog = await screen.findByRole('alertdialog');
    const input = within(dialog).getByRole('textbox');
    expect(document.activeElement).toBe(input);
    expect(within(dialog).getByRole('button', { name: 'Instalar' })).toHaveProperty('disabled', true);
    await userEvent.type(input, 'framer-motion{Enter}');
    expect(await answer).toBe('framer-motion');
    await gone();

    answer = wyrdPrompt({ message: 'Nombre del paquete' });
    dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(await answer).toBeNull();
    await gone();
  });
});
