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
  it('dibuja una tabla de verdad, sin barras ni separadores (2026-10-08)', () => {
    const md = 'Aquí están los precios:\n\n| Expedición | Duración | Precio |\n|---|---|---|\n' +
      '| Ascenso Pico de Orizaba | 3 días | $8,900 MXN |\n| Parapente en Valle de Bravo | — | **$2,300 MXN** |\n\nTodos por persona.';
    const { container } = render(<MiniMarkdown text={md} />);
    const table = container.querySelector('table.fc-tabla')!;
    expect(table).not.toBeNull();
    expect([...table.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Expedición', 'Duración', 'Precio']);
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(rows).toEqual([
      ['Ascenso Pico de Orizaba', '3 días', '$8,900 MXN'],
      ['Parapente en Valle de Bravo', '—', '$2,300 MXN'],
    ]);
    expect(table.querySelector('strong')?.textContent).toBe('$2,300 MXN');
    expect(container.textContent).not.toMatch(/\||---/);
    // Lo de antes y después de la tabla sigue como párrafo.
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('una tabla sin fila separadora no tiene encabezado, pero sigue siendo tabla', () => {
    const { container } = render(<MiniMarkdown text={'| a | b |\n| c | d |'} />);
    expect(container.querySelector('th')).toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

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
