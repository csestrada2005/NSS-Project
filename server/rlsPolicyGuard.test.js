import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateRlsPolicies,
  removeDangerousPolicies,
  addMissingRls,
  rlsPolicyBlockedTelemetry,
  rlsPolicyWarnings,
  ROLE_COLUMN_NAMES,
} from '../src/utils/rlsPolicyGuard.js';

// ---------------------------------------------------------------------------
// BLOQUE 1-TER (cirugía G-2) — EXIGIR QUE RLS ESTÉ ENCENDIDA.
//
// El segundo checkpoint en vivo sobre Vertigo (087ddaf3-6236-47ae-ba72-
// bc96887a9691) generó una tabla app_users con columna role, CERO políticas
// RLS, y sin `enable row level security`. Una tabla del esquema public sin
// RLS habilitada es accesible con la clave anónima sin restricción alguna —
// select, insert, update y delete desde la consola del navegador. Mayor
// agujero que el del primer checkpoint, y que el guard de políticas no podía
// ver: inspecciona políticas, y aquí no había ninguna.
//
// La comprobación de RLS es SEGUNDA e INDEPENDIENTE de la de políticas
// (BLOQUE 1-BIS), con la misma fuente de verdad ("tabla con columna de rol").
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const applyGuard = (sql, findings) => removeDangerousPolicies(addMissingRls(sql, findings), findings);

// --- FIXTURE A — checkpoint 1, v2: RLS ya encendida, sólo la de políticas dispara --

const FIXTURE_A_SQL = `
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'member'
);

alter table public.app_users enable row level security;

create policy "public_select_app_users"
  on public.app_users
  for select
  using (true);

create policy "public_delete_app_users"
  on public.app_users
  for delete
  using (true);
`;

test('G-2 TER — FIXTURE A (checkpoint 1, v2): RLS ya encendida, no se toca; se elimina public_delete', () => {
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql: FIXTURE_A_SQL }]);

  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  const policies = verdict.findings.filter((f) => f.reason === 'public-write-policy');

  assert.equal(missingRls.length, 0, 'RLS ya estaba encendida: la comprobación de RLS no se dispara');
  assert.equal(policies.length, 1);
  assert.equal(policies[0].command, 'DELETE');

  const cleaned = applyGuard(FIXTURE_A_SQL, verdict.findings);
  assert.ok(cleaned.includes('public_select_app_users'), 'select sobrevive');
  assert.ok(!cleaned.includes('public_delete_app_users'), 'delete eliminada');
  assert.equal(
    (cleaned.match(/enable row level security/g) ?? []).length,
    1,
    'RLS sigue apareciendo UNA sola vez — no se duplicó'
  );
});

// --- FIXTURE B — checkpoint 2, v3: el SQL real, sin RLS y sin políticas -----

const FIXTURE_B_SQL = `drop table if exists public.app_users;

create table public.app_users (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  role         text not null default 'cliente' check (role in ('admin','cliente')),
  status       text not null default 'active' check (status in ('active','inactive')),
  invited_at   timestamptz not null default now()
);

comment on table public.app_users is 'wyrd:read=public';
create index if not exists app_users_role_idx on public.app_users (role);
create index if not exists app_users_status_idx on public.app_users (status);
`;

test('G-2 TER — FIXTURE B (checkpoint 2, v3): sin RLS y sin políticas, se añade enable RLS y no se inventa ninguna política', () => {
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql: FIXTURE_B_SQL }]);

  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  const policies = verdict.findings.filter((f) => f.reason === 'public-write-policy');

  assert.equal(missingRls.length, 1);
  assert.equal(missingRls[0].table, 'app_users');
  assert.equal(missingRls[0].statement, 'alter table public.app_users enable row level security;');
  assert.equal(policies.length, 0, 'no había ninguna política que eliminar');

  const cleaned = applyGuard(FIXTURE_B_SQL, verdict.findings);
  assert.ok(
    cleaned.includes('alter table public.app_users enable row level security;'),
    'la sentencia se añadió tal cual'
  );
  assert.ok(!/create policy/i.test(cleaned), 'no se inventó ninguna política');

  // La sentencia va justo tras el CREATE TABLE, antes del resto del lote.
  const createIdx = cleaned.indexOf('create table public.app_users');
  const enableIdx = cleaned.indexOf('enable row level security');
  const commentIdx = cleaned.indexOf("comment on table public.app_users");
  assert.ok(createIdx < enableIdx, 'la sentencia queda después del CREATE TABLE');
  assert.ok(enableIdx < commentIdx, 'la sentencia queda antes del resto del lote');

  const warnings = rlsPolicyWarnings(verdict.findings);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('app_users'), 'el aviso nombra la tabla');
  assert.ok(
    warnings[0].includes('no será legible desde el navegador') ||
      warnings[0].includes('no es legible desde el navegador'),
    'el aviso advierte de la consecuencia funcional'
  );
});

