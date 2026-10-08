import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanCard } from './ResultCards';
import { setForgeLang } from '@/i18n/forge/lang';

// "Revisar" (2026-10-08): abre el plan en grande, editable; lo enviado va a onEdit.

const STEPS = [
  { order: 1, description: 'Rediseñar las tarjetas de expediciones', file_path: 'src/components/Card.tsx', action: 'modify' as const },
  { order: 2, description: 'Cambiar los botones', file_path: 'src/components/ui/button.tsx', action: 'modify' as const },
];

describe('PlanCard — Revisar', () => {
  it('abre el plan editable y envía la versión del usuario', async () => {
    setForgeLang('es');
    const onEdit = vi.fn();
    render(<PlanCard steps={STEPS} onApprove={vi.fn()} onReject={vi.fn()} onEdit={onEdit} onOpenHistory={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    const dialog = await screen.findByRole('alertdialog');
    within(dialog).getByText('Revisar el plan');
    const box = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    expect(box.tagName).toBe('TEXTAREA');
    expect(box.value).toBe('1. Rediseñar las tarjetas de expediciones\n2. Cambiar los botones');

    await userEvent.type(box, '{Enter}De las 3 opciones aplica A');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar cambios' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(
      '1. Rediseñar las tarjetas de expediciones\n2. Cambiar los botones\nDe las 3 opciones aplica A'
    ));
  });

  it('sin onEdit el botón sigue desactivado', () => {
    setForgeLang('es');
    render(<PlanCard steps={STEPS} onApprove={vi.fn()} onReject={vi.fn()} onOpenHistory={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Revisar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
