import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPanel, formatBytes } from './AssetsPanel';
import { platformService } from '../../services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';

// Archivos del proyecto (bloque 1, 2026-10-05).
describe('AssetsPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lista los archivos con el ahorro del transformador y su dirección para copiar', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'listAssets').mockResolvedValue([
      {
        id: 'a1', kind: 'image', public_url: 'https://x/project-assets/p/ab-hero.webp', mime_type: 'image/webp',
        size_bytes: 380 * 1024, original_size: Math.round(4.2 * 1024 * 1024), original_name: 'hero.jpg', width: 2560, height: 1440,
        created_at: '2026-10-05T10:00:00Z',
      },
      {
        id: 'a2', kind: 'document', public_url: 'https://x/project-assets/p/cd-menu.pdf', mime_type: 'application/pdf',
        size_bytes: 120 * 1024, original_size: 120 * 1024, original_name: 'menu.pdf', width: null, height: null,
        created_at: '2026-10-05T10:01:00Z',
      },
    ]);
    render(<AssetsPanel projectId="p" />);
    expect(await screen.findByText('hero.jpg')).toBeInTheDocument();
    expect(screen.getByText(/4\.2 MB → 380 KB \(−91%\) · 2560×1440/)).toBeInTheDocument();
    expect(screen.getByText('menu.pdf')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Copiar dirección/ })).toHaveLength(2);
    expect(screen.getByText(/no usa IA ni gasta créditos/)).toBeInTheDocument();
  });

  it('PDF privado: se ve con dirección temporal y se hace público sólo tras confirmar', async () => {
    setForgeLang('es');
    const doc = {
      id: 'd1', kind: 'document' as const, public_url: '', mime_type: 'application/pdf',
      size_bytes: 1024, original_size: 1024, original_name: 'contrato.pdf', width: null, height: null,
      created_at: '2026-10-08T10:00:00Z',
    };
    vi.spyOn(platformService, 'listAssets').mockResolvedValue([doc]);
    const getUrl = vi.spyOn(platformService, 'getAssetUrl').mockResolvedValue('https://signed/contrato.pdf?token=t');
    const setVis = vi.spyOn(platformService, 'setAssetVisibility')
      .mockResolvedValue({ ...doc, public_url: 'https://x/project-assets/p/contrato.pdf' });
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    render(<AssetsPanel projectId="p" />);

    await screen.findByText('Privado · sólo la IA lo lee');
    // Privado: no hay dirección para copiar.
    expect(screen.queryByRole('button', { name: /Copiar dirección/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await waitFor(() => expect(tab.location.href).toBe('https://signed/contrato.pdf?token=t'));
    expect(getUrl).toHaveBeenCalledWith('p', 'd1');
    expect(tab.opener).toBeNull();

    // Hacer público pide confirmación; Cancelar no cambia nada.
    await userEvent.click(screen.getByRole('button', { name: 'Hacer público' }));
    let dialog = await screen.findByRole('alertdialog');
    within(dialog).getByRole('heading', { name: '¿Hacer público "contrato.pdf"?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(setVis).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Hacer público' }));
    dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hacer público' }));
    await screen.findByText('Público · el sitio puede enlazarlo');
    expect(setVis).toHaveBeenCalledWith('p', 'd1', 'public');
    screen.getByRole('button', { name: /Copiar dirección/ });
    screen.getByRole('button', { name: 'Hacer privado' });
  });

  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
