import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
