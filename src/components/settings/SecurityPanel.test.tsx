import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecurityPanel } from './SecurityPanel';
import { platformService } from '../../services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';

// Agente de seguridad — S1 (2026-10-01).
describe('SecurityPanel', () => {
  afterEach(() => vi.restoreAllMocks());

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
});
