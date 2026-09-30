import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractQuotedTexts,
  namedFiles,
  resolveHintedTarget,
  snippetForTargeting,
} from '../src/utils/targetHints.js';

// Caso real de Samuel en Vertigo (2026-09-30): el título "Choose Your Edge"
// vive en el carácter 6374 de ExpeditionsSection.tsx (7034 chars).
const selectable = (p) => p.startsWith('src/') && /\.(tsx?|jsx?)$/.test(p);
const expeditions =
  'import x from "y";\n'.repeat(330) +
  '<h2 className="text-[#ff0000]">\n            Choose Your Edge\n          </h2>\n<p>…</p>';
const files = new Map([
  ['src/pages/Index.tsx', 'import ExpeditionsSection from "@/components/sections/ExpeditionsSection";'],
  ['src/components/sections/HeroSection.tsx', '<h1>Vertigo Expedition</h1>'],
  ['src/components/sections/ExpeditionsSection.tsx', expeditions],
  ['src/components/sections/ContactSection.tsx', '<h2>Contacto</h2>'],
  ['src/components/layout/Header.tsx', '<a>Contacto</a>'],
  ['supabase/functions/x/index.ts', 'Choose Your Edge'],
]);

test('el texto citado decide el archivo aunque cambien mayúsculas y espacios', () => {
  const input = 'Cambia el color del título "Choose your edge" en ExpeditionsSection.tsx al naranja (orange-500)';
  assert.deepEqual(extractQuotedTexts(input), ['Choose your edge']);
  assert.deepEqual(resolveHintedTarget(input, files, selectable), {
    path: 'src/components/sections/ExpeditionsSection.tsx',
    method: 'quoted-text',
  });
});

test('comillas tipográficas y sin archivo nombrado también sirven', () => {
  const r = resolveHintedTarget('pon “choose  your EDGE” en naranja', files, selectable);
  assert.equal(r?.path, 'src/components/sections/ExpeditionsSection.tsx');
});

test('el archivo nombrado decide cuando no hay texto citado único', () => {
  assert.deepEqual(namedFiles('cambia el fondo de ExpeditionsSection', files, selectable), [
    'src/components/sections/ExpeditionsSection.tsx',
  ]);
  const r = resolveHintedTarget('Cambia "Contacto" en HeroSection.tsx', files, selectable);
  assert.deepEqual(r, { path: 'src/components/sections/HeroSection.tsx', method: 'named-file' },
    '"Contacto" está en 2 archivos: no decide; el nombre sí');
});

test('sin pistas, o con pistas ambiguas o inexistentes, no decide nada (camino de siempre)', () => {
  assert.equal(resolveHintedTarget('haz más grande el botón del hero', files, selectable), null);
  assert.equal(resolveHintedTarget('Cambia "Contacto" por "Escríbenos"', files, selectable), null);
  assert.equal(resolveHintedTarget('cambia el título a "Hola mundo nuevo"', files, selectable), null);
  assert.equal(resolveHintedTarget('arregla MissingSection.tsx', files, selectable), null);
});

test('el trozo para el targeting se centra en lo citado cuando está lejos del principio', () => {
  const snippet = snippetForTargeting(expeditions, ['Choose your edge']);
  assert.match(snippet, /Choose Your Edge/);
  assert.ok(snippet.length <= 1500 + 2);
  const near = snippetForTargeting('<h1>Choose Your Edge</h1>' + 'x'.repeat(3000), ['choose your edge']);
  assert.equal(near, ('<h1>Choose Your Edge</h1>' + 'x'.repeat(3000)).slice(0, 1500), 'cerca del principio: igual que antes');
  assert.equal(snippetForTargeting('abc'.repeat(1000), []), 'abc'.repeat(1000).slice(0, 1500));
});
