import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateClientCode,
  clientSecretTelemetry,
  clientRoleWriteTelemetry,
  clientCodeWarnings,
  CREDENTIAL_IDENTIFIER_NAMES,
} from '../src/utils/clientCodeGuard.js';

// ---------------------------------------------------------------------------
// clientCodeGuard — G-6: dos comprobaciones deterministas sobre código de
// cliente que el Verifier nunca mira (sólo compila, no inspecciona
// contenido): credenciales de terceros pegadas a mano, y escrituras
// directas del navegador a una tabla de rol que el mismo lote de
// migraciones acaba de crear. Detect + avisa, sin reescritura — ver la
// cabecera de src/utils/clientCodeGuard.js para el porqué.
// ---------------------------------------------------------------------------

// Deliberadamente SIN forma de clave real de ningún proveedor (nada de
// `sk_live_`, `sk_test_`, etc.) — el escáner de secretos de GitHub bloquea
// el push si el patrón coincide, real o no, y a este test le da igual el
// FORMATO del valor: sólo importa que sea un literal de string.
const SECRET_VALUE = 'FAKE_TEST_CREDENTIAL_VALUE_DO_NOT_LEAK_000000000000';

// --- Comprobación 1: credenciales hardcodeadas -----------------------------

test('detecta una credencial CONSTANT_CASE calificada con el nombre del servicio (STRIPE_SECRET_KEY)', () => {
  const files = [
    { path: 'src/lib/stripe.ts', content: `const STRIPE_SECRET_KEY = "${SECRET_VALUE}";\n` },
  ];
  const { dangerous, findings } = evaluateClientCode(files);
  assert.equal(dangerous, true);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    path: 'src/lib/stripe.ts',
    reason: 'hardcoded-credential',
    identifier: 'STRIPE_SECRET_KEY',
    table: null,
    method: null,
  });
});

test('detecta una credencial camelCase en propiedad de objeto con clave entrecomillada (api_key)', () => {
  const files = [
    { path: 'src/lib/openai.ts', content: `const config = { "api_key": "${SECRET_VALUE}" };\n` },
  ];
  const { findings } = evaluateClientCode(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].identifier, 'api_key');
});

test('detecta un header Authorization con Bearer pegado a mano', () => {
  const files = [
    {
      path: 'src/lib/fetchClient.ts',
      content: `fetch(url, { headers: { Authorization: 'Bearer ${SECRET_VALUE}' } });\n`,
    },
  ];
  const { dangerous, findings } = evaluateClientCode(files);
  assert.equal(dangerous, true);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].identifier, 'Authorization');
});

test('negativo — baseline VITE_SUPABASE_ANON_KEY vía import.meta.env, pública por diseño', () => {
  const files = [
    {
      path: 'src/lib/supabase.ts',
      content:
        `const supabase = createClient(\n` +
        `  import.meta.env.VITE_SUPABASE_URL as string,\n` +
        `  import.meta.env.VITE_SUPABASE_ANON_KEY as string\n` +
        `);\n`,
    },
  ];
  const { dangerous, findings } = evaluateClientCode(files);
  assert.equal(dangerous, false);
  assert.deepEqual(findings, []);
});

test('negativo — string genérico (UUID) sobre un identificador que no es credencial', () => {
  const files = [
    { path: 'src/components/Item.tsx', content: `const id = "550e8400-e29b-41d4-a716-446655440000";\n` },
  ];
  const { findings } = evaluateClientCode(files);
  assert.deepEqual(findings, []);
});

test('negativo — role a secas no cuenta como credencial (demasiado genérico)', () => {
  const files = [
    { path: 'src/components/Badge.tsx', content: `const role = "admin";\n` },
  ];
  const { findings } = evaluateClientCode(files);
  assert.deepEqual(findings, []);
});

test('negativo — credencial dentro de un comentario no dispara', () => {
  const files = [
    {
      path: 'src/lib/stripe.ts',
      content: `// ejemplo: const STRIPE_SECRET_KEY = "${SECRET_VALUE}";\nexport const noop = () => {};\n`,
    },
  ];
  const { findings } = evaluateClientCode(files);
  assert.deepEqual(findings, []);
});

test('negativo — interpolación en template literal no es un valor pegado a mano', () => {
  const files = [
    {
      path: 'src/lib/fetchClient.ts',
      content: 'const headers = { Authorization: `Bearer ${accessToken}` };\n',
    },
  ];
  const { findings } = evaluateClientCode(files);
  assert.deepEqual(findings, []);
});

