import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripEmoji } from '../src/utils/stripEmoji.js';

// 2026-10-08: la tabla de precios llegó con 🏔 💧 🪂.

test('quita emojis de celdas y texto, deja lo demás', () => {
  assert.equal(stripEmoji('| 🏔 Montaña | Ascenso | $8,900 MXN |'), '| Montaña | Ascenso | $8,900 MXN |');
  assert.equal(stripEmoji('🪂 Aire y Extremos — 💧 Agua 👍🏽 ✅'), 'Aire y Extremos — Agua');
  assert.equal(stripEmoji('Bandera 🇲🇽 y familia 👨‍👩‍👧 fuera'), 'Bandera y familia fuera');
});

test('texto sin emojis no cambia (acentos, ñ, ©, números, guiones)', () => {
  const t = 'Año 2026: $1,650 MXN — señal ©\n- uno\n- dos';
  assert.equal(stripEmoji(t), t);
});
