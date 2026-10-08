import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BUSY_REASONS, firstBusy, markBusy, useBusy } from './busyRegistry';
import { es } from '@/i18n/forge/es';
import { en } from '@/i18n/forge/en';
import { ChatInterface } from '@/components/ChatInterface';
import { setForgeLang } from '@/i18n/forge/lang';

// 2026-10-08 (Samuel): "Chat" desde Código/Ajustes avisa si algo está a medias.

function Busy({ on }: { on: boolean }) {
  useBusy('publish', on);
  return null;
}

describe('busyRegistry', () => {
  it('sin nada en curso: null; con varios, gana el de más prioridad; al liberar, desaparece', () => {
    expect(firstBusy()).toBeNull();
    const releaseUpload = markBusy('upload');
    const releaseCode = markBusy('code');
    expect(firstBusy()).toBe('code');
    releaseCode();
    expect(firstBusy()).toBe('upload');
    releaseUpload();
    expect(firstBusy()).toBeNull();
  });

  it('useBusy sigue al estado y se libera al desmontar el panel', () => {
    const { rerender, unmount } = render(<Busy on={false} />);
    expect(firstBusy()).toBeNull();
    rerender(<Busy on />);
    expect(firstBusy()).toBe('publish');
    rerender(<Busy on={false} />);
    expect(firstBusy()).toBeNull();
    rerender(<Busy on />);
    unmount();
    expect(firstBusy()).toBeNull();
  });

  it('cada motivo tiene su aviso en español e inglés', () => {
    for (const r of BUSY_REASONS) {
      expect((es as Record<string, string>)[`studio.busy.${r}`], r).toBeTruthy();
      expect((en as Record<string, string>)[`studio.busy.${r}`], r).toBeTruthy();
    }
  });
});

describe('Barra que crece', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('es una caja de varias líneas: Shift+Enter hace salto de línea y Enter envía', async () => {
    setForgeLang('es');
    const onSend = vi.fn().mockResolvedValue({ success: true, modifiedFiles: [] });
    render(<ChatInterface isLoading={false} onSendMessage={onSend} selectedElement={null} projectId="p" />);
    const box = screen.getByPlaceholderText(/.+/) as HTMLTextAreaElement;
    expect(box.tagName).toBe('TEXTAREA');
    await userEvent.type(box, 'Primera línea{Shift>}{Enter}{/Shift}Segunda línea');
    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe('Primera línea\nSegunda línea');
    await userEvent.type(box, '{Enter}');
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0]).toBe('Primera línea\nSegunda línea');
  });
});
