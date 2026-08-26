/**
 * Type surface for the plain-JS migration-path helpers
 * (src/utils/migrationPath.js). Hand-written so the browser build stays typed
 * while the implementation remains node-test-importable JavaScript — same
 * arrangement as deletionGuard.d.ts y danglingRefs.d.ts.
 */

/** Prefix under which a generated project's migrations live. */
export const MIGRATIONS_DIR: string;

/** True for `supabase/migrations/*.sql`. */
export function isMigrationPath(path: string): boolean;

/** UTC instant as Supabase's migration prefix: YYYYMMDDHHMMSS. */
export function utcStamp(when: Date | number): string;

/** True for any `*.sql`, wherever it lives. */
export function isSqlPath(path: string): boolean;

/** The path a `.sql` must occupy: same file name, under `supabase/migrations/`. */
export function normalizeMigrationDir(path: string): string;

/**
 * The project's ORPHAN `.sql` files: under some `migrations/` segment but not
 * under `supabase/migrations/`. Swept from the full pre-intent file map, not
 * from the intent's diff — that is the whole point (C-D'').
 */
export function orphanMigrationCandidates(
  existingPaths: Iterable<string> | Map<string, unknown> | Set<string>
): string[];

/** The `.sql` paths that no migration consumer will recognise (wrong folder). */
export function misplacedMigrations(paths: Iterable<string>): string[];

/**
 * Target map (old → new) for the migrations in a batch: folder and timestamp
 * prefix both resolved. Only entries that actually change are present; resolve
 * with `targets.get(p) ?? p`. `normalizeDir` moves stray `.sql` files under
 * `supabase/migrations/` — pass it only for a `database_change` intent.
 *
 * A pre-existing path that is ALREADY under the prefix is never renamed (the
 * intent is modifying it). A pre-existing path OUTSIDE the prefix is moved when
 * `normalizeDir` is set: that one is a recovery, and the caller must also drop
 * the old row, or the `.sql` ends up duplicated.
 */
export function resolveMigrationTargets(
  paths: Iterable<string>,
  existingPaths: Iterable<string> | Map<string, unknown> | Set<string>,
  now: Date | number,
  options?: { normalizeDir?: boolean }
): Map<string, string>;

/**
 * Rename map (old → new) for the migrations in a batch. Only entries that
 * actually change are present; resolve with `renames.get(p) ?? p`.
 */
export function resolveMigrationRenames(
  paths: Iterable<string>,
  existingPaths: Iterable<string> | Map<string, unknown> | Set<string>,
  now: Date | number
): Map<string, string>;

/** ` [DDL_PROPOSED:a,b]` suffix for forge_intent_log; '' when empty. */
export function ddlProposedTelemetry(paths: Iterable<string>): string;
