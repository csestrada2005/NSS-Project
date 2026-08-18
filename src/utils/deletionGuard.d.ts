/**
 * Type surface for the plain-JS deletion guard (src/utils/deletionGuard.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as
 * importGraph.d.ts and deterministicRestore.d.ts.
 */

import type { FileMap } from './importGraph';

/** Rejection reason: not named by the user, and not orphaned in the original. */
export const NOT_TARGETED_STILL_IMPORTED: 'not_targeted_still_imported';

/** Seeds (that exist in the original) plus their PRE-plan exclusive orphans. */
export function expandDeletionTargets(
  seeds: Iterable<string>,
  originalFiles: FileMap
): Set<string>;

export interface DeleteVerdictInput {
  /** Path the plan's 'delete' step targets. */
  path: string;
  /** Pre-intent file map. The reference the plan cannot rewrite. */
  originalFiles: FileMap;
  /** Deletes this plan still intends to perform (rejected ones removed). */
  plannedDeletes?: Iterable<string>;
  /** Paths the user's request named, expanded with pre-plan exclusive orphans. */
  deletionTargets?: Set<string> | Iterable<string>;
}

export interface DeleteVerdict {
  allowed: boolean;
  /** True when the delete is legal because the user named the path. */
  targeted: boolean;
  /** Surviving importers in the ORIGINAL map. Non-empty only when refused. */
  importers: string[];
  reason: string | null;
}

/** Is this 'delete' step legal? Measured against the ORIGINAL, never post-plan. */
export function deleteVerdict(input: DeleteVerdictInput): DeleteVerdict;

/** ' [TARGETS:a,b]' suffix for forge_intent_log, '' when there are none. */
export function deletionTargetsTelemetry(targets: Iterable<string>): string;
