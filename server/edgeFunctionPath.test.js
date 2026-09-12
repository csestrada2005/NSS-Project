import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_FUNCTIONS_DIR,
  edgeFunctionSlug,
  isEdgeFunctionEntrypoint,
  isValidEdgeFunctionSlug,
} from '../src/utils/edgeFunctionPath.js';

// ---------------------------------------------------------------------------
// edgeFunctionPath — Bloque 1 (A+B). El patrón de detección
// `path.startsWith('supabase/functions/') && path.endsWith('index.ts')` con
// `split('/').length === 4` vivía duplicado en dos sitios de
// AIOrchestrator.ts (executeNextStep y runHeavyLane) y ninguno validaba el
// slug. Un solo helper, un solo sitio donde arreglarlo.
// ---------------------------------------------------------------------------

test('isEdgeFunctionEntrypoint acepta supabase/functions/<slug>/index.ts', () => {
  assert.equal(isEdgeFunctionEntrypoint(`${EDGE_FUNCTIONS_DIR}foo/index.ts`), true);
});

test('isEdgeFunctionEntrypoint rechaza profundidad 3 (falta el slug)', () => {
  assert.equal(isEdgeFunctionEntrypoint(`${EDGE_FUNCTIONS_DIR}index.ts`), false);
});

test('isEdgeFunctionEntrypoint rechaza profundidad 5 (anidado bajo el slug)', () => {
  assert.equal(isEdgeFunctionEntrypoint(`${EDGE_FUNCTIONS_DIR}foo/bar/index.ts`), false);
});

test('isEdgeFunctionEntrypoint rechaza rutas fuera de supabase/functions/', () => {
  assert.equal(isEdgeFunctionEntrypoint('src/App.tsx'), false);
});

test('isEdgeFunctionEntrypoint rechaza un slug inválido', () => {
  assert.equal(isEdgeFunctionEntrypoint(`${EDGE_FUNCTIONS_DIR}Foo_Bar/index.ts`), false);
  assert.equal(isEdgeFunctionEntrypoint(`${EDGE_FUNCTIONS_DIR}../etc/index.ts`), false);
});

test('isEdgeFunctionEntrypoint rechaza entradas no-string', () => {
  assert.equal(isEdgeFunctionEntrypoint(undefined), false);
  assert.equal(isEdgeFunctionEntrypoint(null), false);
});

test('edgeFunctionSlug devuelve el slug para un entrypoint válido', () => {
  assert.equal(edgeFunctionSlug(`${EDGE_FUNCTIONS_DIR}send-email/index.ts`), 'send-email');
});

test('edgeFunctionSlug devuelve null cuando el path no califica', () => {
  assert.equal(edgeFunctionSlug(`${EDGE_FUNCTIONS_DIR}index.ts`), null);
  assert.equal(edgeFunctionSlug(`${EDGE_FUNCTIONS_DIR}foo/bar/index.ts`), null);
  assert.equal(edgeFunctionSlug('src/App.tsx'), null);
  assert.equal(edgeFunctionSlug(`${EDGE_FUNCTIONS_DIR}Bad_Slug/index.ts`), null);
});

// ---------------------------------------------------------------------------
// isValidEdgeFunctionSlug — la MISMA regla que el servidor exige antes de
// llamar a la Management API (server/edgeFunctionDeploy.js): sólo
// [a-z0-9-], máximo 50 caracteres, sin '/' ni '..'.
// ---------------------------------------------------------------------------

test('isValidEdgeFunctionSlug acepta minúsculas, dígitos y guiones', () => {
  assert.equal(isValidEdgeFunctionSlug('send-email'), true);
  assert.equal(isValidEdgeFunctionSlug('fn-2'), true);
  assert.equal(isValidEdgeFunctionSlug('a'), true);
});

test('isValidEdgeFunctionSlug rechaza mayúsculas, guion bajo, espacios', () => {
  assert.equal(isValidEdgeFunctionSlug('Send-Email'), false);
  assert.equal(isValidEdgeFunctionSlug('send_email'), false);
  assert.equal(isValidEdgeFunctionSlug('send email'), false);
});

test('isValidEdgeFunctionSlug rechaza / y ..', () => {
  assert.equal(isValidEdgeFunctionSlug('a/b'), false);
  assert.equal(isValidEdgeFunctionSlug('..'), false);
  assert.equal(isValidEdgeFunctionSlug('../etc'), false);
});

test('isValidEdgeFunctionSlug rechaza cadena vacía y más de 50 caracteres', () => {
  assert.equal(isValidEdgeFunctionSlug(''), false);
  assert.equal(isValidEdgeFunctionSlug('a'.repeat(51)), false);
  assert.equal(isValidEdgeFunctionSlug('a'.repeat(50)), true);
});

test('isValidEdgeFunctionSlug rechaza entradas no-string', () => {
  assert.equal(isValidEdgeFunctionSlug(undefined), false);
  assert.equal(isValidEdgeFunctionSlug(123), false);
});
