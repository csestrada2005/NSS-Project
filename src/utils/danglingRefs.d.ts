/**
 * Type surface for the plain-JS dangling-reference scanner
 * (src/utils/danglingRefs.js). Hand-written so the browser build stays typed
 * while the implementation remains node-test-importable JavaScript — same
 * arrangement as resolveModulePath.d.ts and importGraph.d.ts.
 */

export type FileMap = Map<string, string> | Record<string, string>;

export interface DanglingRef {
  /** Path the plan deleted. */
  deleted: string;
  /** Surviving file that still references it. */
  survivor: string;
  /** 'import' = a dangling import specifier; 'symbol' = an unbound identifier/JSX usage. */
  kind: 'import' | 'symbol';
  /**
   * For kind 'symbol', the dangling symbols actually used here. For kind
   * 'import', every symbol the deleted file exported (context for the repair).
   */
  symbols: string[];
  line: number | null;
  lineText: string | null;
}

export interface SyntheticDanglingError {
  message: string;
  file: string;
  line: number | null;
  lineText: string | null;
}

/** Mask comments and string/template literals, preserving length and newlines. */
export function maskLiterals(content: string): string;

/** maskLiterals + JSX prose text. Same length as the input. */
export function maskNonCode(content: string): string;

/** Names bound in a file (imports, declarations, destructuring, params). */
export function boundNames(content: string): Set<string>;

/** Symbols a file exports, extracted deterministically from its content. */
export function exportedSymbols(content: string, path?: string): string[];

/** Live references from surviving files to paths this intent deleted. */
export function findDanglingRefs(
  deletedPaths: Iterable<string>,
  files: FileMap,
  originalFiles: FileMap
): DanglingRef[];

/** Synthetic verification errors shaped for the existing repair cycle. */
export function syntheticDanglingErrors(refs: DanglingRef[]): SyntheticDanglingError[];

/** ` [DANGLING_REF:a->b,c->d]` suffix for forge_intent_log; '' when empty. */
export function danglingRefsTelemetry(refs: { deleted: string; survivor: string }[]): string;
