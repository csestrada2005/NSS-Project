/**
 * groupCompileErrors — deterministic batching of esbuild compile errors so the
 * Verifier repairs a whole CLASS of failures in ONE LLM call instead of one
 * error per call.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Verifier's old fix-loop repaired a single file per LLM call: a dispatch
 * cascade of 3 identical export mismatches cost 3 fix calls + 3 recompiles. But
 * esbuild hands back EVERY error of a failed build as a list, and errors of the
 * same class ("this import name doesn't match any export") are the same fix
 * applied N times. Grouping them lets one instruction — with the full contents
 * of every implicated file — repair the entire batch at once, and the recompile
 * validates all of them together.
 *
 * HOW IT GROUPS
 * -------------
 * Each error is reduced to a stable `typeKey` (its message skeleton with every
 * file path, quoted identifier and number stripped out), so "No matching export
 * in A for import X", "...in B for import Y" and "...in C for import Z" collapse
 * to one key. Errors sharing a key form a batch; the batch carries the set of
 * implicated files (each error's own file) with full contents.
 *
 * SAFETY CAP
 * ----------
 * A single batch that pulls in more than MAX_FILES files or more than MAX_CHARS
 * of file context is split into several batches of the SAME error type, each
 * under both caps, so one repair call never blows the context window.
 */

/** Max implicated files per batch before splitting. */
export const MAX_FILES_PER_BATCH = 6;
/** Max combined file-content chars per batch before splitting (~60k). */
export const MAX_CHARS_PER_BATCH = 60000;

/**
 * Human-readable labels for a few well-known error classes. Matched against the
 * lowercased raw message; falls back to a generic label otherwise. Purely
 * cosmetic — drives the instruction text in the repair prompt, never the
 * grouping (which is done by the stripped skeleton).
 */
const KNOWN_CLASSES = [
  { test: /no matching export|does not provide an export|has no exported member/, label: 'export/import name mismatch' },
  { test: /could not resolve|cannot resolve|file not found/, label: 'unresolved import/module' },
  { test: /duplicate|has already been declared/, label: 'duplicate declaration' },
  { test: /unexpected|expected|syntax error|unterminated/, label: 'syntax error' },
  { test: /is not defined|cannot find name/, label: 'undefined reference' },
];

/**
 * Reduce an esbuild error message to a stable skeleton used as the grouping key.
 * Removes the parts that vary per-occurrence (paths, quoted identifiers, numbers)
 * while keeping the structural words that identify the error CLASS.
 *
 * @param {string} message
 * @returns {string}
 */
export function classifyError(message) {
  if (!message) return 'unknown';
  return (
    String(message)
      .toLowerCase()
      // Drop single- and double-quoted segments (import names, paths,
      // identifiers) to the SAME placeholder so quote style never splits a class.
      .replace(/"[^"]*"/g, '§')
      .replace(/'[^']*'/g, '§')
      // Drop bare paths that weren't quoted (src/..., ./foo, virtual:...).
      .replace(/(?:virtual:)?(?:\.{0,2}\/)?[\w./-]+\.[a-z]{2,4}/g, '')
      // Drop standalone numbers (line/column references leaked into text).
      .replace(/\b\d+\b/g, '')
      // Collapse whitespace.
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Pick a human label for a batch from its representative raw message.
 * @param {string} message
 * @returns {string}
 */
export function labelForError(message) {
  const lower = String(message ?? '').toLowerCase();
  for (const { test, label } of KNOWN_CLASSES) {
    if (test.test(lower)) return label;
  }
  return 'compilation error';
}

/**
 * @typedef {Object} CompileErrorDetail
 * @property {string|null} message
 * @property {string|null} file
 * @property {number|null} line
 * @property {string|null} lineText
 */

/**
 * @typedef {Object} RepairBatch
 * @property {string} typeKey       Grouping skeleton shared by every error in the batch.
 * @property {string} label         Human label for the error class (drives the prompt).
 * @property {CompileErrorDetail[]} errors  The errors in this batch.
 * @property {{ path: string, content: string }[]} files  Implicated files, full contents.
 */

/**
 * Group a flat list of compile errors into repair batches: one batch per error
 * class, split further so no batch exceeds the file/char safety caps.
 *
 * Errors with no identifiable file (null `file`, or a path with no content) are
 * still grouped by type but contribute no file to repair — a batch with zero
 * files is dropped, since there is nothing to hand the model.
 *
 * @param {CompileErrorDetail[]} errors
 * @param {(path: string) => (string | undefined)} getFileContent
 * @param {{ maxFiles?: number, maxChars?: number }} [opts]
 * @returns {RepairBatch[]}
 */
export function groupCompileErrors(errors, getFileContent, opts = {}) {
  const maxFiles = opts.maxFiles ?? MAX_FILES_PER_BATCH;
  const maxChars = opts.maxChars ?? MAX_CHARS_PER_BATCH;

  // 1. Bucket errors by type skeleton, preserving first-seen order.
  /** @type {Map<string, { label: string, errors: CompileErrorDetail[] }>} */
  const buckets = new Map();
  for (const err of errors) {
    if (!err) continue;
    const key = classifyError(err.message ?? '');
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label: labelForError(err.message ?? ''), errors: [] };
      buckets.set(key, bucket);
    }
    bucket.errors.push(err);
  }

  // 2. For each bucket, collect the implicated files (deduped, with content) and
  //    split into chunks that honor both caps.
  /** @type {RepairBatch[]} */
  const batches = [];
  for (const [typeKey, bucket] of buckets) {
    // Resolve the unique files touched by this error class, keeping order.
    /** @type {{ path: string, content: string, errors: CompileErrorDetail[] }[]} */
    const fileUnits = [];
    const byPath = new Map();
    for (const err of bucket.errors) {
      const path = err.file;
      if (!path) continue;
      const content = getFileContent(path);
      if (content == null) continue;
      let unit = byPath.get(path);
      if (!unit) {
        unit = { path, content, errors: [] };
        byPath.set(path, unit);
        fileUnits.push(unit);
      }
      unit.errors.push(err);
    }

    if (fileUnits.length === 0) continue; // nothing to repair for this class

    // Greedy chunking: accumulate files until adding the next would exceed either
    // cap, then start a fresh chunk. A single oversized file still gets its own
    // chunk (can't split a file).
    let chunk = [];
    let chunkChars = 0;
    const flush = () => {
      if (chunk.length === 0) return;
      batches.push({
        typeKey,
        label: bucket.label,
        errors: chunk.flatMap((u) => u.errors),
        files: chunk.map((u) => ({ path: u.path, content: u.content })),
      });
      chunk = [];
      chunkChars = 0;
    };
    for (const unit of fileUnits) {
      const len = unit.content.length;
      const wouldOverflow =
        chunk.length > 0 && (chunk.length + 1 > maxFiles || chunkChars + len > maxChars);
      if (wouldOverflow) flush();
      chunk.push(unit);
      chunkChars += len;
    }
    flush();
  }

  return batches;
}