// --- Casos granulares mínimos ------------------------------------------

test('G-2 TER: CREATE TABLE con columna de rol, sin enable RLS, se añade', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls.length, 1);
  assert.equal(missingRls[0].table, 'app_users');
  const cleaned = applyGuard(sql, verdict.findings);
  assert.ok(cleaned.includes('alter table app_users enable row level security;'));
});

test('G-2 TER: CREATE TABLE con columna de rol, CON enable RLS, queda intacta', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    alter table app_users enable row level security;
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls.length, 0);
  assert.equal(applyGuard(sql, verdict.findings), sql);
});

test('G-2 TER: CREATE TABLE sin columna de rol, sin enable RLS, queda intacta', () => {
  const sql = `
    create table productos (id uuid primary key, nombre text);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls.length, 0);
  assert.equal(applyGuard(sql, verdict.findings), sql);
});

test('G-2 TER: ALTER TABLE que añade columna de rol a tabla existente, sin enable RLS en el lote, se añade', () => {
  const sql = `
    alter table app_users add column role text not null default 'member';
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls.length, 1);
  assert.equal(missingRls[0].statement, 'alter table app_users enable row level security;');
  const cleaned = applyGuard(sql, verdict.findings);
  assert.ok(cleaned.includes('alter table app_users enable row level security;'));
  // Se añade DESPUÉS del ALTER que trajo la columna, no antes.
  assert.ok(cleaned.indexOf("add column role") < cleaned.indexOf('enable row level security'));
});

test('G-2 TER: tabla con rol sin RLS Y con política pública de delete — se disparan las dos, el aviso menciona ambas', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "public delete" on app_users for delete using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  const policies = verdict.findings.filter((f) => f.reason === 'public-write-policy');
  assert.equal(missingRls.length, 1);
  assert.equal(policies.length, 1);

  const cleaned = applyGuard(sql, verdict.findings);
  assert.ok(cleaned.includes('alter table app_users enable row level security;'));
  assert.ok(!cleaned.includes('public delete'));

  const warnings = rlsPolicyWarnings(verdict.findings);
  assert.equal(warnings.length, 1, 'un solo aviso por tabla, no dos');
  assert.ok(warnings[0].includes('Row level security'), 'menciona RLS');
  assert.ok(warnings[0].includes('DELETE'), 'menciona la operación eliminada');
});

// --- El anclaje (reutilizado sin relajar) -----------------------------

test('G-2 TER: una tabla llamada roles_de_juego, sin columna de rol, queda intacta', () => {
  const sql = `
    create table roles_de_juego (id uuid primary key, puntuacion integer);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.findings.filter((f) => f.reason === 'missing-rls').length, 0);
  assert.equal(applyGuard(sql, verdict.findings), sql);
});

test('G-2 TER: una columna llamada control queda intacta (precedente C2-3)', () => {
  const sql = `
    create table configuraciones (id uuid primary key, control text);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.findings.filter((f) => f.reason === 'missing-rls').length, 0);
  assert.equal(applyGuard(sql, verdict.findings), sql);
});

// --- Fail-closed (compartido con BLOQUE 1-BIS) ------------------------

test('G-2 TER: SQL ilegible o vacío sigue siendo peligroso (fail-closed)', () => {
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: '' }]).dangerous, true);
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: null }]).dangerous, true);
  assert.equal(evaluateRlsPolicies([{ path: 'x.sql', sql: 42 }]).dangerous, true);
});

// --- Aislamiento entre las dos comprobaciones (defensivo) -----------------

test('G-2 TER: addMissingRls ignora findings con otro reason', () => {
  const sql = 'create table app_users (id uuid primary key, role text);';
  const foreign = [{ reason: 'public-write-policy', statement: 'create policy x on y for insert;', insertAt: 5 }];
  assert.equal(addMissingRls(sql, foreign), sql);
});

test('G-2 TER: removeDangerousPolicies ignora findings con reason missing-rls', () => {
  const sql = 'create table app_users (id uuid primary key, role text);';
  const foreign = [{ reason: 'missing-rls', statement: 'alter table app_users enable row level security;' }];
  assert.equal(removeDangerousPolicies(sql, foreign), sql);
});

test('G-2 TER: el nombre de tabla en el finding missing-rls está sin calificar (mismo criterio que las políticas)', () => {
  const sql = 'create table public.app_users (id uuid primary key, role text);';
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls[0].table, 'app_users');
  assert.equal(missingRls[0].statement, 'alter table public.app_users enable row level security;');
});

