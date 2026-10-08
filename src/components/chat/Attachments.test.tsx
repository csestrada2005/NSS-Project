import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInterface } from '../ChatInterface';
import { platformService, type ProjectAsset } from '../../services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';

// Bloque 3 (2026-10-07): adjuntar en el chat — fichas, aviso de créditos, envío
// con los adjuntos, y si la lectura falla vuelven adjuntos y texto (3A).

const pdf: ProjectAsset = {
  id: 'b', kind: 'document', public_url: 'https://cdn/p/menu.pdf', mime_type: 'application/pdf', size_bytes: 10,
  original_size: 10, original_name: 'menu.pdf', width: null, height: null, created_at: '2026-10-07',
};

const fileInput = (container: HTMLElement) =>
  container.querySelector('input[type="file"][accept*="application/pdf"]') as HTMLInputElement;

describe('Adjuntos del chat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('sube al elegir, avisa que gasta créditos y manda los adjuntos con el mensaje', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'uploadAsset').mockResolvedValue(pdf);
    const onSend = vi.fn().mockResolvedValue({ success: true, modifiedFiles: [] });
    const { container } = render(<ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p" />);

    await userEvent.upload(fileInput(container), new File(['%PDF-'], 'menu.pdf', { type: 'application/pdf' }));
    await screen.findByText('La IA lo leerá · gasta créditos');
    screen.getByText('menu.pdf');

    await userEvent.type(screen.getByPlaceholderText(/.+/), 'Haz el menú con este PDF{Enter}');
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0]).toBe('Haz el menú con este PDF');
    expect(onSend.mock.calls[0][4]).toEqual([pdf]);
    // Enviado: la ficha se va.
    await waitFor(() => expect(screen.queryByText('menu.pdf')).toBeNull());
  });

  it('si la lectura falla, vuelven la ficha y el texto para reintentar', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'uploadAsset').mockResolvedValue(pdf);
    const onSend = vi.fn().mockResolvedValue({ success: false, modifiedFiles: [], error: 'ATTACHMENT_READ_FAILED', errorReason: 'menu.pdf' });
    const { container } = render(<ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p" />);

    await userEvent.upload(fileInput(container), new File(['%PDF-'], 'menu.pdf', { type: 'application/pdf' }));
    await screen.findByText('La IA lo leerá · gasta créditos');
    const box = screen.getByPlaceholderText(/.+/) as HTMLInputElement;
    await userEvent.type(box, 'Haz el menú{Enter}');

    await screen.findByText('menu.pdf');
    await waitFor(() => expect(box.value).toBe('Haz el menú'));
  });

  it('una subida fallida se marca y no se envía', async () => {
    setForgeLang('es');
    vi.spyOn(platformService, 'uploadAsset').mockRejectedValue(new Error('formato no permitido: image/gif'));
    const onSend = vi.fn().mockResolvedValue({ success: true, modifiedFiles: [] });
    const { container } = render(<ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p" />);

    await userEvent.upload(fileInput(container), new File(['x'], 'foto.png', { type: 'image/png' }));
    await screen.findByText('No se pudo subir: formato no permitido: image/gif');
    await userEvent.type(screen.getByPlaceholderText(/.+/), 'hola{Enter}');
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][4]).toEqual([]);
  });

  it('elegir de Archivos: lo ya leído dice que no gasta créditos y se manda con el mensaje', async () => {
    setForgeLang('es');
    const leido = { ...pdf, id: 'r1', original_name: 'menu-viejo.pdf', public_url: '', has_reading: true };
    const foto: ProjectAsset = {
      id: 'f1', kind: 'image', public_url: 'https://cdn/p/hero.webp', mime_type: 'image/webp', size_bytes: 10,
      original_size: 10, original_name: 'hero.jpg', width: 800, height: 600, created_at: '2026-10-08',
    };
    vi.spyOn(platformService, 'listAssets').mockResolvedValue([leido, foto]);
    const onSend = vi.fn().mockResolvedValue({ success: true, modifiedFiles: [] });
    render(<ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p" />);

    await userEvent.click(screen.getByLabelText('Adjuntar'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Elegir de Archivos' }));
    const picker = await screen.findByRole('dialog', { name: 'Elegir de Archivos' });
    await within(picker).findByText('menu-viejo.pdf');
    within(picker).getByText('Ya leído · no gasta créditos');
    within(picker).getByText('La IA la mirará · gasta créditos');
    expect(within(picker).getByRole('button', { name: 'Adjuntar (0)' })).toHaveProperty('disabled', true);

    await userEvent.click(within(picker).getByRole('button', { name: /menu-viejo\.pdf/ }));
    await userEvent.click(within(picker).getByRole('button', { name: 'Adjuntar (1)' }));
    expect(screen.queryByRole('dialog', { name: 'Elegir de Archivos' })).toBeNull();
    screen.getByText('Ya leído · no gasta créditos');

    await userEvent.type(screen.getByPlaceholderText(/.+/), 'Agrega los postres{Enter}');
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][4]).toEqual([leido]);
  });

  it('sin proyecto el clip queda inerte', () => {
    setForgeLang('es');
    render(<ChatInterface isLoading={false} onSendMessage={vi.fn()} selectedElement={null} />);
    expect((screen.getByLabelText('Adjuntar') as HTMLButtonElement).disabled).toBe(true);
  });
});
