import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSavedReadingsNote, pickSavedReadings, MAX_READINGS_TOTAL_CHARS } from '../src/utils/savedReadings.js';

// 2026-10-08 (decisión A): al contestar, la IA usa sola lo que ya leyó.

const PDF = { id: 'p1', kind: 'document', original_name: 'menu_vertigo.pdf', has_reading: true };
const FOTO = { id: 'f1', kind: 'image', original_name: 'jjll-hero-cards.jpg', has_reading: true };
const SIN_LEER = { id: 'p2', kind: 'document', original_name: 'contrato.pdf', has_reading: false };

test('"el PDF" trae los documentos ya leídos; nunca los que no tienen copia', () => {
  const picked = pickSavedReadings([PDF, FOTO, SIN_LEER], '¿Están bien los precios con el PDF?');
  assert.deepEqual(picked.map((a) => a.id), ['p1']);
});

test('"la foto" trae las imágenes ya leídas', () => {
  assert.deepEqual(pickSavedReadings([PDF, FOTO], '¿Esta foto sirve para el hero?').map((a) => a.id), ['f1']);
});

test('por nombre: "menu vertigo" o "menu_vertigo", con o sin acentos', () => {
  assert.deepEqual(pickSavedReadings([PDF, FOTO], 'qué dice el menú vertigo').map((a) => a.id), ['p1']);
  assert.deepEqual(pickSavedReadings([PDF, FOTO], 'revisa menu_vertigo').map((a) => a.id), ['p1']);
});

test('pregunta que no habla de archivos: nada', () => {
  assert.deepEqual(pickSavedReadings([PDF, FOTO], '¿Cómo cambio el color del botón?'), []);
});

test('lo ya adjunto no se repite', () => {
  assert.deepEqual(pickSavedReadings([PDF], 'revisa el PDF', ['p1']), []);
});

test('la nota lleva el contenido y respeta el tope total', () => {
  const note = buildSavedReadingsNote([
    { kind: 'document', original_name: 'menu_vertigo.pdf', text: 'Rafting | $850' },
    { kind: 'image', original_name: 'hero.jpg', text: 'Cartas de juego sobre una mesa.' },
  ]);
  assert.match(note, /^SAVED READINGS/);
  assert.match(note, /document "menu_vertigo.pdf" — content:\nRafting \| \$850/);
  assert.match(note, /image "hero.jpg" — what it shows:/);

  const big = 'x'.repeat(MAX_READINGS_TOTAL_CHARS);
  const capped = buildSavedReadingsNote([
    { kind: 'document', original_name: 'a.pdf', text: big },
    { kind: 'document', original_name: 'b.pdf', text: big },
    { kind: 'document', original_name: 'c.pdf', text: big },
  ]);
  assert.ok(capped.length < MAX_READINGS_TOTAL_CHARS + 500);
  assert.match(capped, /TRUNCATED/);
  assert.equal(buildSavedReadingsNote([]), '');
});
