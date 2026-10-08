import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodePanel } from './CodePanel';
import { setForgeLang } from '@/i18n/forge/lang';

// 2026-10-08 (Samuel): "Descartar cambios" en Código, sólo con cambios sin
// guardar; pide confirmación y deja el archivo como estaba guardado.

const files = new Map([['src/App.tsx', 'export default function App() { return null; }\n']]);
const props = (content: string, onCodeEdit = vi.fn()) => ({
  files, selectedFilePath: 'src/App.tsx', selectedFileContent: content, onFileSelect: vi.fn(), onCodeEdit,
  onSaveAndRun: vi.fn(), isSaving: false, onDownloadZip: vi.fn(), isGenerating: false, projectId: null,
});

describe('Descartar cambios en Código', () => {
  it('sin cambios no aparece', () => {
    setForgeLang('es');
    render(<CodePanel {...props(files.get('src/App.tsx')!)} />);
    expect(screen.queryByRole('button', { name: 'Descartar cambios' })).toBeNull();
  });

  it('con cambios aparece, confirma y vuelve a lo guardado', async () => {
    setForgeLang('es');
    const onCodeEdit = vi.fn();
    render(<CodePanel {...props('export default function App() { return <h1>x</h1>; }\n', onCodeEdit)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    const dialog = await screen.findByRole('alertdialog');
    within(dialog).getByText('¿Descartar los cambios?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar cambios' }));
    await waitFor(() => expect(onCodeEdit).toHaveBeenCalledWith(files.get('src/App.tsx')));
  });
});
