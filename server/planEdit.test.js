import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addsDeletions, buildEditedPlanInput, planAsEditableText, PLAN_EDITED_MARK } from '../src/utils/planEdit.js';

// 2026-10-08 (R1): revisar el plan y construir con la versión del usuario.

const STEPS = [
  { order: 2, description: 'Cambiar los botones', summary: 'Cambia los botones a estilo propio', action: 'modify', file_path: 'src/components/ui/button.tsx' },
  { order: 1, description: 'Rediseñar tarjetas', action: 'modify', file_path: 'src/components/Card.tsx' },
  { order: 3, description: 'Quitar sección vieja', action: 'delete', file_path: 'src/components/Old.tsx' },
];

test('el plan editable: un paso por línea, en orden, y los borrados se ven', () => {
  assert.equal(planAsEditableText(STEPS),
    '1. Rediseñar tarjetas\n2. Cambia los botones a estilo propio\n3. Quitar sección vieja (borra src/components/Old.tsx)');
});

test('el pedido nuevo lleva el original, el plan anterior y la versión del usuario', () => {
  const out = buildEditedPlanInput('Mejora el estilo de las tarjetas', STEPS, '1. Rediseñar tarjetas\nDe las 3 opciones aplica A');
  assert.ok(out.startsWith('Mejora el estilo de las tarjetas\n'));
  assert.ok(out.includes(PLAN_EDITED_MARK));
  assert.ok(out.includes('PREVIOUS PLAN:\n1. Rediseñar tarjetas'));
  assert.ok(out.endsWith('EDITED PLAN (by the user):\n1. Rediseñar tarjetas\nDe las 3 opciones aplica A'));
});

test('borrados nuevos: sólo cuentan los que el plan anterior no tenía', () => {
  assert.equal(addsDeletions(STEPS, STEPS), false);
  assert.equal(addsDeletions([{ action: 'modify', file_path: 'a' }], STEPS), false);
  assert.equal(addsDeletions([{ action: 'delete', file_path: 'src/pages/Home.tsx' }], STEPS), true);
});
