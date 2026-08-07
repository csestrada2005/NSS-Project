/**
 * stripDataOid — remove Visual-mode instrumentation (`data-oid` attributes) from
 * file source before it is persisted to forge_files.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Visual editor needs a stable per-element handle (`data-oid`) on the
 * preview DOM so a click can be resolved back to the exact JSX element. As of
 * the compile-time instrumentation change, those oids are born in the COMPILER
 * (server/compiler.js) and live ONLY in the bundle/DOM — the persisted source
 * and the in-memory file map never carry them.
 *
 * This helper stays as the defense-in-depth half of that contract: it guarantees
 * no data-oid can reach forge_files by any write path, covering (a) legacy
 * residuals from before compile-time instrumentation and (b) any stray oid a
 * model might reproduce. The compiler is the single authority; the source is
 * NEVER instrumented.
 *
 * The rule: the srcdoc/preview MAY carry data-oid; the source file NEVER does.
 * This helper is applied at the persistence chokepoints (the forge_files upserts
 * in useProjectFiles — both the debounced saveFile and the flush path).
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
