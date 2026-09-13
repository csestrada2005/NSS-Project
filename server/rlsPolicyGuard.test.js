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
// BLOQUE 1 (cirugía G-2) — GUARD DE POLÍTICAS RLS PELIGROSAS.
//
// EL AGUJERO, MEDIDO EN VIVO: Wyrd generó, en el mismo lote, una Edge
// Function correcta con service-role ("This is the ONLY place where
// privileged mutations occur") y una migración cuyo propio plan decía "Adds
// RLS policies for public insert and update so the invite and
// role-assignment flows work without auth sessions" sobre `app_users`, una
// tabla con columna `role`. Cualquier visitante con la consola del navegador
// podía asignarse `role='admin'` con un UPDATE directo. La función quedaba
// decorativa.
//
// LA CONDICIÓN: (1) política que concede INSERT/UPDATE/ALL, (2) a un rol
// público/anónimo (o sin `TO`, que en Postgres cae en PUBLIC), (3) sobre una
// tabla con una columna de rol/permisos del set cerrado ROLE_COLUMN_NAMES.
// Las tres a la vez — nunca una sola.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- El caso de resultado conocido, primero y obligatorio -------------------

test('G-2: el caso real (app_users, columna role, public insert + public update) se marca peligroso', () => {
  const sql = `
    create table app_users (
      id uuid primary key,
      email text not null,
      role text not null default 'user'
    );

    create policy "public insert" on app_users
      for insert
      to public
      with check (true);

    create policy "public update" on app_users
      for update
      using (true);
  `;

  const verdict = evaluateRlsPolicies([{ path: 'supabase/migrations/20240101000000_app_users.sql', sql }]);

  assert.equal(verdict.dangerous, true);
  assert.equal(verdict.findings.length, 2);
  assert.deepEqual(verdict.findings.map((f) => f.table).sort(), ['app_users', 'app_users']);
  assert.deepEqual(verdict.findings.map((f) => f.command).sort(), ['INSERT', 'UPDATE']);
  assert.ok(verdict.findings.every((f) => f.reason === 'public-write-policy'));
});

// --- Los negativos ------------------------------------------------------

test('G-2: public SELECT sobre tabla con columna de rol NO es peligroso', () => {
  const sql = `
    create table app_users (
      id uuid primary key,
      role text
    );
    create policy "read all" on app_users
      for select
      to public
      using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
});

test('G-2: public INSERT sobre tabla SIN columna de rol (productos) NO es peligroso', () => {
  const sql = `
    create table productos (
      id uuid primary key,
      nombre text
    );
    create policy "public insert" on productos
      for insert
      to public
      with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
});

test('G-2: INSERT restringido a authenticated sobre tabla con rol NO es peligroso', () => {
  const sql = `
    create table app_users (
      id uuid primary key,
      role text
    );
    create policy "authenticated insert" on app_users
      for insert
      to authenticated
      with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
});

// --- El anclaje -------------------------------------------------------------

test('G-2: una tabla llamada roles_de_juego, sin columna de rol, NO dispara el guard', () => {
  // La sustring "roles" en el NOMBRE de la tabla no puede ser lo que decide:
  // sólo cuenta una columna real del set cerrado. roles_de_juego no tiene
  // ninguna.
  const sql = `
    create table roles_de_juego (
      id uuid primary key,
      puntuacion integer
    );
    create policy "public insert" on roles_de_juego
      for insert
      to public
      with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
});

test('G-2: una columna llamada control NO dispara el guard (precedente C2-3)', () => {
  // "control" contiene la subcadena "rol" (con-t-ROL); el fallo medido en
  // C2-3 fue justo una comparación por subcadena que hacía match ahí. Este
  // guard compara identificadores completos, así que control !== role.
  const sql = `
    create table configuraciones (
      id uuid primary key,
      control text
    );
    create policy "public insert" on configuraciones
      for insert
      to public
      with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, false);
});

// --- Fail-closed --------------------------------------------------------

test('G-2: SQL ilegible o vacío es peligroso (fail-closed)', () => {
  // Ante la duda, true — un falso positivo cuesta un aviso de más, un falso
  // negativo cuesta un agujero de privilegios. Mismo razonamiento que
  // migrationGate.js.
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: '' }]).dangerous, true);
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: '   ' }]).dangerous, true);
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: null }]).dangerous, true);
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: undefined }]).dangerous, true);
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: 42 }]).dangerous, true);
});

test('G-2: un hallazgo unparseable no trae tabla ni política que nombrar', () => {
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql: '' }]);
  assert.equal(verdict.findings.length, 1);
  assert.equal(verdict.findings[0].reason, 'unparseable');
  assert.equal(verdict.findings[0].table, null);
  assert.equal(verdict.findings[0].policy, null);
  assert.equal(verdict.findings[0].statement, null);
});

// --- ALL ---------------------------------------------------------------

test('G-2: una política ALL sobre tabla con columna de rol es peligrosa', () => {
  const sql = `
    create table app_users (
      id uuid primary key,
      role text
    );
    create policy "manage all" on app_users
      for all
      to public
      using (true)
      with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.dangerous, true);
  assert.equal(verdict.findings[0].command, 'ALL');
});

