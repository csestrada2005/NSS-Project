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
