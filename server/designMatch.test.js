import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBestMatch, tokenize } from '../src/utils/designMatch.js';

// Nombres reales de la base (query de Samuel, 2026-09-30); los detalles son
// representativos de la columna `keywords` / `best_for`.
const PRODUCTS = [
  { key: 'SaaS (General)', name: 'SaaS (General)', detail: 'software subscription dashboard b2b cloud' },
  { key: 'Travel/Tourism Agency', name: 'Travel/Tourism Agency', detail: 'travel tours trips destinations booking adventure vacation itinerary' },
  { key: 'Bakery/Cafe', name: 'Bakery/Cafe', detail: 'bakery bread pastries coffee cafe menu' },
  { key: 'Road Trip Planner', name: 'Road Trip Planner', detail: 'road trip route stops map planner' },
];
const UI = [
  { key: 'Outdoor / Adventure', name: 'Outdoor / Adventure' },
  { key: 'Travel / Tourism', name: 'Travel / Tourism' },
  { key: 'SaaS (General)', name: 'SaaS (General)' },
];

const VERTIGO_BRIEF = `# Design Brief
> This file is the mandatory design source of truth for this project.
## Brand
- **Name:** Vertigo Expeditions
- **Tagline:** Go where the map runs out.
- **Tone of copy:** bold, adventurous, for travelers who want remote trips and guided tours.`;

test('Vertigo (DESIGN.md) → Travel/Tourism Agency, no SaaS', () => {
  assert.equal(pickBestMatch(VERTIGO_BRIEF, PRODUCTS)?.key, 'Travel/Tourism Agency');
});

test('categorías de UI con otros nombres también encuentran la suya', () => {
  const r = pickBestMatch(VERTIGO_BRIEF + ' outdoor adventure', UI);
  assert.equal(r?.key, 'Outdoor / Adventure');
});

test('un pedido inicial describe el negocio → su tipo', () => {
  assert.equal(pickBestMatch('Create a website for my bakery with a cafe menu', PRODUCTS)?.key, 'Bakery/Cafe');
});

test('la frase de un cambio visual no inventa un tipo (antes caía a "Modern SaaS")', () => {
  assert.equal(pickBestMatch('cambia el fondo de la sección de reseñas a negro', PRODUCTS), null);
  assert.equal(pickBestMatch('', PRODUCTS), null);
});

test('tokenize ignora relleno y compara por raíz', () => {
  assert.deepEqual([...tokenize('The Tours and Destinations for your brand')].sort(), ['destin', 'tour']);
  assert.deepEqual([...tokenize('travelers')], [...tokenize('travel')]);
  assert.deepEqual([...tokenize('adventurous')], [...tokenize('adventure')]);
});
