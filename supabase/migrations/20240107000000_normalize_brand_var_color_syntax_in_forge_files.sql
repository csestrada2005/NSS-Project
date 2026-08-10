-- One-shot cleanup: normalize invalid brand-var color syntax in already-persisted
-- forge_files rows.
--
-- CONTEXT
-- -------
-- The `--brand-*` CSS variables hold RAW HSL triplets (e.g.
-- `--brand-primary: 12 88% 59%;`), so they are ONLY valid inside `hsl(...)`:
-- `hsl(var(--brand-primary))`. Two invalid shapes leaked into persisted source
-- and render TRANSPARENT in the browser:
--   1. the arbitrary-property form `[color:var(--brand-x)]`
--   2. a BARE reference `var(--brand-x)` (e.g. `text-[var(--brand-x)]`)
-- Going forward they are rewritten at the persistence funnel (see
-- src/utils/normalizeBrandVars.js, applied in src/hooks/useProjectFiles.ts).
-- This migration cleans the existing stock.
--
-- The two rewrites mirror the app-side normalizer exactly:
--   `[color:var(--brand-x)]` → `[hsl(var(--brand-x))]`   (drop `color:`, wrap in hsl)
--   bare `var(--brand-x)`    → `hsl(var(--brand-x))`     (wrap in hsl)
-- The bare rewrite uses a negative-lookbehind-free approach: because the
-- arbitrary-property rewrite runs FIRST (producing `hsl(var(...))`), and because
-- an already-correct `hsl(var(--brand-x))` places the `var(` immediately after
-- `hsl(`, the bare pattern is anchored with `(?<!hsl\()` so it never double-wraps.
--
-- READ-SAFETY: the DO block first counts (and samples, via RAISE NOTICE) the
-- affected rows BEFORE writing, then updates only rows that actually contain an
-- invalid pattern, then re-counts so the before/after numbers are visible in the
-- migration output for verification.

DO $$
DECLARE
  -- Matches EITHER invalid shape: `[color:var(--brand-...)` OR a bare
  -- `var(--brand-...)` not already preceded by `hsl(`.
  invalid_re constant text := '\[color:var\(--brand-[\w-]+\)|(?<!hsl\()var\(--brand-[\w-]+\)';
  before_rows  bigint;
  sample_path  text;
  after_rows   bigint;
BEGIN
  -- Count of forge_files rows carrying at least one invalid brand-var reference.
  SELECT count(*)
    INTO before_rows
    FROM forge_files
   WHERE content ~ invalid_re;

  -- Read-safety sample: log one affected path so the operator can eyeball it.
  SELECT path
    INTO sample_path
    FROM forge_files
   WHERE content ~ invalid_re
   LIMIT 1;

  RAISE NOTICE 'normalize_brand_vars: % forge_files rows contain invalid brand-var color syntax before cleanup (sample path: %)',
    before_rows, COALESCE(sample_path, '(none)');

  -- The update: arbitrary-property form FIRST, then the bare form (with the
  -- `(?<!hsl\()` guard so already-correct `hsl(var(--brand-x))` and the freshly
  -- rewritten values are left alone). Applied only to matching rows, so the write
  -- set equals the count above.
  UPDATE forge_files
     SET content = regexp_replace(
                     regexp_replace(
                       content,
                       '\[color:var\((--brand-[\w-]+)\)\]',
                       '[hsl(var(\1))]',
                       'g'
                     ),
                     '(?<!hsl\()var\((--brand-[\w-]+)\)',
                     'hsl(var(\1))',
                     'g'
                   )
   WHERE content ~ invalid_re;

  -- Re-count: should be 0 once both forms are normalized.
  SELECT count(*)
    INTO after_rows
    FROM forge_files
   WHERE content ~ invalid_re;

  RAISE NOTICE 'normalize_brand_vars: cleanup done — % rows contained invalid brand-var syntax before, % remain after',
    before_rows, after_rows;
END $$;
