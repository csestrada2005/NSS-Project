import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownPreview } from '../src/utils/markdownPreview.js';

// 2026-10-08: la tarjeta pequeña mostraba el markdown en crudo.

test('negritas, código y listas quedan como texto', () => {
  const md = 'Según el PDF `menu_vertigo.pdf`, estos son los precios:\n\n**MONTAÑA**\n- Ascenso Pico de Orizaba (3 días) — $8,900 MXN\n- Trekking Nevado de Toluca — $1,800 MXN';
  assert.equal(markdownPreview(md),
    'Según el PDF menu_vertigo.pdf, estos son los precios:\nMONTAÑA\nAscenso Pico de Orizaba (3 días) — $8,900 MXN\nTrekking Nevado de Toluca — $1,800 MXN');
});

test('una tabla queda fila por fila, sin barras ni separadores', () => {
  const md = 'Los 9 productos del PDF son:\n\n| Expedición | Precio |\n|---|---|\n| Ascenso Pico de Orizaba | $8,900 MXN |\n| Rafting Río Pescados | $1,650 MXN |';
  assert.equal(markdownPreview(md),
    'Los 9 productos del PDF son:\nExpedición · Precio\nAscenso Pico de Orizaba · $8,900 MXN\nRafting Río Pescados · $1,650 MXN');
});

test('títulos, enlaces y bloques de código', () => {
  assert.equal(markdownPreview('## Hola\nMira [la guía](https://x.y)\n```ts\nconst a = 1;\n```\nFin'), 'Hola\nMira la guía\nFin');
});

test('texto normal no cambia; los precios con $ no se tocan', () => {
  assert.equal(markdownPreview('Listo. Cambié 2 archivos: Hero, Precios'), 'Listo. Cambié 2 archivos: Hero, Precios');
  assert.equal(markdownPreview('2 * 3 = 6 y cuesta $5'), '2 * 3 = 6 y cuesta $5');
});
