import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOG_SOURCES,
  isValidLogSource,
  buildLogsSql,
  validateProjectRefRequest,
  validateLogsRequest,
} from './projectManagementApi.js';

// ---------------------------------------------------------------------------
// Panel Cloud (bucket 5, ítem 1) — EdgeFunctionsPanel/LogsViewer/UsagePanel
// estaban desmontados porque su única implementación sacaba
// SUPABASE_SERVICE_ROLE_KEY de forge_secrets (sin filtrar por project_id) y
// la mandaba directo desde el navegador como Authorization: Bearer contra
// api.supabase.com — con el ref además mal calculado desde VITE_SUPABASE_URL
// (la plataforma, no el proyecto generado). Este módulo mueve esa llamada al
// servidor, usando SUPABASE_MANAGEMENT_TOKEN (no la service_role key) y el
// ref real de forge_projects.supabase_project_ref. Ver cabecera de
// projectManagementApi.js para el detalle completo y las citas de doc.
// ---------------------------------------------------------------------------

test('isValidLogSource — acepta sólo las tres fuentes reales de Logs Explorer', () => {
  assert.equal(isValidLogSource('postgres'), true);
  assert.equal(isValidLogSource('auth'), true);
  assert.equal(isValidLogSource('edge-functions'), true);
  assert.equal(isValidLogSource('storage'), false);
  assert.equal(isValidLogSource(''), false);
  assert.equal(isValidLogSource(undefined), false);
  assert.equal(isValidLogSource(null), false);
  assert.equal(isValidLogSource(123), false);
});

test('buildLogsSql — resuelve la tabla real de ClickHouse por fuente, nunca el nombre pedido por el cliente', () => {
  assert.equal(buildLogsSql('postgres'), 'select id, timestamp, event_message from postgres_logs order by timestamp desc limit 50');
  assert.equal(buildLogsSql('auth'), 'select id, timestamp, event_message from auth_logs order by timestamp desc limit 50');
  assert.equal(buildLogsSql('edge-functions'), 'select id, timestamp, event_message from function_edge_logs order by timestamp desc limit 50');
});

test('LOG_SOURCES — enumeración cerrada, exactamente las tres fuentes documentadas', () => {
  assert.deepEqual(Object.keys(LOG_SOURCES).sort(), ['auth', 'edge-functions', 'postgres']);
});

test('validateProjectRefRequest — 409 NO_PROJECT_DB cuando el ref es null, nunca cae a un default', () => {
  const result = validateProjectRefRequest({ projectRef: null });
  assert.deepEqual(result, {
    ok: false,
    status: 409,
    code: 'NO_PROJECT_DB',
    error: 'Project database not provisioned',
  });
});

test('validateProjectRefRequest — ok cuando hay ref', () => {
  assert.deepEqual(validateProjectRefRequest({ projectRef: 'ksjpiuajgjujsijbspig' }), { ok: true });
});

test('validateLogsRequest — 400 INVALID_INPUT por fuente inválida, revisado ANTES que el ref (mismo orden que edgeFunctionDeploy)', () => {
  const result = validateLogsRequest({ projectRef: null, source: 'storage' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.code, 'INVALID_INPUT');
});

test('validateLogsRequest — 409 cuando la fuente es válida pero no hay ref', () => {
  const result = validateLogsRequest({ projectRef: null, source: 'postgres' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, 'NO_PROJECT_DB');
});

test('validateLogsRequest — ok cuando ambos son válidos', () => {
  assert.deepEqual(validateLogsRequest({ projectRef: 'ref123', source: 'edge-functions' }), { ok: true });
});
