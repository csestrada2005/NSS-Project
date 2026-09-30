import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UltimoMensajeCard } from './ResultCards';
import { setForgeLang } from '@/i18n/forge/lang';

// Check de Samuel (2026-09-30): al abrir un proyecto el modal sólo mostraba
// la barra de escribir y no había forma de llegar al historial.
describe('UltimoMensajeCard', () => {
  it('muestra el último mensaje sin datos inventados y abre el historial', async () => {
    setForgeLang('es');
    const onOpenHistory = vi.fn();
    const { container } = render(
      <UltimoMensajeCard text="Listo. Cambié 4 archivos: ContactSection, WhyUsSection, StaggerChildren, Header" onOpenHistory={onOpenHistory} />
    );
    expect(container.textContent).toMatch(/Cambié 4 archivos: ContactSection/);
    expect(container.textContent).not.toMatch(/\d+s\b|archivos? modificados?/);
    await userEvent.click(screen.getByRole('button', { name: 'Ver historial completo' }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });
});
