import { describe, it, expect } from 'vitest';
import { DesignBriefService, type PoolImage } from './DesignBriefService';

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
