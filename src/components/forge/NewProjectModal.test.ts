import { describe, it, expect } from 'vitest';
import { toPinnedPalette } from './NewProjectModal';

describe('NewProjectModal.toPinnedPalette (onboarding, bucket 5 ítem 2, mockup D)', () => {
  it('mapea las 6 columnas de `colors` a las 5 vars de DesignBrief en el orden de REQUIRED_BRAND_VARS', () => {
    const result = toPinnedPalette({
      primary: '#78350F',
      secondary: '#92400E',
      accent: '#FBBF24',
      background: '#FEF3C7',
      foreground: '#451A03',
      muted: '#FDE68A',
    });

    expect(result.map((c) => c.var)).toEqual([
      '--brand-bg',
      '--brand-fg',
      '--brand-primary',
      '--brand-accent',
      '--brand-muted',
    ]);
    expect(result.find((c) => c.var === '--brand-bg')?.hsl).toBe('48 96% 89%');
    expect(result.find((c) => c.var === '--brand-primary')?.hsl).toBe('22 78% 26%');
  });

  it('un hex vacío o inválido cae a un default seguro, nunca revienta', () => {
    const result = toPinnedPalette({
      primary: '',
      secondary: 'not-a-color',
      accent: '#FBBF24',
      background: '#FEF3C7',
      foreground: '#451A03',
      muted: '#FDE68A',
    });
    expect(result.find((c) => c.var === '--brand-primary')?.hsl).toBe('0 0% 30%');
  });
});
