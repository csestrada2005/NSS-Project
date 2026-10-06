import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaviconPicker } from './FaviconPicker';
import { platformService, type ProjectAsset } from '../../services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';

// Bloque 2 (2026-10-06): el ícono propio se cambia y se quita desde Publicar.

const asset: ProjectAsset = {
  id: 'f1', kind: 'favicon', public_url: 'https://cdn/p/favicon-logo.png', mime_type: 'image/png',
  size_bytes: 900, original_size: 4000, original_name: 'logo.png', width: 512, height: 512, created_at: '2026-10-06',
};

describe('FaviconPicker', () => {
  afterEach(() => vi.restoreAllMocks());

  it('del automático a uno propio y de vuelta, avisando que se ve al publicar', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'getFavicon').mockResolvedValue(null);
    const upload = vi.spyOn(platformService, 'uploadFavicon').mockResolvedValue(asset);
    const remove = vi.spyOn(platformService, 'deleteFavicon').mockResolvedValue();
    const { container } = render(<FaviconPicker projectId="p" autoSvg="<svg/>" />);

    await screen.findByText(/Automático/);
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.queryByText(/Volver al automático/)).toBeNull();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['x'], 'logo.png', { type: 'image/png' }));
    await screen.findByText('Tu ícono: logo.png');
    expect(upload).toHaveBeenCalledWith('p', expect.objectContaining({ name: 'logo.png', type: 'image/png' }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(asset.public_url);
    screen.getByText(/próxima vez que pulses Publicar/);

    await userEvent.click(screen.getByText('Volver al automático'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('p'));
    await screen.findByText(/Automático/);
  });

  it('si falla la subida, lo dice y conserva el ícono actual', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'getFavicon').mockResolvedValue(asset);
    vi.spyOn(platformService, 'uploadFavicon').mockRejectedValue(new Error('formato no permitido: image/gif'));
    const { container } = render(<FaviconPicker projectId="p" />);
    await screen.findByText('Tu ícono: logo.png');
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'a.png', { type: 'image/png' }));
    await screen.findByText('No se pudo cambiar el ícono: formato no permitido: image/gif');
    screen.getByText('Tu ícono: logo.png');
  });
});
