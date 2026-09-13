import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateRlsPolicies,
  removeDangerousPolicies,
  rlsPolicyBlockedTelemetry,
  rlsPolicyWarnings,
  ROLE_COLUMN_NAMES,
} from '../src/utils/rlsPolicyGuard.js';

// ---------------------------------------------------------------------------
// BLOQUE 1-BIS (cirugía G-2) — DE LISTA DE PROHIBIDOS A LISTA DE PERMITIDOS.
//
// El checkpoint en vivo sobre Vertigo (087ddaf3-6236-47ae-ba72-bc96887a9691)
// enseñó que la primera versión ("INSERT, UPDATE o ALL son peligrosos")
// dejaba pasar `public_delete_app_users` — DELETE público sobre la tabla de
// usuarios, nadie la había enumerado. Desde este bloque el criterio está
// invertido: sobre una tabla con columna de rol, lo único ACEPTABLE en
// público es SELECT; cualquier otra cosa cae, exista hoy o no.
//
// El mismo checkpoint enseñó un segundo fallo: al eliminar una política, el
// guard dejaba vivo el comentario `--` que la introducía. Ese comentario
// vuelve al modelo como contexto de schema y le dice, literalmente, que
// reabra el agujero. `removeDangerousPolicies` ahora se lo lleva con ella.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- El caso de resultado conocido, primero y obligatorio -------------------

const VERTIGO_SQL = `
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'member'
);

-- Allow anyone to select rows (public read, sandboxed preview environment)
create policy "public_select_app_users"
  on public.app_users
  for select
  using (true);

-- Allow anyone to insert new rows (required for the invite flow without auth)
create policy "public_insert_app_users"
  on public.app_users
  for insert
  with check (true);

-- Allow anyone to update rows (required for role assignment and deactivation)
create policy "public_update_app_users"
  on public.app_users
  for update
  using (true);

create policy "public_delete_app_users"
  on public.app_users
  for delete
  using (true);
`;

test('G-2 BIS: el caso real de Vertigo — deja select, elimina insert/update/delete y sus comentarios', () => {
  const verdict = evaluateRlsPolicies([
    { path: 'supabase/migrations/20240101000000_app_users.sql', sql: VERTIGO_SQL },
  ]);

  assert.equal(verdict.dangerous, true);
  assert.deepEqual(
    verdict.findings.map((f) => f.command).sort(),
    ['DELETE', 'INSERT', 'UPDATE']
  );

  const cleaned = removeDangerousPolicies(VERTIGO_SQL, verdict.findings);

  assert.ok(cleaned.includes('public_select_app_users'), 'la política de SELECT sobrevive');
  assert.ok(
    cleaned.includes('Allow anyone to select rows'),
    'su comentario, no tocado, sobrevive con ella'
  );
  assert.ok(!cleaned.includes('public_insert_app_users'), 'insert eliminada');
  assert.ok(!cleaned.includes('public_update_app_users'), 'update eliminada');
  assert.ok(!cleaned.includes('public_delete_app_users'), 'delete eliminada — el fallo real');
  assert.ok(
    !cleaned.includes('Allow anyone to insert'),
    'el comentario huérfano de insert no sobrevive'
  );
  assert.ok(
    !cleaned.includes('Allow anyone to update'),
    'el comentario huérfano de update no sobrevive'
  );
  assert.ok(!/\n{3,}/.test(cleaned), 'no quedan más de dos saltos de línea seguidos');
});

// --- Cada comando por separado -----------------------------------------

test('G-2 BIS: política pública de DELETE sobre tabla con rol se elimina', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "public delete" on app_users for delete using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, true);
  assert.equal(verdict.findings[0].command, 'DELETE');
});

test('G-2 BIS: política pública de SELECT sobre tabla con rol se CONSERVA', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "public select" on app_users for select using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
  const cleaned = removeDangerousPolicies(sql, verdict.findings);
  assert.equal(cleaned, sql);
});

test('G-2 BIS: política pública de INSERT sobre tabla con rol se elimina', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "public insert" on app_users for insert with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, true);
  assert.equal(verdict.findings[0].command, 'INSERT');
});

