import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from './SettingsModal';
import { markBusy } from '@/utils/busyRegistry';
import { wyrdToast } from '@/utils/wyrdToast';
import { setForgeLang } from '@/i18n/forge/lang';

// 2026-10-08 (Samuel): publicar y luego irse a Seguridad cortaba la
// publicación. Con algo a medias, las pestañas de Ajustes no cambian y avisan.

const tab = (name: string) => screen.getByRole('button', { name });
const isActive = (el: HTMLElement) => el.className.includes('bg-accent text-foreground');

describe('Pestañas de Ajustes con algo a medias', () => {
  afterEach(() => vi.restoreAllMocks());

  it('publicando: no cambia de pestaña y avisa; al terminar, sí cambia', async () => {
    setForgeLang('es');
    const toast = vi.spyOn(wyrdToast, 'message').mockImplementation(() => 0 as never);
    render(<SettingsModal onClose={() => {}} fileTree={[]} files={new Map()} projectId={null} initialTab="github" />);
    expect(isActive(tab('GitHub'))).toBe(true);

    const release = markBusy('publish');
    await userEvent.click(tab('Seguridad'));
    expect(isActive(tab('GitHub'))).toBe(true);
    expect(toast).toHaveBeenCalledWith('Espera a que termine la publicación');

    release();
    await userEvent.click(tab('Seguridad'));
    expect(isActive(tab('Seguridad'))).toBe(true);
  });
});
