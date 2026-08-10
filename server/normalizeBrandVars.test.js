import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrandVars } from '../src/utils/normalizeBrandVars.js';

// ---------------------------------------------------------------------------
// normalizeBrandVars — deterministic repair of invalid brand-var color syntax
// at the persistence funnel (mirrors the one-shot SQL migration
// 20240107000000_normalize_brand_var_color_syntax_in_forge_files.sql).
//
// The `--brand-*` vars hold RAW HSL triplets, so they are ONLY valid inside
// hsl(...). The normalizer rewrites the two invalid shapes the model emits into
// the canonical `hsl(var(--brand-x))` form.
// ---------------------------------------------------------------------------

// ---- PATRÓN 1: arbitrary-property form `[color:var(--brand-x)]` ------------
test('pattern 1 — [color:var(--brand-x)] → [hsl(var(--brand-x))]', () => {
  const input = '<div className="[color:var(--brand-primary)]">Hi</div>';
  const expected = '<div className="[hsl(var(--brand-primary))]">Hi</div>';
  assert.equal(normalizeBrandVars(input), expected);
});

test('pattern 1 — preserves an /alpha suffix on the arbitrary-property form', () => {
  const input = '<div className="[color:var(--brand-accent)/50]" />';
  const expected = '<div className="[hsl(var(--brand-accent)/50)]" />';
  assert.equal(normalizeBrandVars(input), expected);
});

// ---- PATRÓN 2: bare `var(--brand-x)` inside an arbitrary color value -------
test('pattern 2 — bare var(--brand-x) in an arbitrary value → hsl(var(--brand-x))', () => {
  const input = '<span className="text-[var(--brand-fg)] bg-[var(--brand-bg)]" />';
  const expected = '<span className="text-[hsl(var(--brand-fg))] bg-[hsl(var(--brand-bg))]" />';
  assert.equal(normalizeBrandVars(input), expected);
});

test('pattern 2 — bare var(--brand-x) in an inline style is also wrapped', () => {
  const input = "<div style={{ color: 'var(--brand-primary)' }} />";
  const expected = "<div style={{ color: 'hsl(var(--brand-primary))' }} />";
  assert.equal(normalizeBrandVars(input), expected);
});

// ---- PATRÓN 3: already-correct hsl(var(--brand-x)) is left untouched -------
// (idempotence — the negative lookbehind prevents hsl(hsl(var(...))))
test('pattern 3 — already-correct hsl(var(--brand-x)) is unchanged (no double-wrap)', () => {
  const input = '<div className="text-[hsl(var(--brand-fg))]">already valid</div>';
  assert.equal(normalizeBrandVars(input), input);
});

test('pattern 3 — hsl(var(--brand-x)/alpha) is unchanged', () => {
  const input = 'background-color: hsl(var(--brand-bg) / 0.5);';
  assert.equal(normalizeBrandVars(input), input);
});

test('normalizeBrandVars is idempotent (running twice equals running once)', () => {
  const input =
    '<div className="[color:var(--brand-primary)] text-[var(--brand-fg)] bg-[hsl(var(--brand-bg))]" />';
  const once = normalizeBrandVars(input);
  const twice = normalizeBrandVars(once);
  assert.equal(twice, once);
  assert.equal(
    once,
    '<div className="[hsl(var(--brand-primary))] text-[hsl(var(--brand-fg))] bg-[hsl(var(--brand-bg))]" />'
  );
});

// ---- Safety: non-brand vars and brand DECLARATIONS are never touched -------
test('non-brand vars are never touched', () => {
  const input = '<div className="text-[var(--foreground)] [color:var(--ring)]" />';
  assert.equal(normalizeBrandVars(input), input);
});

test('the :root brand DECLARATION (raw triplet) is never touched', () => {
  const input = ':root { --brand-primary: 12 88% 59%; --brand-bg: 0 0% 100%; }';
  assert.equal(normalizeBrandVars(input), input);
});

test('no-op for content without any brand var', () => {
  const input = 'export function App() { return <div className="p-4" />; }';
  assert.equal(normalizeBrandVars(input), input);
});

test('non-string input is returned unchanged', () => {
  assert.equal(normalizeBrandVars(undefined), undefined);
  assert.equal(normalizeBrandVars(null), null);
});
