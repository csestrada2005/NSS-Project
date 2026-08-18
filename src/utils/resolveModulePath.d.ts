/**
 * Type surface for the plain-JS module-path resolver
 * (src/utils/resolveModulePath.js). Hand-written so the browser build stays
 * typed while the implementation remains node-test-importable JavaScript.
 */

export const MODULE_EXTENSIONS: string[];

/** Normalize a posix path ('a/b/../c' → 'a/c'). */
export function normalizePath(p: string): string;

/**
 * Project paths the compiler would have tried for `raw` imported from
 * `importer`. Empty for anything that is not a project path.
 */
export function candidatePathsFor(raw: string, importer: string | null): string[];