// --- Comprobación 2: escritura a tabla de rol desde el cliente --------------

const ROLE_TABLES = new Set(['app_users']);

test('detecta una escritura de cliente a una tabla de rol vía el cliente importado', () => {
  const files = [
    {
      path: 'src/hooks/useAdmin.ts',
      content:
        `import { supabase } from '../lib/supabase';\n\n` +
        `export async function promoteUser(id: string) {\n` +
        `  const { error } = await supabase.from('app_users').update({ role: 'admin' }).eq('id', id);\n` +
        `  if (error) throw error;\n` +
        `}\n`,
    },
  ];
  const { dangerous, findings } = evaluateClientCode(files, ROLE_TABLES);
  assert.equal(dangerous, true);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    path: 'src/hooks/useAdmin.ts',
    reason: 'role-table-write',
    identifier: null,
    table: 'app_users',
    method: 'update',
  });
});

test('detecta la misma escritura vía un createClient ad-hoc (calcada de registry.ts:325)', () => {
  const files = [
    {
      path: 'src/hooks/useEntityManager.ts',
      content:
        `import { createClient } from '@supabase/supabase-js';\n\n` +
        `const supabase = createClient(\n` +
        `  import.meta.env.VITE_SUPABASE_URL as string,\n` +
        `  import.meta.env.VITE_SUPABASE_ANON_KEY as string\n` +
        `);\n\n` +
        `export const updateStatus = async (id: string, newStatus: string) => {\n` +
        `  const { error } = await supabase.from('app_users').update({ status: newStatus }).eq('id', id);\n` +
        `  if (error) throw new Error(error.message);\n` +
        `};\n`,
    },
  ];
  const { dangerous, findings } = evaluateClientCode(files, ROLE_TABLES);
  assert.equal(dangerous, true);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].table, 'app_users');
  assert.equal(findings[0].method, 'update');
});

test('negativo — insert/update sobre una tabla que NO está en roleTables', () => {
  const files = [
    {
      path: 'src/hooks/useReviews.ts',
      content: `await supabase.from('customer_reviews').insert({ comment: 'great' });\n`,
    },
  ];
  const { dangerous, findings } = evaluateClientCode(files, ROLE_TABLES);
  assert.equal(dangerous, false);
  assert.deepEqual(findings, []);
});

// --- Límites aceptados, documentados en la cabecera -------------------------

test('límite aceptado — fail-open sobre supabase.from(variable) sin literal', () => {
  const files = [
    {
      path: 'src/hooks/useAdmin.ts',
      content:
        `const table = 'app_users';\n` +
        `await supabase.from(table).update({ role: 'admin' }).eq('id', id);\n`,
    },
  ];
  const { dangerous, findings } = evaluateClientCode(files, ROLE_TABLES);
  assert.equal(dangerous, false);
  assert.deepEqual(findings, []);
});

test('límite aceptado — sin memoria entre intents: roleTables vacío no ve una tabla de rol de otro intent', () => {
  const files = [
    {
      path: 'src/hooks/useAdmin.ts',
      content: `await supabase.from('app_users').update({ role: 'admin' }).eq('id', id);\n`,
    },
  ];
  const { dangerous, findings } = evaluateClientCode(files, new Set());
  assert.equal(dangerous, false);
  assert.deepEqual(findings, []);
});

test('límite aceptado — un import con alias (supabase as sb) no se detecta', () => {
  const files = [
    {
      path: 'src/hooks/useAdmin.ts',
      content:
        `import { supabase as sb } from '../lib/supabase';\n` +
        `await sb.from('app_users').update({ role: 'admin' }).eq('id', id);\n`,
    },
  ];
  const { dangerous, findings } = evaluateClientCode(files, ROLE_TABLES);
  assert.equal(dangerous, false);
  assert.deepEqual(findings, []);
});

// --- Robustez -----------------------------------------------------------------

test('robustez — contenido no-string no lanza y no cuenta como hallazgo', () => {
  const files = [
    { path: 'src/a.tsx', content: null },
    { path: 'src/b.tsx', content: 42 },
    { path: 'src/c.tsx', content: undefined },
  ];
  assert.doesNotThrow(() => evaluateClientCode(files, ROLE_TABLES));
  const { dangerous, findings } = evaluateClientCode(files, ROLE_TABLES);
  assert.equal(dangerous, false);
  assert.deepEqual(findings, []);
});

