/**
 * normalizeBrandVars — deterministic repair of invalid brand-var color syntax
 * before a file is persisted to forge_files.
 *
 * WHY THIS EXISTS
 * ---------------
 * The `--brand-*` CSS variables hold RAW HSL triplets (e.g.
 * `--brand-primary: 12 88% 59%;`). A raw triplet is NOT a color on its own — it
 * only becomes one inside `hsl(...)`. So every consumer MUST wrap it:
 * `hsl(var(--brand-primary))` (or `hsl(var(--brand-primary)/0.5)` for alpha).
 *
 * The model nonetheless keeps emitting two invalid shapes that render
 * TRANSPARENT (the browser drops the malformed declaration):
 *   1. the arbitrary-property form   `[color:var(--brand-x)]`
 *   2. a BARE reference              `var(--brand-x)`  (e.g. `text-[var(--brand-x)]`,
 *      or a bare `var(--brand-x)` in an inline style)
 *
 * The prompt rule (REACT_TAILWIND_RULES) tells the model not to do this, but a
 * prompt is advisory. This normalizer is the deterministic backstop that runs at
 * the SAME persistence chokepoint as stripDataOid (src/hooks/useProjectFiles.ts),
 * so no invalid brand-var color reference can reach forge_files by any write path.
 *
 * TWO REWRITES (mirrored by the one-shot SQL migration that cleans the existing
 * stock — 20240107000000_normalize_brand_var_color_syntax_in_forge_files.sql):
 *   `[color:var(--brand-x)]`      → `[hsl(var(--brand-x))]`   (drops `color:`, wraps in hsl)
 *   bare `var(--brand-x)`         → `hsl(var(--brand-x))`     (wraps in hsl)
 *
 * SAFETY / IDEMPOTENCE
 * --------------------
 * - A brand var already wrapped as `hsl(var(--brand-x))` is left untouched: the
 *   bare rule uses a negative lookbehind for `hsl(` so it never double-wraps.
 * - The `:root` declarations in index.css (`--brand-x: <triplet>;`) are never a
 *   `var(--brand-x)` reference, so they are never touched.
 * - Non-brand vars (`var(--foreground)`, `[color:var(--ring)]`, …) are never
 *   touched: every pattern is anchored to `--brand-`.
 * - Because `--brand-*` vars are EXCLUSIVELY HSL triplets, any bare reference is
 *   invalid regardless of the property it sits in, so wrapping every bare one in
 *   `hsl(...)` is always the correct repair.
 *
 * Plain ESM JavaScript on purpose (same rationale as jsxOrdinal.js): node's
 * built-in test runner imports it directly for the unit test, and Vite bundles
 * it for the browser unchanged.
 */

// `[color:var(--brand-x)]` (arbitrary-property form), with optional `/alpha`.
const ARBITRARY_COLOR_PROP = /\[color:var\((--brand-[\w-]+)\)(\/[^\]\s]+)?\]/g;

// A BARE `var(--brand-x)` NOT already wrapped in `hsl(`. The negative lookbehind
// is what makes the whole normalizer idempotent (no `hsl(hsl(var(...)))`).
const BARE_BRAND_VAR = /(?<!hsl\()var\((--brand-[\w-]+)\)/g;

/**
 * Rewrite invalid brand-var color syntax to the canonical `hsl(var(--brand-x))`
 * form. No-op (returns the input unchanged) when the content mentions no brand
 * var. Logs a single line when it actually rewrote something.
 *
 * @param {string} content
 * @returns {string}
 */
export function normalizeBrandVars(content) {
  if (typeof content !== 'string' || content.indexOf('--brand-') === -1) {
    return content;
  }

  let count = 0;

  // 1) `[color:var(--brand-x)]` → `[hsl(var(--brand-x))]`. Runs FIRST so the
  //    result (`hsl(var(...))`) is skipped by the bare rule below.
  let out = content.replace(ARBITRARY_COLOR_PROP, (_m, name, alpha) => {
    count++;
    return `[hsl(var(${name})${alpha || ''})]`;
  });

  // 2) bare `var(--brand-x)` → `hsl(var(--brand-x))`.
  out = out.replace(BARE_BRAND_VAR, (_m, name) => {
    count++;
    return `hsl(var(${name}))`;
  });

  if (count > 0 && typeof console !== 'undefined') {
    console.warn(
      `[normalizeBrandVars] rewrote ${count} invalid brand-var color reference(s) to hsl(var(--brand-*))`
    );
  }

  return out;
}
