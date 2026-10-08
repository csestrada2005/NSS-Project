import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 2026-10-08: los menús de la barra (clip y Automático/Plan) abren hacia
// arriba; si la columna de la barra recorta (overflow), no se ven. jsdom no
// calcula CSS, así que se revisa la regla en el archivo.

const dir = resolve(__dirname);
const css = readFileSync(resolve(dir, 'forgeChat.css'), 'utf8');
const typebar = readFileSync(resolve(dir, 'Typebar.tsx'), 'utf8');

describe('Menús de la barra visibles', () => {
  it('la barra vive en una columna que no recorta', () => {
    expect(typebar).toContain('className="fc-stack fc-stack-barra"');
    const rule = /\.fc-stack\.fc-stack-barra\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/overflow:\s*visible/);
    expect(rule![1]).toMatch(/max-height:\s*none/);
  });
});
