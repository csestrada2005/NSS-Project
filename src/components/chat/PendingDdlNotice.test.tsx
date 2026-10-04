import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DDLCard, PendingDdlActions, PendingDdlNotice } from './ResultCards';
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
    expect(screen.getByText(/No se ejecuta nada en tu base de datos y se borra el archivo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onDismiss).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// 2026-10-01 (Samuel): con "Revisar" abierto, Ocultar / Descartar viven en la
// fila de la tarjeta DDL, junto a "Aplicar"; en una tarjeta DDL normal, no.
describe('DDLCard + PendingDdlActions', () => {
  const proposal = {
    paths: ['supabase/migrations/20261001075237_create_newsletter_subscribers.sql'],
    key: 'supabase/migrations/20261001075237_create_newsletter_subscribers.sql',
    messageIndex: 0,
    outcome: null,
    outcomeMessageIndex: null,
    state: 'executable' as const,
  };
  const base = {
    bodyText: 'Done.',
    proposal,
    projectId: 'p',
    isLoading: false,
    getMessages: () => [],
    onOutcome: () => {},
    filesCount: 1,
    durationSeconds: 3,
    steps: [],
    completedCount: 0,
    onOpenHistory: () => {},
  };

  it('abierta desde "Revisar": Ocultar y Descartar en la misma fila que Aplicar', async () => {
    setForgeLang('es');
    const onHide = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <DDLCard {...base} hideHistory extraActions={<PendingDdlActions onHide={onHide} onDismiss={onDismiss} />} />
    );
    const row = container.querySelector('.fc-accion-fila')!;
    const labels = [...row.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Ocultar', 'Descartar']));
    expect(labels.some((l) => /Aplicar/.test(l ?? ''))).toBe(true);
    expect(labels).not.toContain('Ver historial completo');

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(onHide).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('tarjeta DDL normal (migración del último pedido): sin Ocultar ni Descartar', () => {
    setForgeLang('es');
    render(<DDLCard {...base} />);
    expect(screen.queryByRole('button', { name: 'Ocultar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver historial completo' })).toBeInTheDocument();
  });

  it('migración del último pedido: "No aplicar" (con confirmación) junto a Aplicar, sin Ocultar', async () => {
    setForgeLang('es');
    const onDismiss = vi.fn();
    render(<DDLCard {...base} extraActions={<PendingDdlActions onDismiss={onDismiss} dismissLabel="No aplicar" />} />);
    expect(screen.queryByRole('button', { name: 'Ocultar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver historial completo' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'No aplicar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('el aviso del turno (guardia de datos personales) se ve en la tarjeta', () => {
    setForgeLang('es');
    render(<DDLCard {...base} warning='No dejé abiertos los datos personales de "newsletter_subscribers" (email).' />);
    expect(screen.getByText(/No dejé abiertos los datos personales de "newsletter_subscribers"/)).toBeInTheDocument();
  });
});
