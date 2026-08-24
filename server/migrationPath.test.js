import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIGRATIONS_DIR,
  ddlProposedTelemetry,
  isMigrationPath,
  resolveMigrationRenames,
  utcStamp,
} from '../src/utils/migrationPath.js';

// ---------------------------------------------------------------------------
// migrationPath — el nombre de una migración es su IDENTIDAD.
//
// El incidente: el LLM copia literal el `20240101000000` de la documentación de
// Supabase en TODAS las migraciones que genera. Como forge_files tiene clave
// (project_id, path), la segunda migración de un proyecto no se añade — PISA a
// la primera. Y el prefijo temporal es lo que ordena unas migraciones respecto
// de otras, así que dos nombres iguales no son un detalle cosmético: son dos
// identidades fundidas en una.
// ---------------------------------------------------------------------------

const T = Date.UTC(2026, 7, 24, 13, 45, 30); // 2026-08-24T13:45:30Z

test('utcStamp emite YYYYMMDDHHMMSS en UTC', () => {
  assert.equal(utcStamp(T), '20260824134530');
  assert.equal(utcStamp(new Date(T)), '20260824134530');
  // Zero-padding de mes, día y hora — un 1 de enero a las 02:03:04.
  assert.equal(utcStamp(Date.UTC(2026, 0, 1, 2, 3, 4)), '20260101020304');
});

test('isMigrationPath sólo acepta .sql bajo supabase/migrations/', () => {
  assert.equal(isMigrationPath(`${MIGRATIONS_DIR}20240101000000_init.sql`), true);
  assert.equal(isMigrationPath(`${MIGRATIONS_DIR}20240101000000_init.SQL`), true);
  assert.equal(isMigrationPath('src/App.tsx'), false);
  assert.equal(isMigrationPath('supabase/functions/hello/index.ts'), false);
  assert.equal(isMigrationPath('migrations/20240101000000_init.sql'), false);
  assert.equal(isMigrationPath(undefined), false);
});

test('el 20240101000000 del modelo se reescribe al instante real', () => {
  const renames = resolveMigrationRenames(
    [`${MIGRATIONS_DIR}20240101000000_create_orders.sql`],
    new Map(),
    T
  );
  assert.deepEqual(
    [...renames],
    [[
      `${MIGRATIONS_DIR}20240101000000_create_orders.sql`,
      `${MIGRATIONS_DIR}20260824134530_create_orders.sql`,
    ]]
  );
});

test('el slug se conserva intacto — sólo cambia el prefijo', () => {
  const renames = resolveMigrationRenames(
    [`${MIGRATIONS_DIR}20240101000000_add_rls_to_orders_table.sql`],
    new Map(),
    T
  );
  assert.equal(
    renames.get(`${MIGRATIONS_DIR}20240101000000_add_rls_to_orders_table.sql`),
    `${MIGRATIONS_DIR}20260824134530_add_rls_to_orders_table.sql`
  );
});

test('una migración SIN prefijo también recibe uno', () => {
  const renames = resolveMigrationRenames([`${MIGRATIONS_DIR}create_orders.sql`], new Map(), T);
  assert.equal(
    renames.get(`${MIGRATIONS_DIR}create_orders.sql`),
    `${MIGRATIONS_DIR}20260824134530_create_orders.sql`
  );
});

test('dos migraciones del MISMO lote no colisionan y conservan el orden del plan', () => {
  const renames = resolveMigrationRenames(
    [
      `${MIGRATIONS_DIR}20240101000000_create_orders.sql`,
      `${MIGRATIONS_DIR}20240101000000_create_items.sql`,
    ],
    new Map(),
    T
  );
  const targets = [...renames.values()];
  assert.equal(targets.length, 2);
  assert.equal(new Set(targets).size, 2, 'dos migraciones no pueden acabar con el mismo nombre');
  assert.deepEqual(targets, [
    `${MIGRATIONS_DIR}20260824134530_create_orders.sql`,
    `${MIGRATIONS_DIR}20260824134531_create_items.sql`,
  ]);
  assert.ok(targets[0] < targets[1], 'el orden del plan sobrevive en el prefijo');
});

test('un nombre ya ocupado en el proyecto empuja el siguiente segundo', () => {
  // La migración de hace un segundo ya existe: el renombrado no puede
  // reutilizar ese nombre porque escribiría encima de ella.
  const existing = new Map([[`${MIGRATIONS_DIR}20260824134530_create_orders.sql`, 'create ...']]);
  const renames = resolveMigrationRenames(
    [`${MIGRATIONS_DIR}20240101000000_create_orders.sql`],
    existing,
    T
  );
  assert.equal(
    renames.get(`${MIGRATIONS_DIR}20240101000000_create_orders.sql`),
    `${MIGRATIONS_DIR}20260824134531_create_orders.sql`
  );
});

