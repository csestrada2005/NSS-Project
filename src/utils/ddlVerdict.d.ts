/**
 * Type surface for the plain-JS DDL verdict taxonomy (src/utils/ddlVerdict.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as ddlGuard.d.ts,
 * migrationPath.d.ts y deletionGuard.d.ts.
 */

export type DdlVerdictKind = 'applied' | 'failed' | 'unverified';

/** The schema diff proves it landed. */
export const APPLIED: 'applied';
/** It did not land, and we know: the database rejected it. */
export const FAILED: 'failed';
/** It may have landed; the instrument cannot confirm it. */
export const UNVERIFIED: 'unverified';

export interface DdlVerdict {
  verdict: DdlVerdictKind;
  /** forge_intent_log outcome — never anything outside the existing enum. */
  outcome: 'success' | 'failed';
  /** Machine-readable reason, or null on a clean apply. */
  reason: string | null;
  /** ` [DDL_…:…]` suffix to concatenate onto user_prompt. */
  mark: string;
}

/** Make a reason safe to live inside a `[...]` suffix. */
export function sanitizeReason(reason: unknown): string;

/** Verdict from the schema diff plus the execution error, if any. */
export function ddlVerdict(tables: Iterable<string>, executionError: unknown): DdlVerdict;
