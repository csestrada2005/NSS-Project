import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeployManager } from './DeployManager';
import { platformService } from '../../services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';
import { isTypeFixRequest } from '@/utils/laneRouting';

// "Arreglar ahora" desde Publicar (2026-09-30): el arreglo corre en la misma
// pestaña y, si cambió archivos, se vuelve a publicar CON LOS ARCHIVOS NUEVOS.

const typeErrors = [{ file: 'src/A.tsx', line: 3, column: 5, code: 2339, message: "Property 'x' does not exist." }];

describe('DeployManager — arreglar y volver a publicar', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lista los errores de Vercel, arregla y republica con los archivos nuevos', async () => {
    setForgeLang('es');
    const deploy = vi.spyOn(platformService, 'deployProject')
      .mockResolvedValueOnce({ error: 'typecheck', typeErrors, inspectorUrl: 'https://vercel.com/log' })
      .mockResolvedValueOnce({ url: 'https://nebu-p.vercel.app' });

    let rerenderWith: (files: Map<string, string>) => void = () => {};
    const onFix = vi.fn(async (prompt: string, onProgress: (p: { step: number; total: number; summary?: string }) => void) => {
      expect(isTypeFixRequest(prompt)).toBe(true);
      onProgress({ step: 1, total: 1, summary: 'Corrige A' });
      rerenderWith(new Map([['src/A.tsx', 'arreglado']])); // el editor recibe el arreglo
      return { success: true, changed: 1 };
    });

    const ui = (files: Map<string, string>) => <DeployManager files={files} projectId="p" onFixTypeErrors={onFix} />;
    const { rerender } = render(ui(new Map([['src/A.tsx', 'roto']])));
    rerenderWith = (files) => rerender(ui(files));

    await userEvent.click(screen.getByRole('button', { name: /Publicar/ }));
    expect(await screen.findByText(/src\/A\.tsx:3/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver el log de Vercel/ })).toHaveAttribute('href', 'https://vercel.com/log');

    await userEvent.click(screen.getByRole('button', { name: /Arreglar ahora/ }));
    await waitFor(() => expect(deploy).toHaveBeenCalledTimes(2));
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(deploy.mock.calls[1][1]).toEqual({ 'src/A.tsx': 'arreglado' });
    expect(await screen.findByText('¡Publicado correctamente!')).toBeInTheDocument();
  });

  it('si el arreglo no cambió nada, no republica y deja los errores a la vista', async () => {
    setForgeLang('es');
    const deploy = vi.spyOn(platformService, 'deployProject')
      .mockResolvedValueOnce({ error: 'typecheck', typeErrors, inspectorUrl: null });
    const onFix = vi.fn(async () => ({ success: true, changed: 0 }));
    render(<DeployManager files={new Map([['src/A.tsx', 'roto']])} projectId="p" onFixTypeErrors={onFix} />);

    await userEvent.click(screen.getByRole('button', { name: /Publicar/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Arreglar ahora/ }));
    expect(await screen.findByText(/no pudo arreglar estos errores/)).toBeInTheDocument();
    expect(deploy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/src\/A\.tsx:3/)).toBeInTheDocument();
  });
});
