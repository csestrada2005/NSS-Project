import { describe, it, expect } from 'vitest';
import { DesignBriefService, applyPaletteHints, type PoolImage, type DesignBrief } from './DesignBriefService';

const BASE_BRIEF: DesignBrief = {
  brand_name: 'Ember & Co.',
  tagline: 'Coffee, slower.',
  tone: 'warm, unhurried',
  design_direction: 'soft-organic',
  palette: [
    { var: '--brand-bg', hsl: '0 0% 100%' },
    { var: '--brand-fg', hsl: '0 0% 10%' },
    { var: '--brand-primary', hsl: '30 40% 40%' },
    { var: '--brand-accent', hsl: '40 90% 55%' },
    { var: '--brand-muted', hsl: '30 20% 90%' },
  ],
  fonts: { heading: 'Fraunces', body: 'Inter' },
  imagery: 'warm, natural light',
  imagery_keywords: ['coffee beans'],
};

describe('DesignBriefService.applyPaletteHints (onboarding, bucket 5 ítem 2, mockup D)', () => {
  it('sin hints, devuelve el brief sin tocar', () => {
    expect(applyPaletteHints(BASE_BRIEF)).toEqual(BASE_BRIEF);
  });

  it('modo "Sugerido por el prompt": pinnedPalette reemplaza la paleta ENTERA del modelo', () => {
    const pinned = [
      { var: '--brand-bg', hsl: '43 96% 92%' },
      { var: '--brand-fg', hsl: '22 100% 14%' },
      { var: '--brand-primary', hsl: '22 78% 26%' },
      { var: '--brand-accent', hsl: '45 96% 60%' },
      { var: '--brand-muted', hsl: '45 90% 80%' },
    ];
    const result = applyPaletteHints(BASE_BRIEF, { pinnedPalette: pinned });
    expect(result.palette).toEqual(pinned);
    // el resto del brief (copy, fuentes, facts) sigue siendo el del modelo
    expect(result.brand_name).toBe(BASE_BRIEF.brand_name);
  });

  it('modo "Rueda de color": pinnedPrimaryHsl sólo fuerza --brand-primary, el resto queda igual', () => {
    const result = applyPaletteHints(BASE_BRIEF, { pinnedPrimaryHsl: '355 78% 56%' });
    expect(result.palette.find((c) => c.var === '--brand-primary')?.hsl).toBe('355 78% 56%');
    expect(result.palette.find((c) => c.var === '--brand-bg')?.hsl).toBe('0 0% 100%');
    expect(result.palette.find((c) => c.var === '--brand-accent')?.hsl).toBe('40 90% 55%');
  });

  it('pinnedPalette gana sobre pinnedPrimaryHsl si ambos llegan a la vez', () => {
    const pinned = BASE_BRIEF.palette.map((c) => ({ ...c, hsl: '1 1% 1%' }));
    const result = applyPaletteHints(BASE_BRIEF, { pinnedPalette: pinned, pinnedPrimaryHsl: '2 2% 2%' });
    expect(result.palette).toEqual(pinned);
  });

  it('un pinnedPalette con menos de 5 entradas se ignora (forma inválida, nunca se aplica a medias)', () => {
    const result = applyPaletteHints(BASE_BRIEF, { pinnedPalette: [{ var: '--brand-bg', hsl: '1 1% 1%' }] });
    expect(result.palette).toEqual(BASE_BRIEF.palette);
  });
});

