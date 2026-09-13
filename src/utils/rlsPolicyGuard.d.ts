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

/** The write commands this guard treats as dangerous when public. */
export type RlsDangerousCommand = 'INSERT' | 'UPDATE' | 'ALL';

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
 * statements removed. Idempotent; findings without a `statement` are ignored.
 */
export function removeDangerousPolicies(
  sql: string,
  findings: Iterable<Pick<RlsFinding, 'statement'>>
): string;

/** ` [RLS_POLICY_BLOCKED:table:policy,...]` suffix for forge_intent_log; '' when empty. */
export function rlsPolicyBlockedTelemetry(
  findings: Iterable<Pick<RlsFinding, 'table' | 'policy' | 'reason'>>
): string;

/** The literal user-facing warning strings, one per distinct affected table. */
export function rlsPolicyWarnings(
  findings: Iterable<Pick<RlsFinding, 'table' | 'reason'>>
): string[];
