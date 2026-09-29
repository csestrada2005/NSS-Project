import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypeErrorsCard, buildTypeFixPrompt } from './ResultCards';
import { setForgeLang } from '@/i18n/forge/lang';

const errors = [
  { file: 'src/components/InviteUserForm.tsx', line: 30, column: 18, code: 2339, message: "Property 'error' does not exist on type 'AppUser'." },
  { file: 'src/pages/AdminPanel.tsx', line: 170, column: 17, code: 2322, message: "Property 'onCancel' does not exist on type '{ onSuccess?: () => void; }'." },
];

describe('TypeErrorsCard (bucket 6)', () => {
  it('cuenta los errores, despliega la lista y "Arreglar ahora" manda el pedido con los errores exactos', async () => {
    setForgeLang('es');
    const onFix = vi.fn();
    render(<TypeErrorsCard errors={errors} isLoading={false} onFix={onFix} />);

    expect(screen.getByText('Hay 2 errores de tipos que impedirían publicar.')).toBeInTheDocument();
    expect(screen.queryByText(/InviteUserForm\.tsx:30/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver los errores' }));
    expect(screen.getByText(/InviteUserForm\.tsx:30/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Arreglar ahora' }));
    expect(onFix).toHaveBeenCalledTimes(1);
    const prompt = onFix.mock.calls[0][0] as string;
    expect(prompt).toMatch(/^Arregla estos errores de tipos/);
    expect(prompt).toContain("- src/components/InviteUserForm.tsx(30,18): TS2339 Property 'error' does not exist on type 'AppUser'.");
    expect(prompt).toContain('- src/pages/AdminPanel.tsx(170,17): TS2322');
  });

  it('el botón se apaga mientras corre otra petición', () => {
    setForgeLang('es');
    render(<TypeErrorsCard errors={errors} isLoading={true} onFix={() => {}} />);
    expect(screen.getByRole('button', { name: /Arreglar ahora/ })).toBeDisabled();
  });

  it('el pedido sale en el idioma de la interfaz', () => {
    setForgeLang('en');
    expect(buildTypeFixPrompt(errors)).toMatch(/^Fix these TypeScript type errors/);
    setForgeLang('es');
  });
});
