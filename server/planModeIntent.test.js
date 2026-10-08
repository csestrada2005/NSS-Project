import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asksForPlan } from '../src/utils/planModeIntent.js';

// 2026-10-09 (P2): en modo Plan, pedir un plan no es una pregunta.

test('pedidos de plan o propuesta', () => {
  for (const t of [
    'Proponme un plan para mejorar el estilo de las tarjetas',
    'propón cómo rediseñar el hero',
    'Hazme una propuesta para la sección de precios',
    'Can you propose a new layout?',
    'Arma un plan para el blog',
  ]) assert.equal(asksForPlan(t), true, t);
});

test('preguntas normales no', () => {
  for (const t of ['¿Qué fuente usa el sitio?', '¿Están bien los precios con el PDF?', 'What colors do we use?', 'explica el planeta'])
    assert.equal(asksForPlan(t), false, t);
});
