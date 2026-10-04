import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PREVIEW_TAILWIND_VERSION,
  fontLinksFromIndexHtml,
  toTailwindV4Css,
  toTailwindV4PackageJson,
  withPreviewTailwindBuild,
} from '../src/utils/deployTailwind.js';

// 2026-10-05 — Samuel: los proyectos se tienen que ver como en el preview.

test('la versión publicada es la misma del motor del preview', () => {
  const vendor = readFileSync(new URL('../public/vendor/tailwindcss-browser.js', import.meta.url), 'utf8').slice(0, 400);
  assert.match(vendor, new RegExp(`"${PREVIEW_TAILWIND_VERSION.replace(/\./g, '\\.')}"`));
});

test('index.css: @import de Tailwind 4, sin directivas v3 ni @apply, y el resto intacto', () => {
  const v3 = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --brand-bg: 220 18% 8%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: 'Inter', sans-serif;
  }
}
`;
  const out = toTailwindV4Css(v3);
  assert.match(out, /^@import "tailwindcss";\n/);
  assert.doesNotMatch(out, /@tailwind|@apply/);
  assert.match(out, /--brand-bg: 220 18% 8%;/);
  assert.match(out, /font-family: 'Inter', sans-serif;/);
  assert.equal(toTailwindV4Css(out), out, 'aplicarlo dos veces no cambia nada');
});

test('package.json: tailwindcss 4 + @tailwindcss/postcss, sin tocar lo demás', () => {
  const raw = JSON.stringify({ name: 'x', dependencies: { react: '^18' }, devDependencies: { tailwindcss: '^3.4.13', postcss: '^8.4.47', vite: '^7.3.6' } });
  const pkg = JSON.parse(toTailwindV4PackageJson(raw));
  assert.equal(pkg.devDependencies.tailwindcss, PREVIEW_TAILWIND_VERSION);
  assert.equal(pkg.devDependencies['@tailwindcss/postcss'], PREVIEW_TAILWIND_VERSION);
  assert.equal(pkg.devDependencies.vite, '^7.3.6');
  assert.equal(pkg.dependencies.react, '^18');
  assert.equal(toTailwindV4PackageJson('no es json'), 'no es json');
});

test('withPreviewTailwindBuild: sólo el paquete publicado; un proyecto sin index.css pasa igual', () => {
  const files = { 'package.json': '{"devDependencies":{"tailwindcss":"^3"}}', 'src/index.css': '@tailwind base;\n', 'src/App.tsx': 'x' };
  const out = withPreviewTailwindBuild(files);
  assert.match(out['postcss.config.js'], /@tailwindcss\/postcss/);
  assert.equal(out['src/App.tsx'], 'x');
  assert.equal(files['src/index.css'], '@tailwind base;\n', 'no muta la entrada');
  const bare = { 'src/App.tsx': 'x' };
  assert.equal(withPreviewTailwindBuild(bare), bare);
});

test('fontLinksFromIndexHtml: las fuentes del DESIGN.md llegan al preview', () => {
  const html = `<head>
    <link rel="preconnect" href="https://fonts.googleapis.com" data-brief-fonts />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin data-brief-fonts />
    <link rel="stylesheet" data-brief-fonts href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600&display=swap" />
    <link rel="icon" href="/favicon.svg" />
  </head>`;
  const links = fontLinksFromIndexHtml(html);
  assert.equal(links.split('\n').length, 3);
  assert.match(links, /family=Bebas\+Neue/);
  assert.doesNotMatch(links, /favicon/);
  assert.equal(fontLinksFromIndexHtml(''), '');
});

test('el preview incluye las fuentes del proyecto en su <head>', async () => {
  const { generateHTML } = await import('./compiler.js');
  const link = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" />';
  const html = generateHTML('/*bundle*/', '', link);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes(link));
  assert.ok(head.indexOf('tailwindcss-browser.js') < head.indexOf(link), 'después del motor de estilos');
});