test('robustez — files vacío o undefined no lanza', () => {
  assert.deepEqual(evaluateClientCode([]), { dangerous: false, findings: [] });
  assert.deepEqual(evaluateClientCode(undefined), { dangerous: false, findings: [] });
});

// --- Telemetría, formato exacto -----------------------------------------------

test('clientSecretTelemetry — formato exacto, ordenado y deduplicado', () => {
  const findings = [
    { path: 'src/b.ts', identifier: 'API_KEY_TWO', reason: 'hardcoded-credential' },
    { path: 'src/a.ts', identifier: 'STRIPE_SECRET_KEY', reason: 'hardcoded-credential' },
    { path: 'src/a.ts', identifier: 'STRIPE_SECRET_KEY', reason: 'hardcoded-credential' },
    { path: 'src/c.ts', table: 'app_users', method: 'update', reason: 'role-table-write' },
  ];
  assert.equal(
    clientSecretTelemetry(findings),
    ' [CLIENT_SECRET_HARDCODED:src/a.ts:STRIPE_SECRET_KEY,src/b.ts:API_KEY_TWO]'
  );
});

test('clientSecretTelemetry — cadena vacía sin hallazgos', () => {
  assert.equal(clientSecretTelemetry([]), '');
});

test('clientRoleWriteTelemetry — formato exacto, ordenado y deduplicado', () => {
  const findings = [
    { path: 'src/hooks/useAdmin.ts', table: 'app_users', method: 'update', reason: 'role-table-write' },
    { path: 'src/hooks/useAdmin.ts', table: 'app_users', method: 'update', reason: 'role-table-write' },
    { path: 'src/hooks/useOnboard.ts', table: 'app_users', method: 'insert', reason: 'role-table-write' },
    { path: 'src/lib/stripe.ts', identifier: 'STRIPE_SECRET_KEY', reason: 'hardcoded-credential' },
  ];
  assert.equal(
    clientRoleWriteTelemetry(findings),
    ' [CLIENT_ROLE_WRITE:src/hooks/useAdmin.ts:app_users:update,src/hooks/useOnboard.ts:app_users:insert]'
  );
});

test('clientRoleWriteTelemetry — cadena vacía sin hallazgos', () => {
  assert.equal(clientRoleWriteTelemetry([]), '');
});

// --- Avisos --------------------------------------------------------------------

test('clientCodeWarnings — un mensaje por hallazgo distinto, tono establecido, sin el valor del literal', () => {
  const findings = [
    { path: 'src/lib/stripe.ts', reason: 'hardcoded-credential', identifier: 'STRIPE_SECRET_KEY', table: null, method: null },
    { path: 'src/hooks/useAdmin.ts', reason: 'role-table-write', identifier: null, table: 'app_users', method: 'update' },
  ];
  const warnings = clientCodeWarnings(findings);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /^Guard de seguridad: /);
  assert.match(warnings[0], /STRIPE_SECRET_KEY/);
  assert.match(warnings[0], /No la corregí automáticamente/);
  assert.match(warnings[1], /^Guard de seguridad: /);
  assert.match(warnings[1], /app_users/);
  assert.match(warnings[1], /No lo corregí automáticamente/);
});

// --- Regresión: nunca el valor del literal ---------------------------------

test('regresión — ningún finding, telemetría ni aviso contiene el VALOR de la credencial', () => {
  const files = [
    { path: 'src/lib/stripe.ts', content: `const STRIPE_SECRET_KEY = "${SECRET_VALUE}";\n` },
    {
      path: 'src/lib/fetchClient.ts',
      content: `fetch(url, { headers: { Authorization: 'Bearer ${SECRET_VALUE}' } });\n`,
    },
  ];
  const { findings } = evaluateClientCode(files);
  assert.ok(findings.length >= 2);

  const findingsBlob = JSON.stringify(findings);
  const secretMark = clientSecretTelemetry(findings);
  const roleMark = clientRoleWriteTelemetry(findings);
  const warningsBlob = clientCodeWarnings(findings).join('\n');

  assert.equal(findingsBlob.includes(SECRET_VALUE), false);
  assert.equal(secretMark.includes(SECRET_VALUE), false);
  assert.equal(roleMark.includes(SECRET_VALUE), false);
  assert.equal(warningsBlob.includes(SECRET_VALUE), false);
});

test('CREDENTIAL_IDENTIFIER_NAMES excluye deliberadamente genéricos y password', () => {
  for (const generic of ['key', 'token', 'role', 'password']) {
    assert.equal(CREDENTIAL_IDENTIFIER_NAMES.includes(generic), false);
  }
});