describe('DesignBriefService.appendImagePool', () => {
  it('emits three columns: URL, Description, Credit', () => {
    const images: PoolImage[] = [
      {
        url: 'https://images.unsplash.com/photo-a',
        description: 'A bakery counter',
        author_name: 'Jane Doe',
        author_link: 'https://unsplash.com/@jane?utm_source=wyrd_forge&utm_medium=referral',
      },
    ];

    const result = DesignBriefService.appendImagePool('# DESIGN', images);

    expect(result).toContain('| URL | Description | Credit |');
    expect(result).toContain('| --- | --- | --- |');
  });

  it('emits [Name](link) in Credit when author_link is present', () => {
    const images: PoolImage[] = [
      {
        url: 'https://images.unsplash.com/photo-a',
        description: 'A bakery counter',
        author_name: 'Jane Doe',
        author_link: 'https://unsplash.com/@jane?utm_source=wyrd_forge&utm_medium=referral',
      },
    ];

    const result = DesignBriefService.appendImagePool('# DESIGN', images);

    expect(result).toContain(
      '[Jane Doe](https://unsplash.com/@jane?utm_source=wyrd_forge&utm_medium=referral)',
    );
  });

  it('emits only the name in Credit when author_link is empty', () => {
    const images: PoolImage[] = [
      {
        url: 'https://images.unsplash.com/photo-a',
        description: 'A bakery counter',
        author_name: 'Jane Doe',
        author_link: '',
      },
    ];

    const result = DesignBriefService.appendImagePool('# DESIGN', images);
    const row = result.split('\n').find((l) => l.startsWith('| https://images.unsplash.com/photo-a'));

    expect(row).toBe('| https://images.unsplash.com/photo-a | A bakery counter | Jane Doe |');
    expect(row).not.toContain('[Jane Doe](');
  });

  it('no longer includes "(Photo by" in Description', () => {
    const images: PoolImage[] = [
      {
        url: 'https://images.unsplash.com/photo-a',
        description: 'A bakery counter',
        author_name: 'Jane Doe',
        author_link: 'https://unsplash.com/@jane',
      },
    ];

    const result = DesignBriefService.appendImagePool('# DESIGN', images);

    expect(result).not.toContain('(Photo by');
  });

  it('returns the markdown unchanged for an empty pool, without throwing', () => {
    const markdown = '# DESIGN\n\nSome content.';
    expect(() => DesignBriefService.appendImagePool(markdown, [])).not.toThrow();
    expect(DesignBriefService.appendImagePool(markdown, [])).toBe(markdown);
    expect(DesignBriefService.appendImagePool(markdown, [])).not.toContain('HERO');
  });

  it('marks row 1 as HERO (exclusive) when the pool has more than one image', () => {
    const images: PoolImage[] = [
      { url: 'https://images.unsplash.com/photo-a', description: 'Bakery counter', author_name: 'Jane', author_link: '' },
      { url: 'https://images.unsplash.com/photo-b', description: 'Fresh bread', author_name: 'Joe', author_link: '' },
    ];

    const result = DesignBriefService.appendImagePool('# DESIGN', images);
    const rows = result.split('\n').filter((l) => l.startsWith('| https://images.unsplash.com'));

    expect(rows[0]).toContain('HERO (exclusive)');
    expect(rows[1]).not.toContain('HERO');
  });

  it('does not reserve a hero when the pool has exactly one image', () => {
    const images: PoolImage[] = [
      { url: 'https://images.unsplash.com/photo-a', description: 'Bakery counter', author_name: 'Jane', author_link: '' },
    ];

    const result = DesignBriefService.appendImagePool('# DESIGN', images);

    expect(result).not.toContain('HERO');
    expect(result).toContain('| URL | Description | Credit |');
  });

  it('introductory text declares hero exclusivity when the pool has more than one image', () => {
    const images: PoolImage[] = [
      { url: 'https://images.unsplash.com/photo-a', description: 'Bakery counter', author_name: 'Jane', author_link: '' },
      { url: 'https://images.unsplash.com/photo-b', description: 'Fresh bread', author_name: 'Joe', author_link: '' },
    ];

    const result = DesignBriefService.appendImagePool('# DESIGN', images);

    expect(result).toMatch(/reserved exclusively for the hero section/i);
    expect(result).toMatch(/must NOT be reused in any other section/i);
  });

  it('keeps the Credit column formatting intact alongside the Role column', () => {
    const images: PoolImage[] = [
      {
        url: 'https://images.unsplash.com/photo-a',
        description: 'Bakery counter',
        author_name: 'Jane Doe',
        author_link: 'https://unsplash.com/@jane?utm_source=wyrd_forge&utm_medium=referral',
      },
      { url: 'https://images.unsplash.com/photo-b', description: 'Fresh bread', author_name: 'Joe', author_link: '' },
    ];

    const result = DesignBriefService.appendImagePool('# DESIGN', images);
    const rows = result.split('\n').filter((l) => l.startsWith('| https://images.unsplash.com'));

    expect(rows[0]).toContain('[Jane Doe](https://unsplash.com/@jane?utm_source=wyrd_forge&utm_medium=referral)');
    expect(rows[1]).toContain('| Joe |');
  });
});
