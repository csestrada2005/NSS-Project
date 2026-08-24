/**
 * Type surface for the plain-JS migration telemetry helpers
 * (src/utils/migrationIntent.js). Hand-written so the browser build stays typed
 * while the implementation remains node-test-importable JavaScript — same
 * arrangement as ddlVerdict.d.ts y migrationPath.d.ts.
 */

/** What an applied DDL IS; never a caller-supplied value. */
export const MIGRATION_INTENT_TYPE: 'database_change';

/** DECLARED risk: an applied DDL is the only irreversible operation there is. */
export const MIGRATION_INTENT_RISK: 'high';

/** Prefix of the mark appended to a MigrationResult reason when the log failed. */
export const TELEMETRY_FAILED_PREFIX: string;

/** Outcome of the forge_intent_log insert, as the caller can propagate it. */
export interface IntentLogResult {
  ok: boolean;
  /** Full insert error message; absent when ok. */
  error?: string;
}

/** Full, untruncated message of an insert error of any shape. */
export function describeIntentError(e: unknown): string;

/** Normalize supabase-js's `{ error }` (it does not throw on 4xx) into a signal. */
export function intentLogResult(error: unknown): IntentLogResult;

export interface MigrationIntentInput {
  projectId: string;
  prompt: string;
  modifiedFiles?: string[];
  outcome: 'success' | 'failed';
  errorMessage?: string | null;
  durationMs: number;
}

export interface MigrationIntentParams {
  projectId: string;
  prompt: string;
  intentType: 'database_change';
  intentRisk: 'high';
  modifiedFiles: string[];
  outcome: 'success' | 'failed';
  errorMessage: string | null;
  durationMs: number;
}

/** The exact object logMigrationIntent hands to logIntent. */
export function buildMigrationIntentParams(params: MigrationIntentInput): MigrationIntentParams;

/** Append `telemetry_failed:<msg>` to a reason. Never touches the outcome. */
export function withTelemetryFailure(
  reason: string | undefined,
  telemetry: IntentLogResult
): string | undefined;
