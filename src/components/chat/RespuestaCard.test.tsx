import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RespuestaCard } from './ResultCards';
import { MiniMarkdown } from './MiniMarkdown';
import { setForgeLang } from '@/i18n/forge/lang';

// Respuesta real de la prueba de Samuel (2026-09-30): antes la tarjeta decía
// "0 archivos modificados" y el texto sólo se veía en el historial.
const ANSWER = `La página de inicio (\`src/pages/Index.tsx\`) tiene 4 secciones:

- **HeroSection** → \`src/components/sections/HeroSection.tsx\`
- **ContactSection** → \`src/components/sections/ContactSection.tsx\`

Todas se renderizan en orden dentro de \`Index.tsx\`.`;

describe('RespuestaCard (5.0)', () => {
  it('muestra el texto de la IA con formato, sin "archivos modificados"', () => {
    setForgeLang('es');
    const { container } = render(
      <RespuestaCard text={ANSWER} isLoading={false} onSuggestedAction={() => {}} onOpenHistory={() => {}} />
    );
    expect(screen.getByText('HeroSection').tagName).toBe('STRONG');
    expect(screen.getByText('src/pages/Index.tsx').tagName).toBe('CODE');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.textContent).not.toMatch(/archivos? modificados?/);
    expect(screen.getByRole('button', { name: 'Ver historial completo' })).toBeInTheDocument();
  });

  it('la acción sugerida por la IA aparece como botón y se envía tal cual', async () => {
    const onSuggestedAction = vi.fn();
    render(
      <RespuestaCard
        text="Puedes agregar un mapa."
        suggestedAction="Agrega un mapa en la sección de contacto"
        isLoading={false}
        onSuggestedAction={onSuggestedAction}
        onOpenHistory={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Agrega un mapa en la sección de contacto' }));
    expect(onSuggestedAction).toHaveBeenCalledWith('Agrega un mapa en la sección de contacto');
  });
});

describe('MiniMarkdown', () => {
  it('nunca interpreta HTML del modelo', () => {
    const { container } = render(<MiniMarkdown text={'<img src=x onerror=alert(1)> **ok**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('párrafos separados por línea en blanco', () => {
    const { container } = render(<MiniMarkdown text={'uno\n\ndos'} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});
