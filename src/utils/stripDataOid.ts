/**
 * stripDataOid — remove Visual-mode instrumentation (`data-oid` attributes) from
 * file source before it is persisted to forge_files.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Visual editor needs a stable per-element handle (`data-oid`) on the
 * preview DOM so a click can be resolved back to the exact JSX element. That
 * instrumentation belongs to the PREVIEW ONLY. It leaked into the persisted
 * source because the edit lanes feed the full (already-instrumented) file back
 * to the model and instruct it to "preserve all data-oid attributes", so every
 * round the model reproduces them and the write funnel saves them to
 * forge_files. Once present they self-perpetuate: they bloat context, waste
 * tokens, and would ship in an export.
 *
 * The rule (see CAMBIO 2): the srcdoc/preview MAY carry data-oid; the source
 * file NEVER does. This helper is applied at the single persistence chokepoint
 * (the forge_files upsert in useProjectFiles) — the in-memory file map keeps its
 * instrumentation so the live preview and Visual mode are unaffected.
 *
 * The regex is intentionally conservative: it matches the JSX/HTML attribute
 * forms Babel emits (`data-oid="..."`) plus the single-quote and
 * expression-container variants, always consuming the leading whitespace so no
 * double spaces are left behind. It is a no-op for content without the marker.
 */
export function stripDataOid(content: string): string {
  if (typeof content !== 'string' || content.indexOf('data-oid') === -1) {
    return content;
  }
  return content
    // data-oid="..."  /  data-oid='...'
    .replace(/\s+data-oid=(?:"[^"]*"|'[^']*')/g, '')
    // data-oid={"..."} / data-oid={'...'} / data-oid={`...`}
    .replace(/\s+data-oid=\{(?:"[^"]*"|'[^']*'|`[^`]*`)\}/g, '');
}
