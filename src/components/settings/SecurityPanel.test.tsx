import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecurityPanel } from './SecurityPanel';
import { platformService } from '../../services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';

// Agente de seguridad — S1 (2026-10-01).
describe('SecurityPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('lista lo grave primero, en español, con su explicación', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'securityCheck').mockResolvedValue({
      database: 'checked',
      checkedAt: new Date().toISOString(),
      findings: [
        { severity: 'aviso', kind: 'public_insert_privileged', table: 'recomendaciones', policy: 'public insert', columns: ['status'] },
        { severity: 'grave', kind: 'public_pii_read', table: 'newsletter_subscribers', policy: 'allow_public_select', columns: ['email'] },
      ],
    });
    render(<SecurityPanel projectId="p" />);
    await userEvent.click(screen.getByRole('button', { name: /Chequeo de seguridad/ }));
    expect(await screen.findByText(/1 graves · 1 avisos/)).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items[0]).toMatch(/Grave · Cualquiera puede leer datos personales de "newsletter_subscribers" \(email\)/);
    expect(items[1]).toMatch(/Aviso · Cualquiera puede insertar en "recomendaciones" eligiendo status/);
    expect(items[1]).toMatch(/saltarse la moderación/);
    expect(screen.getByRole('button', { name: /Volver a revisar/ })).toBeInTheDocument();
  });

  it('sin base de datos lo dice; sin hallazgos dice "Sin amenazas"', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'securityCheck').mockResolvedValue({ database: 'none', checkedAt: new Date().toISOString(), findings: [] });
    render(<SecurityPanel projectId="p" />);
    await userEvent.click(screen.getByRole('button', { name: /Chequeo de seguridad/ }));
    expect(await screen.findByText(/no tiene base de datos: sólo se revisó el código/)).toBeInTheDocument();
    expect(screen.getByText(/Sin amenazas/)).toBeInTheDocument();
  });

  it('si el chequeo falla, lo dice sin romper la pestaña', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'securityCheck').mockRejectedValue(new Error('HTTP 503'));
    render(<SecurityPanel projectId="p" />);
    await userEvent.click(screen.getByRole('button', { name: /Chequeo de seguridad/ }));
    expect(await screen.findByText(/No se pudo hacer el chequeo: HTTP 503/)).toBeInTheDocument();
  });

  // S2 — estado guardado, aviso de cambios y "Arreglar".
  const FILES = new Map([['src/App.tsx', 'x']]);
  const RESULT = {
    database: 'checked',
    checkedAt: new Date().toISOString(),
    findings: [{ severity: 'grave' as const, kind: 'public_pii_read', table: 'app_users', policy: 'wyrd_public_read', columns: ['email'] }],
  };

  it('al abrir muestra el último chequeo sin pulsar nada, y avisa si el proyecto cambió después', async () => {
    setForgeLang('es');
    const check = vi.spyOn(platformService, 'securityCheck').mockResolvedValue(RESULT);
    const first = render(<SecurityPanel projectId="p" files={FILES} />);
    await userEvent.click(screen.getByRole('button', { name: /Chequeo de seguridad/ }));
    await screen.findByText(/1 graves · 0 avisos/);
    first.unmount();

    render(<SecurityPanel projectId="p" files={FILES} />);
    expect(screen.getByText(/1 graves · 0 avisos/)).toBeInTheDocument();
    expect(screen.queryByText(/antes de los últimos cambios/)).toBeNull();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('si los archivos cambiaron desde el chequeo, dice "vuelve a revisar"', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'securityCheck').mockResolvedValue(RESULT);
    const first = render(<SecurityPanel projectId="p" files={FILES} />);
    await userEvent.click(screen.getByRole('button', { name: /Chequeo de seguridad/ }));
    await screen.findByText(/1 graves/);
    first.unmount();
    render(<SecurityPanel projectId="p" files={new Map([['src/App.tsx', 'cambiado']])} />);
    expect(screen.getByText(/Este chequeo se hizo antes de los últimos cambios\. Vuelve a revisar\./)).toBeInTheDocument();
  });

  it('"Arreglar" manda el pedido de seguridad y, si sólo cambió código, vuelve a revisar solo', async () => {
    setForgeLang('es');
    const check = vi.spyOn(platformService, 'securityCheck')
      .mockResolvedValueOnce(RESULT)
      .mockResolvedValueOnce({ ...RESULT, findings: [] });
    const onFix = vi.fn(async (prompt: string) => {
      expect(prompt).toMatch(/^Arregla estos problemas de seguridad del proyecto/);
      expect(prompt).toMatch(/policy "wyrd_public_read" lets ANYONE \(anon\) read personal columns \(email\)/);
      return { success: true, changed: 1 };
    });
    render(<SecurityPanel projectId="p" files={FILES} onFix={onFix} />);
    await userEvent.click(screen.getByRole('button', { name: /Chequeo de seguridad/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Arreglar$/ }));
    expect(await screen.findByText(/Sin amenazas/)).toBeInTheDocument();
    expect(screen.getByText(/Antes: 1 hallazgos/)).toBeInTheDocument();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('con una migración pendiente, la tarjeta de aplicar aparece en la pestaña y "Arreglar" se oculta', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'securityCheck').mockResolvedValue(RESULT);
    const proposal = {
      paths: ['supabase/migrations/20261001120000_secure_app_users.sql'],
      key: 'supabase/migrations/20261001120000_secure_app_users.sql',
      messageIndex: 0, outcome: null, outcomeMessageIndex: null, state: 'executable' as const,
    };
    render(<SecurityPanel projectId="p" files={FILES} onFix={async () => ({ success: true, changed: 1 })}
      ddl={{ proposal, getMessages: () => [], onOutcome: () => {} }} />);
    await userEvent.click(screen.getByRole('button', { name: /Chequeo de seguridad/ }));
    expect(await screen.findByText(/Aplica el cambio en la base de datos para terminar/)).toBeInTheDocument();
    expect(screen.getAllByText(/20261001120000_secure_app_users\.sql/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Arreglar$/ })).toBeNull();
  });
});
