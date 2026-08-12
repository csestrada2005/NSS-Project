/**
 * Type surface for the plain-JS compile-error grouper
 * (src/utils/groupCompileErrors.js). Hand-written so the browser build stays
 * typed while the implementation remains node-test-importable JavaScript.
 */

export interface CompileErrorDetail {
  message: string | null;
  file: string | null;
  line: number | null;
  lineText: string | null;
}

export interface RepairBatch {
  /** Grouping skeleton shared by every error in the batch. */
  typeKey: string;
  /** Human label for the error class (drives the repair prompt). */
  label: string;
  /** The errors in this batch. */
  errors: CompileErrorDetail[];
  /** Implicated files with full contents. */
  files: { path: string; content: string }[];
}

export const MAX_FILES_PER_BATCH: number;
export const MAX_CHARS_PER_BATCH: number;

/** Reduce an esbuild message to a stable grouping skeleton. */
export function classifyError(message: string): string;

/** Human label for a batch derived from a representative message. */
export function labelForError(message: string): string;

/**
 * Group compile errors into repair batches: one batch per error class, split
 * further so no batch exceeds the file/char safety caps.
 */
export function groupCompileErrors(
  errors: CompileErrorDetail[],
  getFileContent: (path: string) => string | undefined,
  opts?: { maxFiles?: number; maxChars?: number }
): RepairBatch[];
