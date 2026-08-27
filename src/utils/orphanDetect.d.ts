/**
 * Type surface for the plain-JS orphan detector (src/utils/orphanDetect.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as
 * importGraph.d.ts, planGuard.d.ts and deletionGuard.d.ts.
 */

import type { FileMap } from './importGraph';
import type { PlanStepLike } from './planGuard';

/** The only tree where "nobody imports me" is an anomaly: 'src/components/'. */
export const ORPHAN_SCOPE_PREFIX: string;

/**
 * Paths this plan declares it creates inside the watched scope, normalized,
 * sorted and deduped. Fail-closed: unreadable plan/step/action/path yields
 * nothing.
 */
export function createdComponentPaths(steps: unknown): string[];

/**
 * Creation orphans: created by this plan, present in the final file map, and
 * imported by nobody. Never throws — an unreadable map yields no findings.
 */
export function detectCreatedOrphans(
  steps: readonly PlanStepLike[] | unknown,
  finalFiles: FileMap | unknown
): string[];

/** ' [ORPHAN_CREATED:a,b]' suffix for forge_intent_log, '' when there are none. */
export function orphanCreatedTelemetry(paths: Iterable<string> | unknown): string;
