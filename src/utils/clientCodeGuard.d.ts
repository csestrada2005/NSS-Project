/**
 * Type surface for the plain-JS client-code guard
 * (src/utils/clientCodeGuard.js). Hand-written so the browser build stays
 * typed while the implementation remains node-test-importable JavaScript —
 * same arrangement as rlsPolicyGuard.d.ts, ddlGuard.d.ts and planGuard.d.ts.
 */

/** Closed, frozen set of identifier names that mark a third-party credential. */
export const CREDENTIAL_IDENTIFIER_NAMES: readonly string[];

/** Why a finding was raised. */
export type ClientCodeFindingReason = 'hardcoded-credential' | 'role-table-write';

/**
 * One offending finding. `identifier` is set (never the literal's value)
 * for `'hardcoded-credential'`; `table`/`method` are set for
 * `'role-table-write'`. The unused pair stays `null`.
 */
export interface ClientCodeFinding {
  path: string;
  reason: ClientCodeFindingReason;
  identifier: string | null;
  table: string | null;
  method: string | null;
}

/** One client file's content, as the caller has it in memory. */
export interface ClientCodeFileInput {
  path: string;
  content: unknown;
}

export interface ClientCodeVerdict {
  dangerous: boolean;
  findings: ClientCodeFinding[];
}

/**
 * Evaluates a batch of client files for TWO independent conditions: a
 * third-party credential assigned to a string literal or pasted into an
 * `Authorization: 'Bearer <literal>'` header (`'hardcoded-credential'`),
 * and a direct client-side write (`insert`/`update`/`upsert`/`delete`) to a
 * table in `roleTables` (`'role-table-write'`). `roleTables` defaults to an
 * empty set — callers with no migration batch in scope (fast lane, simple
 * lane) can omit it and only the first condition can fire. Fail-open on
 * non-string content: never throws, that file is skipped without a
 * finding.
 */
export function evaluateClientCode(
  files: Iterable<ClientCodeFileInput>,
  roleTables?: Set<string>
): ClientCodeVerdict;

/**
 * ` [CLIENT_SECRET_HARDCODED:path:identifier,...]` suffix for
 * forge_intent_log; '' when empty. Never includes the literal's value —
 * only `path` and `identifier`. Only `reason: 'hardcoded-credential'`
 * findings feed this mark.
 */
export function clientSecretTelemetry(
  findings: Iterable<Pick<ClientCodeFinding, 'path' | 'identifier' | 'reason'>>
): string;

/**
 * ` [CLIENT_ROLE_WRITE:path:table:method,...]` suffix for
 * forge_intent_log; '' when empty. Only `reason: 'role-table-write'`
 * findings feed this mark.
 */
export function clientRoleWriteTelemetry(
  findings: Iterable<Pick<ClientCodeFinding, 'path' | 'table' | 'method' | 'reason'>>
): string;

/**
 * The user-facing warning strings, one per distinct finding, covering both
 * reasons. Never mentions the literal's value. Detect-and-warn only: this
 * guard never rewrites the offending file.
 */
export function clientCodeWarnings(findings: Iterable<ClientCodeFinding>): string[];
