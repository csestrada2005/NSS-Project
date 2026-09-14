/**
 * Type surface for the plain-JS RLS policy guard (src/utils/rlsPolicyGuard.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as
 * migrationGate.d.ts, migrationPath.d.ts and planGuard.d.ts.
 */

/** Closed, frozen set of column names that mark a table as role/permission-bearing. */
export const ROLE_COLUMN_NAMES: readonly string[];

/** Why a finding was raised. `'missing-rls'` is BLOQUE 1-TER. */
export type RlsFindingReason = 'public-write-policy' | 'missing-rls' | 'unparseable';

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
 * One offending policy, one table missing `ENABLE ROW LEVEL SECURITY`, or one
 * unreadable file. `table`/`policy`/`command`/`statement` are all `null`
 * when `reason` is `'unparseable'` — nothing legible was found to name.
 * `policy`/`command` stay `null` and `insertAt` is set when `reason` is
 * `'missing-rls'` — there is no policy or command to report, only where to
 * splice the `ENABLE ROW LEVEL SECURITY` statement in `statement`.
 */
export interface RlsFinding {
  path: string;
  table: string | null;
  policy: string | null;
  command: RlsDangerousCommand | null;
  statement: string | null;
  reason: RlsFindingReason;
  /** Only set when `reason` is `'missing-rls'`: offset in that file's SQL to splice `statement` after. */
  insertAt?: number;
}

export interface RlsVerdict {
  dangerous: boolean;
  findings: RlsFinding[];
}

/**
 * Evaluates a batch of migrations (the same batch an intent proposes
 * together) for TWO independent conditions over role-bearing tables:
 * public-write RLS policies (`'public-write-policy'`, BLOQUE 1-BIS) and
 * tables left without `ENABLE ROW LEVEL SECURITY` in the same batch
 * (`'missing-rls'`, BLOQUE 1-TER). Fail-closed: unreadable SQL content
 * produces a `dangerous: true` verdict.
 */
export function evaluateRlsPolicies(migrations: Iterable<RlsMigrationInput>): RlsVerdict;

/**
 * The SQL of one file with the given findings' offending `CREATE POLICY`
 * statements removed, along with any `--` comment block glued directly above
 * each one (no blank line in between) — collapsing at most one blank line at
 * the seam. Idempotent; only acts on `reason: 'public-write-policy'` findings.
 */
export function removeDangerousPolicies(
  sql: string,
  findings: Iterable<Pick<RlsFinding, 'reason' | 'statement'>>
): string;

/**
 * The SQL of one file with the given findings' `ENABLE ROW LEVEL SECURITY`
 * statements spliced in at their `insertAt` anchor (right after the owning
 * `CREATE TABLE` or `ALTER TABLE`, before any policy). Idempotent; only acts
 * on `reason: 'missing-rls'` findings, applied from the highest `insertAt`
 * down so earlier anchors in the same text stay valid.
 */
export function addMissingRls(
  sql: string,
  findings: Iterable<Pick<RlsFinding, 'reason' | 'statement' | 'insertAt'>>
): string;

/**
 * ` [RLS_POLICY_BLOCKED:table:policy,...]` suffix for forge_intent_log; ''
 * when empty. Only `reason: 'public-write-policy'` findings feed this mark.
 */
export function rlsPolicyBlockedTelemetry(
  findings: Iterable<Pick<RlsFinding, 'table' | 'policy' | 'reason'>>
): string;

/**
 * ` [RLS_ENABLED:table,...]` suffix for forge_intent_log (BLOQUE 1-TER); ''
 * when empty. Sorted and deduplicated, log-only — never the user prompt.
 * Only `reason: 'missing-rls'` findings feed this mark; coexists with
 * `rlsPolicyBlockedTelemetry` when both conditions fire in the same run.
 */
export function rlsEnabledTelemetry(
  findings: Iterable<Pick<RlsFinding, 'table' | 'reason'>>
): string;

/**
 * The user-facing warning strings, one per distinct affected table, covering
 * both `'public-write-policy'` (names the operations removed) and
 * `'missing-rls'` (names that RLS was enabled and warns of the functional
 * consequence) — combined into one message per table when both fire on it.
 */
export function rlsPolicyWarnings(
  findings: Iterable<Pick<RlsFinding, 'table' | 'command' | 'reason'>>
): string[];
