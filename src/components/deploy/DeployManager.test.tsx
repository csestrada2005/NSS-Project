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

const neverDeployed = () =>
  vi.spyOn(platformService, 'getDeploymentStatus').mockResolvedValue({ url: null, lastDeployedAt: null, status: 'never' });

describe('DeployManager — arreglar y volver a publicar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('lista los errores de Vercel, arregla y republica con los archivos nuevos', async () => {
    setForgeLang('es');
    neverDeployed();
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

    await userEvent.click(await screen.findByRole('button', { name: /Publicar/ }));
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
    neverDeployed();
    const deploy = vi.spyOn(platformService, 'deployProject')
      .mockResolvedValueOnce({ error: 'typecheck', typeErrors, inspectorUrl: null });
    const onFix = vi.fn(async () => ({ success: true, changed: 0 }));
    render(<DeployManager files={new Map([['src/A.tsx', 'roto']])} projectId="p" onFixTypeErrors={onFix} />);

    await userEvent.click(await screen.findByRole('button', { name: /Publicar/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Arreglar ahora/ }));
    expect(await screen.findByText(/no pudo arreglar estos errores/)).toBeInTheDocument();
    expect(deploy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/src\/A\.tsx:3/)).toBeInTheDocument();
  });

  it('un proyecto ya publicado muestra su URL y "Actualizar" publica los cambios en la misma', async () => {
    setForgeLang('es');
    const url = 'https://nebu-p.vercel.app';
    vi.spyOn(platformService, 'getDeploymentStatus')
      .mockResolvedValue({ url, lastDeployedAt: new Date(Date.now() - 5 * 60000).toISOString(), status: 'deployed' });
    const deploy = vi.spyOn(platformService, 'deployProject').mockResolvedValue({ url });
    render(<DeployManager files={new Map([['src/A.tsx', 'cambio nuevo']])} projectId="p" />);

    expect(await screen.findByText(url)).toBeInTheDocument();
    expect(screen.getByText(/Última publicación: hace 5 min/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Actualizar/ }));
    await waitFor(() => expect(deploy).toHaveBeenCalledTimes(1));
    expect(deploy.mock.calls[0][1]).toEqual({ 'src/A.tsx': 'cambio nuevo' });
    expect(await screen.findByText('¡Publicado correctamente!')).toBeInTheDocument();
  });

  it('mientras no sabe si ya se publicó dice "Revisando…", nunca "Publicar"; al reabrir, "Actualizar" al instante', async () => {
    setForgeLang('es');
    const url = 'https://nebu-p.vercel.app';
    let answer: (v: { url: string; lastDeployedAt: string; status: string }) => void = () => {};
    const status = vi.spyOn(platformService, 'getDeploymentStatus')
      .mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    const first = render(<DeployManager files={new Map()} projectId="p" />);

    const checking = screen.getByRole('button', { name: /Revisando/ });
    expect(checking).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Publicar$/ })).toBeNull();
    answer({ url, lastDeployedAt: new Date().toISOString(), status: 'deployed' });
    expect(await screen.findByRole('button', { name: /Actualizar/ })).toBeEnabled();
    first.unmount();

    // Segunda vez en la sesión: el servidor aún no contesta, pero ya se sabe.
    status.mockImplementation(() => new Promise(() => {}));
    render(<DeployManager files={new Map()} projectId="p" />);
    expect(screen.getByRole('button', { name: /Actualizar/ })).toBeEnabled();
    expect(screen.getByText(url)).toBeInTheDocument();
  });

  it('un proyecto nunca publicado pasa de "Revisando…" a "Publicar"', async () => {
    setForgeLang('es');
    neverDeployed();
    render(<DeployManager files={new Map()} projectId="nuevo" />);
    expect(screen.getByRole('button', { name: /Revisando/ })).toBeDisabled();
    expect(await screen.findByRole('button', { name: /Publicar/ })).toBeEnabled();
  });
});
