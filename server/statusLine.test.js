import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanStatusLine } from '../src/utils/statusLine.js';

// 2026-10-08 (P2): la frase de la tarjeta viene del clasificador; se limpia.

test('frase normal: mayúscula inicial y puntos suspensivos', () => {
  assert.equal(cleanStatusLine('analizando si la foto sirve para la página.'), 'Analizando si la foto sirve para la página…');
  assert.equal(cleanStatusLine('"Agregando la sección de testimonios"'), 'Agregando la sección de testimonios…');
});

test('lo que no sirve no se usa', () => {
  assert.equal(cleanStatusLine(undefined), undefined);
  assert.equal(cleanStatusLine(42), undefined);
  assert.equal(cleanStatusLine('  '), undefined);
  assert.equal(cleanStatusLine('{"x":1}'), undefined);
  assert.equal(cleanStatusLine('<b>hola</b>'), undefined);
});

test('frase larga se recorta', () => {
  const out = cleanStatusLine('Revisando '.repeat(20));
  assert.ok(out.length <= 73);
  assert.ok(out.endsWith('…'));
});
