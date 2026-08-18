/**
 * Type surface for the plain-JS import graph (src/utils/importGraph.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as
 * resolveModulePath.d.ts.
 */

export const SOURCE_EXTENSIONS: string[];
export const PROMPT_ROW_EXCLUDED_PREFIXES: string[];
export const PROMPT_ROW_LIMIT: number;

export type FileMap = Map<string, string> | Record<string, string>;

export interface ImportGraphOptions {
  /** Paths that must not count as importers (the ones this plan deletes). */
  ignorePaths?: Iterable<string>;
}

/** Import specifiers cited by a file's content, in order, deduped. */
export function extractSpecifiers(content: string): string[];

/** Project paths `importer` actually imports (resolved against the file map). */
export function resolvedImportsOf(importer: string, files: FileMap): string[];

/** Reverse graph: path → paths importing it. */
export function buildImportedByMap(
  files: FileMap,
  options?: ImportGraphOptions
): Map<string, string[]>;

/** Surviving files that import `target`. Empty ⇒ safe to delete. */
export function importersOfPath(
  target: string,
  files: FileMap,
  options?: ImportGraphOptions
): string[];

/** "imported by" block injected into the Architect prompt. */
export function buildImportedByBlock(
  files: FileMap,
  options?: { excludePrefixes?: string[]; limit?: number }
): string;
