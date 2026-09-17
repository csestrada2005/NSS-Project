import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRlsPolicies,
  removeDangerousPolicies,
  addMissingRls,
  rlsPolicyBlockedTelemetry,
  rlsEnabledTelemetry,
  rlsUnreadableTelemetry,
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

test('G-5: CREATE TABLE sin columna de rol, sin enable RLS, AHORA recibe la sentencia (antes quedaba intacta)', () => {
  const sql = `
    create table productos (id uuid primary key, nombre text);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls.length, 1);
  assert.equal(missingRls[0].table, 'productos');
  assert.equal(missingRls[0].roleTable, false, 'productos no es tabla de rol');
  const cleaned = applyGuard(sql, verdict.findings);
  assert.ok(cleaned.includes('alter table productos enable row level security;'));
});

test('G-5: el aviso de una tabla sin rol no menciona "columna de rol" ni la función de servidor', () => {
  const sql = `create table productos (id uuid primary key, nombre text);`;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const warnings = rlsPolicyWarnings(verdict.findings);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('productos'));
  assert.ok(warnings[0].includes('no será legible desde el navegador'));
  assert.ok(!warnings[0].includes('columna de rol'), 'productos no tiene columna de rol');
  assert.ok(!warnings[0].includes('función de servidor'), 'no hay función de servidor que nombrar');
});

test('G-5: ALTER TABLE ... ADD COLUMN sobre una tabla SIN columna de rol y SIN CREATE TABLE en el lote no dispara nada (sólo CREATE amplía el alcance)', () => {
  const sql = `
    alter table productos add column descripcion text;
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(
    missingRls.length,
    0,
    'una tabla preexistente que sólo recibe una columna puede ya tener RLS de una migración anterior fuera de este lote'
  );
  assert.equal(applyGuard(sql, verdict.findings), sql);
});

