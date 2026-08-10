/**
 * Type surface for the plain-JS brand-var normalizer
 * (src/utils/normalizeBrandVars.js). Hand-written so the browser build stays
 * typed while the implementation remains node-test-importable JavaScript.
 */

/**
 * Rewrite invalid brand-var color syntax (`[color:var(--brand-x)]` and bare
 * `var(--brand-x)`) to the canonical `hsl(var(--brand-x))` form. Idempotent and
 * a no-op for content that references no `--brand-*` var.
 */
export function normalizeBrandVars(content: string): string;
