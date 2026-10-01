import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingMigrationNote, checkMigrationPlan } from '../src/utils/migrationContext.js';

const PENDING = 'supabase/migrations/20261001075237_create_newsletter_subscribers.sql';
const APPLIED = 'supabase/migrations/20260917062435_create_customer_reviews.sql';
const files = new Map([
  [PENDING, 'create table newsletter_subscribers (id uuid primary key, email text not null);'],
  [APPLIED, 'create table customer_reviews (id uuid primary key);'],
  ['src/App.tsx', 'export default 1'],
]);

test('la nota nombra la pendiente, trae su SQL y la regla de fusión', () => {
  const note = buildPendingMigrationNote([PENDING], files);
  assert.match(note, /NOT applied to the database yet/);
  assert.ok(note.includes(PENDING));
  assert.match(note, /email text not null/);
  assert.match(note, /action "modify" on supabase\/migrations\/20261001075237/);
  // 2026-10-01: sólo se fusiona lo que toca los MISMOS objetos; lo demás va en
  // un archivo nuevo que se aplica junto a la pendiente.
  assert.match(note, /It defines: table newsletter_subscribers\./);
  assert.match(note, /If it changes OTHER objects, create a NEW file/);
  assert.match(note, /Do NOT put unrelated changes into the pending file/);
  assert.match(note, /does NOT exist in the database/);
});

test('sin pendiente, con varias, o si el archivo ya no existe: sin nota', () => {
  assert.equal(buildPendingMigrationNote(null, files), '');
  assert.equal(buildPendingMigrationNote([], files), '');
  assert.equal(buildPendingMigrationNote([PENDING, APPLIED], files), '');
  assert.equal(buildPendingMigrationNote(['supabase/migrations/20990101000000_gone.sql'], files), '');
  assert.equal(buildPendingMigrationNote(['src/App.tsx'], files), '');
});

test('checkMigrationPlan: fusionó, nueva junto a la pendiente, o tocó una aplicada', () => {
  assert.deepEqual(
    checkMigrationPlan([{ action: 'modify', file_path: PENDING }], [PENDING], files),
    { merged: [PENDING], alongside: [], touchesApplied: [] },
  );
  const NEW = 'supabase/migrations/20261001090000_add_review_date.sql';
  assert.deepEqual(
    checkMigrationPlan([{ action: 'create', file_path: NEW }], [PENDING], files),
    { merged: [], alongside: [NEW], touchesApplied: [] },
  );
  assert.deepEqual(checkMigrationPlan([{ action: 'modify', file_path: APPLIED }], [PENDING], files).touchesApplied, [APPLIED]);
  // Borrar la pendiente NO es fusionar (la consola lo contaba así).
  assert.deepEqual(checkMigrationPlan([{ action: 'delete', file_path: PENDING }], [PENDING], files).merged, []);
  // Sin pendiente, crear una migración nueva es lo normal.
  assert.deepEqual(
    checkMigrationPlan([{ action: 'create', file_path: NEW }], [], files),
    { merged: [], alongside: [], touchesApplied: [] },
  );
});

// Fase 2b — el caso de Samuel: una migración aplicada creó una función; más
// tarde hay que cambiarla. Se corrige con una migración NUEVA, sabiendo cómo
// está hoy.
const FN_V1 = 'supabase/migrations/20260912074104_add_moderation_to_recomendaciones.sql';
const FN_V2 = 'supabase/migrations/20260920000000_tweak_moderation.sql';
const withFunctions = new Map([
  ...files,
  [FN_V1, [
    '-- moderation',
    "alter table public.recomendaciones add column status text default 'pending';",
    'create or replace function public.moderate_comment(body text) returns boolean as $$ begin return length(body) < 500; end; $$ language plpgsql;',
    'create policy "public read" on public.recomendaciones for select using (true);',
  ].join('\n')],
  [FN_V2, 'create or replace function moderate_comment(body text) returns boolean as $$ begin return length(body) < 800; end; $$ language plpgsql;'],
]);

test('indexMigrationObjects: qué objeto se definió en qué migración, en orden', async () => {
  const { indexMigrationObjects } = await import('../src/utils/migrationContext.js');
  const index = indexMigrationObjects(withFunctions, [PENDING]);
  assert.deepEqual(index.get('function moderate_comment').paths, [FN_V1, FN_V2]);
  assert.deepEqual(index.get('table recomendaciones').paths, [FN_V1]);
  assert.deepEqual(index.get('table customer_reviews').paths, [APPLIED]);
  assert.equal(index.has('table newsletter_subscribers'), false, 'la pendiente no cuenta como historia aplicada');
});

test('la nota del Architect lista los objetos y prohíbe editar migraciones aplicadas', async () => {
  const { buildMigrationObjectsNote } = await import('../src/utils/migrationContext.js');
  const note = buildMigrationObjectsNote(withFunctions, [PENDING]);
  assert.match(note, /- function moderate_comment: 20260912074104_add_moderation_to_recomendaciones\.sql, 20260920000000_tweak_moderation\.sql/);
  assert.match(note, /never modify those files/);
  assert.match(note, /plan a NEW migration file/);
  assert.equal(buildMigrationObjectsNote(new Map([['src/App.tsx', 'x']]), []), '');
});

test('el paso que escribe la migración nueva recibe la definición ACTUAL (la más reciente primero)', async () => {
  const { relatedMigrationDefinitions } = await import('../src/utils/migrationContext.js');
  const block = relatedMigrationDefinitions(
    'Creates a migration that alters function moderate_comment to also reject links',
    withFunctions,
    ['supabase/migrations/20261001100000_reject_links.sql'],
  );
  assert.ok(block.indexOf(FN_V2) < block.indexOf(FN_V1), 'la versión vigente va primero');
  assert.match(block, /length\(body\) < 800/);
  assert.match(block, /do NOT re-create them/);
  assert.equal(relatedMigrationDefinitions('updates the hero copy', withFunctions), '');
});

// 2026-10-01 — check de Samuel: un .sql nunca aplicado se tomó como historia
// de la base y la IA escribió un ALTER sobre una tabla inexistente.
test('las migraciones nunca aplicadas no cuentan como definición actual', async () => {
  const { buildMigrationObjectsNote, relatedMigrationDefinitions } = await import('../src/utils/migrationContext.js');
  const OLD = 'supabase/migrations/20261001083029_create_newsletter_subscribers.sql';
  const project = new Map([...files, [OLD, 'create table newsletter_subscribers (id uuid);']]);
  assert.match(buildMigrationObjectsNote(project, []), /- table newsletter_subscribers/);
  assert.doesNotMatch(buildMigrationObjectsNote(project, [OLD, PENDING]), /- table newsletter_subscribers/);
  assert.equal(relatedMigrationDefinitions('alters table newsletter_subscribers', project, [OLD, PENDING]), '');
});
