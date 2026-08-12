/**
 * Type surface for the plain-JS SEARCH/REPLACE applier (src/utils/applyEdits.js).
 * Hand-written so the browser build stays typed while the implementation remains
 * node-test-importable JavaScript.
 */

export interface SearchReplaceBlock {
  search: string;
  replace: string;
}

export type ApplyResult =
  | { ok: true; result: string; appliedCount: number }
  | { ok: false; reason: string };

/** Parse SEARCH/REPLACE blocks out of a model response. */
export function parseSearchReplaceBlocks(text: string): SearchReplaceBlock[];

/**
 * Apply parsed SEARCH/REPLACE blocks to `source`, all-or-nothing: every block
 * must match exactly once or the whole edit is rejected and `source` is left
 * untouched.
 */
export function applySearchReplace(
  source: string,
  blocks: SearchReplaceBlock[]
): ApplyResult;

/** Parse a model response and apply it to `source` in one call. */
export function applyEditsFromResponse(
  source: string,
  responseText: string
): ApplyResult;
