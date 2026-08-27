/**
 * Type surface for the plain-JS initial-build plan guard (src/utils/planGuard.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as
 * importGraph.d.ts, deletionGuard.d.ts and danglingRefs.d.ts.
 */

/** A plan step as the Architect emits it, post-trim. */
export interface PlanStepLike {
  order: number;
  description: string;
  file_path: string;
  action: 'create' | 'modify' | 'delete';
  requires_steps: number[];
}

/** The three files an initial-build plan must claim, in canonical order. */
export const INITIAL_BUILD_REQUIRED_PATHS: readonly string[];

/** Trimmed, forward-slashed, prefix-stripped path. '' when unusable. */
export function normalizePlanPath(value: unknown): string;

/**
 * Required paths no step claims via file_path, in canonical order.
 * Fail-closed: an unreadable plan or step claims nothing.
 */
export function missingRequiredPaths(plan: unknown): string[];

/**
 * The plan plus a deterministic 'modify' step for each still-missing required
 * path, appended with continuing `order`. Never mutates the input; returns a
 * copy untouched when there is nothing to inject.
 */
export function injectMissingSteps(
  plan: unknown,
  missing: Iterable<string>
): PlanStepLike[];

/** ' [PLAN_REPAIRED:a,b]' suffix for forge_intent_log, '' when there are none. */
export function planRepairedTelemetry(paths: Iterable<string>): string;

/** Retry note naming the omitted files, '' when nothing is missing. */
export function buildPlanRepairNote(missing: Iterable<string>): string;
