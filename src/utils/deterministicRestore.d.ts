/**
 * Type surface for the plain-JS deterministic restore
 * (src/utils/deterministicRestore.js). Hand-written so the browser build stays
 * typed while the implementation remains node-test-importable JavaScript.
 */

import type { RepairBatch } from './groupCompileErrors';

/** A module cited by the batch's errors that is ABSENT from the project. */
export interface MissingReference {
  /** Path the repair may write: the exact one the plan deleted, when known. */
  path: string;
  /** Paths accepted from the model for this reference. */
  writable: string[];
  /** True when the path existed in the pre-intent map (the plan deleted it). */
  wasDeleted: boolean;
}

/** Absent modules cited by the batch's errors, resolved against the project. */
export function missingReferencedPaths(
  batch: RepairBatch,
  files: Map<string, string>,
  universe: Map<string, string>
): MissingReference[];

/**
 * Restore, byte for byte and with no model call, every module the plan deleted
 * that the batch's errors still reference. `skipModel` is true when that
 * restoration resolved every error in the batch, so the repair call is not just
 * unnecessary but unsafe.
 */
export function planDeterministicRestore(
  batch: RepairBatch,
  files: Map<string, string>,
  universe: Map<string, string>
): { files: Map<string, string>; restored: string[]; skipModel: boolean };

/** Telemetry suffix distinguishing restored (deterministic) from recreated (model). */
export function absentFilesTelemetry(restored: string[], recreated: string[]): string;
