/**
 * Type surface for the plain-JS RLS policy guard (src/utils/rlsPolicyGuard.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as
 * migrationGate.d.ts, migrationPath.d.ts and planGuard.d.ts.
 */

/** Closed, frozen set of column names that mark a table as role/permission-bearing. */
export const ROLE_COLUMN_NAMES: readonly string[];

/** Why a finding was raised. */
export type RlsFindingReason = 'public-write-policy' | 'unparseable';

/**
 * Any RLS command this guard's parser recognizes other than `SELECT` — the
 * one operation on the allow-list (BLOQUE 1-BIS). Anything not `SELECT`
 * (`DELETE` included) is disallowed when public and the table is
 * role-bearing; this is a closed enumeration only because the underlying
 * `FOR` clause parser only recognizes these five keywords, not because the
 * guard enumerates dangers itself.
 */
export type RlsDangerousCommand = 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

/** One migration's SQL content, as the caller has it in memory. */
export interface RlsMigrationInput {
  path: string;
  sql: unknown;
}

/**
 * One offending policy (or one unreadable file). `table`/`policy`/`command`/
 * `statement` are all `null` when `reason` is `'unparseable'` — nothing
 * legible was found to name.
 */
export interface RlsFinding {
  path: string;
  table: string | null;
  policy: string | null;
  command: RlsDangerousCommand | null;
  statement: string | null;
  reason: RlsFindingReason;
}

export interface RlsVerdict {
  dangerous: boolean;
  findings: RlsFinding[];
}

/**
 * Evaluates a batch of migrations (the same batch an intent proposes
 * together) for public-write RLS policies over role-bearing tables.
 * Fail-closed: unreadable SQL content produces a `dangerous: true` verdict.
 */
export function evaluateRlsPolicies(migrations: Iterable<RlsMigrationInput>): RlsVerdict;

/**
 * The SQL of one file with the given findings' offending `CREATE POLICY`
 * statements removed, along with any `--` comment block glued directly above
 * each one (no blank line in between) — collapsing at most one blank line at
 * the seam. Idempotent; findings without a `statement` are ignored.
 */
export function removeDangerousPolicies(
  sql: string,
  findings: Iterable<Pick<RlsFinding, 'statement'>>
): string;

/** ` [RLS_POLICY_BLOCKED:table:policy,...]` suffix for forge_intent_log; '' when empty. */
export function rlsPolicyBlockedTelemetry(
  findings: Iterable<Pick<RlsFinding, 'table' | 'policy' | 'reason'>>
): string;

/**
 * The user-facing warning strings, one per distinct affected table, each
 * naming the actual operations removed for that table (sorted, deduplicated).
 */
export function rlsPolicyWarnings(
  findings: Iterable<Pick<RlsFinding, 'table' | 'command' | 'reason'>>
): string[];