// --- El punto de inserción ------------------------------------------------

test('G-2 TER: la sentencia se inserta después del CREATE TABLE y antes de cualquier política', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "authenticated read" on app_users for select to authenticated using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const cleaned = applyGuard(sql, verdict.findings);
  const createIdx = cleaned.indexOf('create table app_users');
  const enableIdx = cleaned.indexOf('enable row level security');
  const policyIdx = cleaned.indexOf('create policy');
  assert.ok(createIdx < enableIdx && enableIdx < policyIdx);
});

// --- Idempotencia --------------------------------------------------------

test('G-2 TER: correr el guard dos veces sobre el mismo archivo da el mismo resultado', () => {
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql: FIXTURE_B_SQL }]);
  const once = applyGuard(FIXTURE_B_SQL, verdict.findings);
  const verdictAgain = evaluateRlsPolicies([{ path: 'x.sql', sql: once }]);
  const twice = applyGuard(once, verdictAgain.findings);
  assert.equal(once, twice);
  assert.equal(verdictAgain.findings.filter((f) => f.reason === 'missing-rls').length, 0);
});

test('G-2 TER: addMissingRls es idempotente sobre el MISMO finding', () => {
  const sql = `create table app_users (id uuid primary key, role text);`;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const once = addMissingRls(sql, verdict.findings);
  const twice = addMissingRls(once, verdict.findings);
  assert.equal(once, twice);
});

// --- Dos tablas en el mismo lote ------------------------------------------

test('G-2 TER: dos tablas en el mismo lote, una con rol y otra sin — sólo la primera recibe la sentencia', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create table productos (id uuid primary key, nombre text);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls.length, 1);
  assert.equal(missingRls[0].table, 'app_users');
  const cleaned = applyGuard(sql, verdict.findings);
  assert.ok(cleaned.includes('alter table app_users enable row level security;'));
  assert.ok(!cleaned.includes('alter table productos enable row level security;'));
});

// --- El aviso ------------------------------------------------------------

test('G-2 TER: rlsPolicyWarnings, sólo falta RLS (sin políticas), advierte de la consecuencia funcional', () => {
  const findings = [{ table: 'app_users', command: null, reason: 'missing-rls' }];
  const warnings = rlsPolicyWarnings(findings);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('Row level security'));
  assert.ok(warnings[0].includes('app_users'));
  assert.ok(warnings[0].includes('no será legible desde el navegador'));
});

test('G-2 TER: rlsPolicyBlockedTelemetry no se ve afectada por hallazgos missing-rls', () => {
  const findings = [{ table: 'app_users', policy: null, reason: 'missing-rls' }];
  assert.equal(rlsPolicyBlockedTelemetry(findings), '');
});

// --- Contrato intacto de BLOQUE 1-BIS ------------------------------------

test('G-2 TER: ROLE_COLUMN_NAMES sigue siendo el mismo set cerrado congelado', () => {
  assert.equal(Object.isFrozen(ROLE_COLUMN_NAMES), true);
  assert.deepEqual(
    [...ROLE_COLUMN_NAMES].sort(),
    ['is_admin', 'permission', 'permissions', 'role', 'roles', 'user_role'].sort()
  );
});

test('G-2 TER: una política pública de DELETE sigue eliminándose igual que antes', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    alter table app_users enable row level security;
    create policy "public delete" on app_users for delete using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const cleaned = applyGuard(sql, verdict.findings);
  assert.ok(!cleaned.includes('public delete'));
});

// --- El acoplamiento con la fuente ------------------------------------------

test('G-2 TER: AIOrchestrator engancha addMissingRls ANTES de removeDangerousPolicies y sigue pintando en warnings', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'services', 'AIOrchestrator.ts'),
    'utf8'
  );

  assert.match(
    source,
    /import \{\s*evaluateRlsPolicies,\s*removeDangerousPolicies,\s*addMissingRls,\s*rlsPolicyBlockedTelemetry,\s*rlsPolicyWarnings,\s*\} from '\.\.\/utils\/rlsPolicyGuard\.js';/,
    'el guard entra desde el módulo puro, con addMissingRls'
  );

  assert.match(
    source,
    /const withRlsEnabled = addMissingRls\(original, pathFindings\);\s*\n\s*const cleaned = removeDangerousPolicies\(withRlsEnabled, pathFindings\);/,
    'addMissingRls corre ANTES que removeDangerousPolicies, sobre el mismo archivo'
  );

  assert.match(
    source,
    /this\.notifyFileUpdate\(path, cleaned\);/,
    'el resultado se reescribe por el mismo camino de persistencia'
  );

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
