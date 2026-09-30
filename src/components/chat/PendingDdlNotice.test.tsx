import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingDdlNotice } from './ResultCards';
import { setForgeLang } from '@/i18n/forge/lang';

// Check de Samuel en Crumb (2026-09-30): una migración vieja sin aplicar tapaba
// el resultado de cada pedido nuevo. Ahora es un aviso chico.
const PATHS = ['supabase/migrations/20260912081021_create_user_profiles.sql'];

describe('PendingDdlNotice', () => {
  it('nombra la migración y "Revisar" abre/cierra su tarjeta', async () => {
    setForgeLang('es');
    const onToggleReview = vi.fn();
    render(<PendingDdlNotice paths={PATHS} reviewOpen={false} onToggleReview={onToggleReview} onDismiss={() => {}} />);
    expect(screen.getByText(/migración pendiente de un cambio anterior: 20260912081021_create_user_profiles\.sql/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(onToggleReview).toHaveBeenCalledTimes(1);
  });

  it('"Descartar" pide confirmación; "Cancelar" no descarta', async () => {
    setForgeLang('es');
    const onDismiss = vi.fn();
    render(<PendingDdlNotice paths={PATHS} reviewOpen={false} onToggleReview={() => {}} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.getByText(/sin ejecutar nada en tu base de datos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onDismiss).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