test('G-2 BIS: política pública de UPDATE sobre tabla con rol se elimina', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "public update" on app_users for update using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, true);
  assert.equal(verdict.findings[0].command, 'UPDATE');
});

test('G-2 BIS: política ALL sobre tabla con rol se elimina', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "manage all" on app_users for all using (true) with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, true);
  assert.equal(verdict.findings[0].command, 'ALL');
});

test('G-2 BIS: política restringida a authenticated sobre tabla con rol se conserva', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "authenticated delete" on app_users for delete to authenticated using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
});

test('G-2 BIS: política pública de DELETE sobre tabla SIN columna de rol se conserva', () => {
  const sql = `
    create table productos (id uuid primary key, nombre text);
    create policy "public delete" on productos for delete using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
});

// --- El anclaje (intocado) -----------------------------------------------

test('G-2 BIS: una tabla llamada roles_de_juego, sin columna de rol, queda intacta', () => {
  const sql = `
    create table roles_de_juego (id uuid primary key, puntuacion integer);
    create policy "public delete" on roles_de_juego for delete using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
  assert.equal(removeDangerousPolicies(sql, verdict.findings), sql);
});

test('G-2 BIS: una columna llamada control queda intacta (precedente C2-3)', () => {
  const sql = `
    create table configuraciones (id uuid primary key, control text);
    create policy "public delete" on configuraciones for delete using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
  assert.equal(removeDangerousPolicies(sql, verdict.findings), sql);
});

// --- Fail-closed (intocado) ------------------------------------------------

test('G-2 BIS: SQL ilegible o vacío sigue siendo peligroso (fail-closed)', () => {
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: '' }]).dangerous, true);
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: null }]).dangerous, true);
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: 42 }]).dangerous, true);
});

// --- La limpieza de comentarios huérfanos -----------------------------

test('G-2 BIS: el comentario pegado a la política eliminada se va con ella', () => {
  const sql =
    'create table app_users (id uuid primary key, role text);\n' +
    '-- Allow anyone to delete rows\n' +
    'create policy "public delete" on app_users for delete using (true);\n';
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const cleaned = removeDangerousPolicies(sql, verdict.findings);
  assert.ok(!cleaned.includes('Allow anyone to delete rows'));
  assert.ok(!cleaned.includes('public delete'));
  assert.ok(cleaned.includes('create table app_users'));
});

test('G-2 BIS: un comentario separado por línea en blanco de la política eliminada se queda', () => {
  const sql =
    'create table app_users (id uuid primary key, role text);\n' +
    '-- Nota general del archivo, no pegada a ninguna política\n' +
    '\n' +
    'create policy "public delete" on app_users for delete using (true);\n';
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const cleaned = removeDangerousPolicies(sql, verdict.findings);
  assert.ok(cleaned.includes('Nota general del archivo'));
  assert.ok(!cleaned.includes('public delete'));
});

// --- Idempotencia --------------------------------------------------------

test('G-2 BIS: correr el guard dos veces sobre el mismo archivo da el mismo resultado', () => {
  const verdict = evaluateRlsPolicies([
    { path: 'supabase/migrations/20240101000000_app_users.sql', sql: VERTIGO_SQL },
  ]);
  const once = removeDangerousPolicies(VERTIGO_SQL, verdict.findings);
  const verdictAgain = evaluateRlsPolicies([
    { path: 'supabase/migrations/20240101000000_app_users.sql', sql: once },
  ]);
  const twice = removeDangerousPolicies(once, verdictAgain.findings);
  assert.equal(once, twice);
  assert.equal(verdictAgain.dangerous, false);
});

test('G-2 BIS: removeDangerousPolicies es idempotente sobre el MISMO finding', () => {
  const sql =
    'create table app_users (id uuid primary key, role text);\n' +
    'create policy "public delete" on app_users for delete using (true);';
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const once = removeDangerousPolicies(sql, verdict.findings);
  const twice = removeDangerousPolicies(once, verdict.findings);
  assert.equal(once, twice);
});

// --- El aviso lista las operaciones reales -----------------------------

test('G-2 BIS: rlsPolicyWarnings lista las operaciones realmente eliminadas, ordenadas', () => {
  const findings = [
    { table: 'app_users', command: 'DELETE', reason: 'public-write-policy' },
    { table: 'app_users', command: 'INSERT', reason: 'public-write-policy' },
    { table: 'app_users', command: 'UPDATE', reason: 'public-write-policy' },
  ];
  const warnings = rlsPolicyWarnings(findings);
  assert.equal(warnings.length, 1);
  assert.equal(
    warnings[0],
    'Guard de seguridad: se corrigió la migración generada. Política(s) pública(s) de ' +
      'DELETE, INSERT, UPDATE sobre app_users (tabla con columna de rol). Eliminada(s) antes ' +
      'de proponer la migración. La gestión de usuarios sigue por la función de servidor ' +
      'correspondiente.'
  );
});

test('G-2 BIS: rlsPolicyWarnings no repite operaciones duplicadas para la misma tabla', () => {
  const findings = [
    { table: 'app_users', command: 'DELETE', reason: 'public-write-policy' },
    { table: 'app_users', command: 'DELETE', reason: 'public-write-policy' },
  ];
  const warnings = rlsPolicyWarnings(findings);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('de DELETE sobre app_users'));
});

test('G-2 BIS: rlsPolicyWarnings es vacío sin hallazgos peligrosos', () => {
  assert.deepEqual(rlsPolicyWarnings([]), []);
  assert.deepEqual(
    rlsPolicyWarnings([{ table: null, command: null, reason: 'unparseable' }]),
    []
  );
});

// --- Telemetría y set cerrado, sin cambios de contrato ---------------------

test('G-2 BIS: rlsPolicyBlockedTelemetry sigue produciendo la marca ordenada y deduplicada', () => {
  const findings = [
    { table: 'app_users', policy: 'public delete', reason: 'public-write-policy' },
    { table: 'app_users', policy: 'public insert', reason: 'public-write-policy' },
  ];
  assert.equal(
    rlsPolicyBlockedTelemetry(findings),
    ' [RLS_POLICY_BLOCKED:app_users:public delete,app_users:public insert]'
  );
});

test('G-2 BIS: ROLE_COLUMN_NAMES sigue siendo el mismo set cerrado congelado', () => {
  assert.equal(Object.isFrozen(ROLE_COLUMN_NAMES), true);
  assert.deepEqual(
    [...ROLE_COLUMN_NAMES].sort(),
    ['is_admin', 'permission', 'permissions', 'role', 'roles', 'user_role'].sort()
  );
});

// --- El acoplamiento con la fuente (sigue verde tras BLOQUE 1-BIS) ---------

test('G-2 BIS: AIOrchestrator sigue enganchando el guard y pintando el aviso en warnings', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'services', 'AIOrchestrator.ts'),
    'utf8'
  );

  assert.match(
    source,
    /import \{\s*evaluateRlsPolicies,\s*removeDangerousPolicies,\s*rlsPolicyBlockedTelemetry,\s*rlsPolicyWarnings,\s*\} from '\.\.\/utils\/rlsPolicyGuard\.js';/,
    'el guard entra desde el módulo puro'
  );

  assert.match(
    source,
    /const rlsMigrationPaths = persistedPaths\.filter\(isMigrationPath\);/,
    'el guard evalúa los persistedPaths que son migración'
  );

  assert.match(
    source,
    /this\.notifyFileUpdate\(path, cleaned\);/,
    'la migración limpia se reescribe por el mismo camino de persistencia'
  );

  // El aviso tiene que pintarse por `warnings` (el campo que esta rama de
  // éxito de verdad devuelve como `warning`), NUNCA por chatResponse — que en
  // esta rama nunca se lee. Si alguien mueve el aviso a un canal que el
  // return no pinta, este test se pone rojo.
  assert.match(
    source,
    /for \(const rlsWarning of rlsWarnings\) \{\s*warnings\.push\(rlsWarning\);\s*\}/,
    'el aviso se empuja a warnings, el canal que el chat realmente pinta en esta rama'
  );

  assert.match(
    source,
    /functionDeployFailedMark \+ rlsPolicyBlockedMark,/,
    'la marca de telemetría entra al user_prompt de forge_intent_log'
  );
});
