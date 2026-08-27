/**
 * Type surface for the plain-JS plan trimmer (src/utils/planTrim.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as
 * planGuard.d.ts, deletionGuard.d.ts and importGraph.d.ts.
 */

/** Step budget per plan. The same number the Architect's system prompt declares. */
export const TRIM_MAX_STEPS: number;

/** The four files no trim may drop: the G-1 chrome set plus the router. */
export const PROTECTED_TRIM_PATHS: readonly string[];

/** Exact match against PROTECTED_TRIM_PATHS on the normalized path. */
export function isProtectedTrimPath(value: unknown): boolean;

export interface TrimResult<T> {
  /** Survivors, in the plan's original array order. Same reference when no trim. */
  steps: T[];
  wasTrimmed: boolean;
  /** Steps the model emitted. */
  originalCount: number;
  /** Steps that survived. May exceed TRIM_MAX_STEPS when protected files do. */
  keptCount: number;
}

/**
 * Cut to budget by ascending `order` (stable), keeping every protected path.
 * Fail-closed: a non-array plan trims to nothing without claiming a trim.
 */
export function trimPlan<T = unknown>(plan: unknown): TrimResult<T>;

/** ' [TRIMMED:N→M]' suffix for forge_intent_log, '' when nothing was cut. */
export function trimTelemetry(originalCount: unknown, keptCount: unknown): string;

/** User-facing warning naming the real cap and the real counts, '' when no trim. */
export function buildTrimWarning(originalCount: unknown, keptCount: unknown): string;
