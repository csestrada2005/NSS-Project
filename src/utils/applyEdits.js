/**
 * applyEdits — deterministic SEARCH/REPLACE applier for diff-based modifies
 * (CAMBIO 2).
 *
 * WHY THIS EXISTS
 * ---------------
 * Re-emitting a whole file to change ten lines burns output tokens on the
 * ~99% that never changed. For an action 'modify' over an EXISTING file the
 * Implementer instead asks the model for surgical edits in a SEARCH/REPLACE
 * format, and this module applies them to the current file content:
 *
 *     <<<<<<< SEARCH
 *     ...exact lines currently in the file...
 *     =======
 *     ...their replacement...
 *     >>>>>>> REPLACE
 *
 * SAFETY CONTRACT (the whole point — never apply a partial edit)
 * --------------------------------------------------------------
 * The applier is all-or-nothing. Every SEARCH block MUST match EXACTLY ONCE in
 * the file at the moment it is applied. If ANY block matches zero times or more
 * than once, the ENTIRE edit for that file is rejected ({ ok: false }) and the
 * caller falls back to requesting the full file — a partial application (some
 * blocks in, some out) would silently corrupt the file, so it is never done.
 *
 * Blocks are applied sequentially against the running content, so a later block
 * sees the earlier blocks' replacements. Each block is still required to match
 * exactly once against that running content.
 *
 * Plain ESM JavaScript on purpose (same rationale as normalizeBrandVars.js):
 * node's built-in test runner imports it directly for the unit test, and Vite
 * bundles it for the browser unchanged.
 */

// One SEARCH/REPLACE block. The markers are matched literally; the SEARCH and
// REPLACE bodies capture everything (including blank lines) between them.
const BLOCK_RE =
  /<{5,7}\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n?={5,7}\s*\r?\n([\s\S]*?)\r?\n?>{5,7}\s*REPLACE/g;

/**
 * Parse SEARCH/REPLACE blocks out of a model response.
 *
 * @param {string} text
 * @returns {{ search: string, replace: string }[]}
 */
export function parseSearchReplaceBlocks(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const blocks = [];
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(text)) !== null) {
    blocks.push({ search: m[1], replace: m[2] });
  }
  return blocks;
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Apply parsed SEARCH/REPLACE blocks to `source`, all-or-nothing.
 *
 * Returns { ok: true, result, appliedCount } when every block matched exactly
 * once, or { ok: false, reason } when any block failed (no match, multiple
 * matches, empty SEARCH, or no blocks at all). On failure `source` is never
 * mutated and the caller must fall back to a full-file rewrite.
 *
 * @param {string} source  current file content
 * @param {{ search: string, replace: string }[]} blocks
 * @returns {{ ok: true, result: string, appliedCount: number } | { ok: false, reason: string }}
 */
export function applySearchReplace(source, blocks) {
  if (typeof source !== 'string') {
    return { ok: false, reason: 'source is not a string' };
  }
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { ok: false, reason: 'no SEARCH/REPLACE blocks' };
  }

  let working = source;
  let applied = 0;

  for (let i = 0; i < blocks.length; i++) {
    const { search, replace } = blocks[i];

    if (typeof search !== 'string' || search.length === 0) {
      return { ok: false, reason: `block ${i + 1}: empty SEARCH` };
    }

    const occurrences = countOccurrences(working, search);
    if (occurrences === 0) {
      return { ok: false, reason: `block ${i + 1}: SEARCH not found` };
    }
    if (occurrences > 1) {
      return { ok: false, reason: `block ${i + 1}: SEARCH matched ${occurrences} times (must be unique)` };
    }

    // Exactly one occurrence — replace only that one. Using indexOf + slice
    // avoids String.replace's special `$` handling in the replacement text.
    const at = working.indexOf(search);
    working = working.slice(0, at) + replace + working.slice(at + search.length);
    applied++;
  }

  return { ok: true, result: working, appliedCount: applied };
}

/**
 * Convenience: parse a model response and apply it in one call.
 *
 * @param {string} source
 * @param {string} responseText
 * @returns {{ ok: true, result: string, appliedCount: number } | { ok: false, reason: string }}
 */
export function applyEditsFromResponse(source, responseText) {
  const blocks = parseSearchReplaceBlocks(responseText);
  return applySearchReplace(source, blocks);
}