test('G-5, regresión en vivo (QUEUE ítem 0): control_cd_g4, sin columna de rol y sin RLS, ya no queda invisible para el guard', () => {
  // SQL real persistido en la corrida `control_cd_g4` sobre Vertigo
  // (087ddaf3-6236-47ae-ba72-bc96887a9691) que motivó esta cirugía: cero
  // columnas de rol, cero RLS, cero políticas — antes de G-5 el guard no
  // decía nada.
  const sql = `create table if not exists public.control_cd_g4 (
  id serial primary key,
  note text
);

comment on table public.control_cd_g4 is 'wyrd:read=public';`;
  const verdict = evaluateRlsPolicies([{ path: 'supabase/migrations/x_create_control_cd_g4.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls.length, 1);
  assert.equal(missingRls[0].table, 'control_cd_g4');
  assert.equal(missingRls[0].roleTable, false);
  const cleaned = applyGuard(sql, verdict.findings);
  assert.ok(cleaned.includes('alter table public.control_cd_g4 enable row level security;'));
});

test('G-5, regresión en vivo (QUEUE ítem 0): customer_reviews, insert público sin columna de rol, sigue SIN tocarse (decisión de producto, no bug)', () => {
  // SQL real persistido en la corrida `customer_reviews`: RLS ya está
  // encendida y trae un insert público deliberado (un formulario de
  // reseñas). Sin columna de rol, así que la comprobación de políticas
  // (BLOQUE 1-BIS, sin cambios en G-5) no debe tocarlo.
  const sql = `create table if not exists public.customer_reviews (
  id         serial primary key,
  name       text not null,
  rating     integer not null check (rating >= 1 and rating <= 5),
  comment    text not null,
  created_at timestamptz not null default now()
);

alter table public.customer_reviews enable row level security;

create policy "Anyone can insert reviews"
  on public.customer_reviews
  for insert
  with check (true);

create policy "Public can read reviews"
  on public.customer_reviews
  for select
  using (true);`;
  const verdict = evaluateRlsPolicies([{ path: 'supabase/migrations/x_create_customer_reviews.sql', sql }]);
  assert.equal(
    verdict.findings.filter((f) => f.reason === 'missing-rls').length,
    0,
    'RLS ya estaba encendida'
  );
  assert.equal(
    verdict.findings.filter((f) => f.reason === 'public-write-policy').length,
    0,
    'customer_reviews no es tabla de rol: el insert público es una decisión de producto válida'
  );
  assert.equal(applyGuard(sql, verdict.findings), sql, 'el SQL no se toca');
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

// G-5: estas dos pruebas fijan RLS ya encendida a propósito — su objeto es
// el precedente de coincidencia de nombre (tabla/columna que PARECE "role"
// sin serlo), no el requisito de RLS. Desde G-5 cualquier CREATE TABLE sin
// RLS recibe la sentencia (ver los tests de arriba), así que sin esta RLS ya
// puesta ambas dejarían de probar lo que dicen probar.

test('G-2 TER: una tabla llamada roles_de_juego, sin columna de rol, no se trata como tabla de rol para políticas', () => {
  const sql = `
    create table roles_de_juego (id uuid primary key, puntuacion integer);
    alter table roles_de_juego enable row level security;
    create policy "public insert" on roles_de_juego for insert with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.findings.filter((f) => f.reason === 'missing-rls').length, 0, 'RLS ya estaba encendida');
  assert.equal(
    verdict.findings.filter((f) => f.reason === 'public-write-policy').length,
    0,
    'roles_de_juego no tiene columna de rol pese al nombre de la tabla'
  );
  assert.equal(applyGuard(sql, verdict.findings), sql);
});

test('G-2 TER: una columna llamada control no se trata como columna de rol (precedente C2-3)', () => {
  const sql = `
    create table configuraciones (id uuid primary key, control text);
    alter table configuraciones enable row level security;
    create policy "public insert" on configuraciones for insert with check (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(verdict.findings.filter((f) => f.reason === 'missing-rls').length, 0, 'RLS ya estaba encendida');
  assert.equal(
    verdict.findings.filter((f) => f.reason === 'public-write-policy').length,
    0,
    'la columna "control" no es "role" (C2-3)'
  );
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

test('G-5: dos tablas en el mismo lote, una con rol y otra sin — AMBAS reciben la sentencia (antes sólo la de rol)', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create table productos (id uuid primary key, nombre text);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  const missingRls = verdict.findings.filter((f) => f.reason === 'missing-rls');
  assert.equal(missingRls.length, 2);
  const byTable = new Map(missingRls.map((f) => [f.table, f]));
  assert.equal(byTable.get('app_users').roleTable, true);
  assert.equal(byTable.get('productos').roleTable, false);
  const cleaned = applyGuard(sql, verdict.findings);
  assert.ok(cleaned.includes('alter table app_users enable row level security;'));
  assert.ok(cleaned.includes('alter table productos enable row level security;'));
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

// --- rlsEnabledTelemetry (AÑADIDO al BLOQUE 1-TER) -------------------------

test('G-2 TER: rlsEnabledTelemetry es cadena vacía cuando no se encendió ninguna RLS', () => {
  assert.equal(rlsEnabledTelemetry([]), '');
  assert.equal(
    rlsEnabledTelemetry([{ table: 'app_users', reason: 'public-write-policy' }]),
    ''
  );
});

test('G-2 TER: rlsEnabledTelemetry produce la marca con una sola tabla', () => {
  const findings = [{ table: 'app_users', reason: 'missing-rls' }];
  assert.equal(rlsEnabledTelemetry(findings), ' [RLS_ENABLED:app_users]');
});

test('G-2 TER: rlsEnabledTelemetry ordena y deduplica varias tablas', () => {
  const findings = [
    { table: 'invites', reason: 'missing-rls' },
    { table: 'app_users', reason: 'missing-rls' },
    { table: 'app_users', reason: 'missing-rls' },
  ];
  assert.equal(rlsEnabledTelemetry(findings), ' [RLS_ENABLED:app_users,invites]');
});

test('G-2 TER: rlsEnabledTelemetry y rlsPolicyBlockedTelemetry coexisten en la misma corrida', () => {
  const sql = `
    create table app_users (id uuid primary key, role text);
    create policy "public delete" on app_users for delete using (true);
  `;
  const verdict = evaluateRlsPolicies([{ path: 'x.sql', sql }]);
  assert.equal(rlsEnabledTelemetry(verdict.findings), ' [RLS_ENABLED:app_users]');
  assert.equal(
    rlsPolicyBlockedTelemetry(verdict.findings),
    ' [RLS_POLICY_BLOCKED:app_users:public delete]'
  );
});

// ---------------------------------------------------------------------------
// BRIEF G-3 — CONECTAR LA ALARMA 'unparseable'.
//
// evaluateRlsPolicies ya devolvía `reason: 'unparseable'` con
// `dangerous: true` para un archivo ilegible, pero nada lo consumía. Estas
// pruebas cubren rlsUnreadableTelemetry (la marca de log) y el nuevo caso
// en rlsPolicyWarnings (el aviso al usuario) — puramente de comportamiento,
// sin tocar AIOrchestrator.ts: el cableado de la Pieza 1 (claves
// origen/destino) no tiene un harness de comportamiento en este repo sin
// inventar uno nuevo, así que su verificación queda para el humano en
// producción, tal como pide el brief.
// ---------------------------------------------------------------------------

test('G-3: rlsUnreadableTelemetry es cadena vacía sin hallazgos unparseable', () => {
  assert.equal(rlsUnreadableTelemetry([]), '');
  assert.equal(
    rlsUnreadableTelemetry([{ path: 'x.sql', reason: 'missing-rls' }]),
    ''
  );
});

test('G-3: rlsUnreadableTelemetry produce la marca con un solo path', () => {
  const findings = [{ path: 'supabase/migrations/x.sql', reason: 'unparseable' }];
  assert.equal(
    rlsUnreadableTelemetry(findings),
    ' [RLS_UNREADABLE:supabase/migrations/x.sql]'
  );
});

test('G-3: rlsUnreadableTelemetry ordena y deduplica varios paths', () => {
  const findings = [
    { path: 'supabase/migrations/b.sql', reason: 'unparseable' },
    { path: 'supabase/migrations/a.sql', reason: 'unparseable' },
    { path: 'supabase/migrations/a.sql', reason: 'unparseable' },
  ];
  assert.equal(
    rlsUnreadableTelemetry(findings),
    ' [RLS_UNREADABLE:supabase/migrations/a.sql,supabase/migrations/b.sql]'
  );
});

test('G-3: rlsUnreadableTelemetry surge de un evaluateRlsPolicies real sobre SQL ilegible', () => {
  const verdict = evaluateRlsPolicies([{ path: 'supabase/migrations/roto.sql', sql: '' }]);
  assert.equal(verdict.dangerous, true);
  assert.equal(
    rlsUnreadableTelemetry(verdict.findings),
    ' [RLS_UNREADABLE:supabase/migrations/roto.sql]'
  );
});

test('G-3: rlsPolicyWarnings produce el texto literal acordado para un archivo ilegible', () => {
  const findings = [{ path: 'supabase/migrations/roto.sql', reason: 'unparseable' }];
  const warnings = rlsPolicyWarnings(findings);
  assert.equal(warnings.length, 1);
  assert.equal(
    warnings[0],
    'No pude revisar la seguridad de esta migración antes de proponértela: ' +
      'supabase/migrations/roto.sql. Revísala antes de aplicarla.'
  );
});

test('G-3: rlsPolicyWarnings no repite el mismo path ilegible dos veces', () => {
  const findings = [
    { path: 'supabase/migrations/roto.sql', reason: 'unparseable' },
    { path: 'supabase/migrations/roto.sql', reason: 'unparseable' },
  ];
  assert.equal(rlsPolicyWarnings(findings).length, 1);
});

test('G-3: rlsPolicyWarnings combina un aviso de tabla y uno de archivo ilegible, sin mezclarlos', () => {
  const findings = [
    { table: 'app_users', command: 'DELETE', reason: 'public-write-policy' },
    { path: 'supabase/migrations/roto.sql', reason: 'unparseable' },
  ];
  const warnings = rlsPolicyWarnings(findings);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some((w) => w.includes('app_users')));
  assert.ok(warnings.some((w) => w.includes('roto.sql')));
});

test('G-3: evaluateRlsPolicies real produce un aviso legible para el SQL ilegible del lote', () => {
  const verdict = evaluateRlsPolicies([{ path: 'supabase/migrations/roto.sql', sql: null }]);
  const warnings = rlsPolicyWarnings(verdict.findings);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].startsWith('No pude revisar la seguridad de esta migración'));
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

// --- El acoplamiento con AIOrchestrator ------------------------------------
//
// BRIEF G-3 — regla dura: un test que valida por regex sobre el código
// fuente no cuenta como evidencia. El anclaje que vivía aquí (uno por cada
// bloque anterior) queda retirado a propósito en vez de parcheado: el
// cableado de la Pieza 1 (dos claves — origen para leer `finalFiles`/
// `files`, destino para `notifyFileUpdate` y para lo que ve el usuario) es
// un comportamiento de integración de AIOrchestrator.ts que este archivo no
// puede ejercitar sin invocar el pipeline completo (Architect → Implementer
// → Verifier, projectId real, StudioEngine) — inventar ese harness aquí
// sería la clase de invención que el brief pide no hacer. La verificación
// de la Pieza 1 es de comportamiento en producción y la hace el humano,
// como pide el brief; lo que este archivo sigue verificando en detalle es
// el comportamiento puro de rlsPolicyGuard.js (arriba, con SQL real).