// --- Idempotencia ------------------------------------------------------

test('G-2: correr el guard dos veces sobre el mismo lote da el mismo veredicto', () => {
  const batch = [
    {
      path: 'supabase/migrations/20240101000000_app_users.sql',
      sql: `
        create table app_users (id uuid primary key, role text);
        create policy "public insert" on app_users for insert to public with check (true);
      `,
    },
  ];
  const first = evaluateRlsPolicies(batch);
  const second = evaluateRlsPolicies(batch);
  assert.deepEqual(first, second);
});

// --- La reacción: eliminar, telemetría, aviso -------------------------

test('G-2: removeDangerousPolicies borra la sentencia peligrosa y deja el resto intacto', () => {
  const sql =
    'create table app_users (id uuid primary key, role text);\n' +
    'create policy "public insert" on app_users for insert to public with check (true);\n' +
    'create policy "self read" on app_users for select using (auth.uid() = id);';

  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const cleaned = removeDangerousPolicies(sql, verdict.findings);

  assert.equal(cleaned.includes('public insert'), false);
  assert.equal(cleaned.includes('self read'), true);
  assert.equal(cleaned.includes('create table app_users'), true);
});

test('G-2: removeDangerousPolicies es idempotente sobre el mismo finding', () => {
  const sql =
    'create table app_users (id uuid primary key, role text);\n' +
    'create policy "public insert" on app_users for insert to public with check (true);';
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const once = removeDangerousPolicies(sql, verdict.findings);
  const twice = removeDangerousPolicies(once, verdict.findings);
  assert.equal(once, twice);
});

test('G-2: rlsPolicyBlockedTelemetry produce la marca ordenada y deduplicada', () => {
  const findings = [
    { table: 'app_users', policy: 'public update', reason: 'public-write-policy' },
    { table: 'app_users', policy: 'public insert', reason: 'public-write-policy' },
  ];
  assert.equal(
    rlsPolicyBlockedTelemetry(findings),
    ' [RLS_POLICY_BLOCKED:app_users:public insert,app_users:public update]'
  );
});

test('G-2: rlsPolicyBlockedTelemetry es cadena vacía sin hallazgos peligrosos', () => {
  assert.equal(rlsPolicyBlockedTelemetry([]), '');
  assert.equal(
    rlsPolicyBlockedTelemetry([{ table: null, policy: null, reason: 'unparseable' }]),
    ''
  );
});

test('G-2: rlsPolicyWarnings produce el texto literal acordado, una vez por tabla', () => {
  const findings = [
    { table: 'app_users', reason: 'public-write-policy' },
    { table: 'app_users', reason: 'public-write-policy' },
  ];
  const warnings = rlsPolicyWarnings(findings);
  assert.equal(warnings.length, 1);
  assert.equal(
    warnings[0],
    'Guard de seguridad: se corrigió la migración generada. Política de escritura pública ' +
      'sobre app_users (tabla con columna de rol). Eliminada antes de proponer la migración. ' +
      'La gestión de usuarios sigue por la función de servidor correspondiente.'
  );
});

// --- El set cerrado ------------------------------------------------------

test('G-2: ROLE_COLUMN_NAMES es el set cerrado congelado', () => {
  assert.equal(Object.isFrozen(ROLE_COLUMN_NAMES), true);
  assert.deepEqual(
    [...ROLE_COLUMN_NAMES].sort(),
    ['is_admin', 'permission', 'permissions', 'role', 'roles', 'user_role'].sort()
  );
});

// --- El acoplamiento con la fuente ------------------------------------------

test('G-2: AIOrchestrator engancha el guard antes de ofrecer la migración y el aviso pinta en warnings', () => {
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