test('una migración que YA existía NO se renombra: el intent la modifica', () => {
  // Renombrarla duplicaría la migración y dejaría la vieja huérfana con su
  // contenido antiguo — dos identidades donde el proyecto tiene una.
  const path = `${MIGRATIONS_DIR}20260101000000_create_orders.sql`;
  const renames = resolveMigrationRenames([path], new Map([[path, 'create table orders ();']]), T);
  assert.equal(renames.size, 0);
  assert.equal(renames.get(path) ?? path, path, 'resolve con `?? path` deja el path intacto');
});

test('lo que no es migración jamás aparece en el mapa de renombrados', () => {
  const renames = resolveMigrationRenames(
    [
      'src/App.tsx',
      'src/pages/Orders.tsx',
      'supabase/functions/notify/index.ts',
      `${MIGRATIONS_DIR}20240101000000_create_orders.sql`,
    ],
    new Map(),
    T
  );
  assert.deepEqual([...renames.keys()], [`${MIGRATIONS_DIR}20240101000000_create_orders.sql`]);
});

test('un lote sin migraciones devuelve un mapa vacío (no toques nada)', () => {
  assert.equal(resolveMigrationRenames(['src/App.tsx'], new Map(), T).size, 0);
  assert.equal(resolveMigrationRenames([], new Map(), T).size, 0);
});

test('acepta Set y array como paths existentes, no sólo Map', () => {
  const path = `${MIGRATIONS_DIR}20260824134530_x.sql`;
  assert.equal(resolveMigrationRenames([path], new Set([path]), T).size, 0);
  assert.equal(resolveMigrationRenames([path], [path], T).size, 0);
});

test('determinismo: mismo lote y mismo instante, mismo resultado', () => {
  const paths = [
    `${MIGRATIONS_DIR}20240101000000_a.sql`,
    `${MIGRATIONS_DIR}20240101000000_b.sql`,
  ];
  assert.deepEqual(
    [...resolveMigrationRenames(paths, new Map(), T)],
    [...resolveMigrationRenames(paths, new Map(), T)]
  );
});

// ---------------------------------------------------------------------------
// [DDL_PROPOSED:...] — la marca de PIEZA A.
//
// PROPUESTA, no aplicada: la generación jamás toca la base de datos. Antes de
// esta marca, un intent 'database_change' cerraba en outcome='success' con el
// .sql escrito y NADA distinguía "la tabla existe" de "hay DDL esperando
// aprobación humana".
// ---------------------------------------------------------------------------

test('ddlProposedTelemetry lista las migraciones persistidas', () => {
  assert.equal(
    ddlProposedTelemetry([`${MIGRATIONS_DIR}20260824134530_create_orders.sql`]),
    ` [DDL_PROPOSED:${MIGRATIONS_DIR}20260824134530_create_orders.sql]`
  );
});

test('ddlProposedTelemetry ignora lo que no es migración', () => {
  assert.equal(
    ddlProposedTelemetry(['src/App.tsx', `${MIGRATIONS_DIR}20260824134530_a.sql`]),
    ` [DDL_PROPOSED:${MIGRATIONS_DIR}20260824134530_a.sql]`
  );
});

test('ddlProposedTelemetry deduplica y conserva el orden', () => {
  const a = `${MIGRATIONS_DIR}20260824134530_a.sql`;
  const b = `${MIGRATIONS_DIR}20260824134531_b.sql`;
  assert.equal(ddlProposedTelemetry([a, b, a]), ` [DDL_PROPOSED:${a},${b}]`);
});

test('sin migraciones la marca es vacía — el log de siempre no cambia', () => {
  assert.equal(ddlProposedTelemetry([]), '');
  assert.equal(ddlProposedTelemetry(['src/App.tsx']), '');
  assert.equal(ddlProposedTelemetry(undefined), '');
});

test('la marca usa el patrón de sufijo ya establecido: empieza por espacio y va entre corchetes', () => {
  // Mismo mecanismo que [PARTIAL:...], [DELETE_REJECTED:...], [RESTORED:...] y
  // [DANGLING_REF:...]: se concatena a user_prompt. Cero columnas nuevas, cero
  // valores de enum nuevos en forge_intent_log.
  const mark = ddlProposedTelemetry([`${MIGRATIONS_DIR}20260824134530_a.sql`]);
  assert.match(mark, /^ \[DDL_PROPOSED:.+\]$/);
});
