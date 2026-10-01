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
  assert.match(note, /Never modify any OTHER file under supabase\/migrations/);
});

test('sin pendiente, con varias, o si el archivo ya no existe: sin nota', () => {
  assert.equal(buildPendingMigrationNote(null, files), '');
  assert.equal(buildPendingMigrationNote([], files), '');
  assert.equal(buildPendingMigrationNote([PENDING, APPLIED], files), '');
  assert.equal(buildPendingMigrationNote(['supabase/migrations/20990101000000_gone.sql'], files), '');
  assert.equal(buildPendingMigrationNote(['src/App.tsx'], files), '');
});

test('checkMigrationPlan: fusionó, no fusionó, o tocó una aplicada', () => {
  const merged = checkMigrationPlan([{ action: 'modify', file_path: PENDING }], [PENDING], files);
  assert.deepEqual(merged, { notMerged: [], touchesApplied: [] });

  const created = checkMigrationPlan(
    [{ action: 'create', file_path: 'supabase/migrations/20261001090000_add_name.sql' }],
    [PENDING],
    files,
  );
  assert.deepEqual(created.notMerged, ['supabase/migrations/20261001090000_add_name.sql']);

  const applied = checkMigrationPlan([{ action: 'modify', file_path: APPLIED }], [PENDING], files);
  assert.deepEqual(applied.touchesApplied, [APPLIED]);

  // Sin pendiente, crear una migración nueva es lo normal.
  assert.deepEqual(
    checkMigrationPlan([{ action: 'create', file_path: 'supabase/migrations/20261001090000_x.sql' }], [], files),
    { notMerged: [], touchesApplied: [] },
  );
});
