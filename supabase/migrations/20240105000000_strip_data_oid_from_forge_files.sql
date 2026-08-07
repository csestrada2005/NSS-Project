-- One-shot cleanup: remove Visual-mode instrumentation (`data-oid` attributes)
-- from already-persisted forge_files rows.
--
-- CONTEXT
-- -------
-- `data-oid` is preview-only instrumentation the Visual editor injects so a
-- click on the rendered DOM can be mapped back to a JSX element. It leaked into
-- persisted source because the edit lanes feed the instrumented file back to the
-- model and tell it to preserve those attributes, so every save round wrote them
-- to forge_files. Going forward they are stripped at the persistence funnel
-- (see src/utils/stripDataOid.ts, applied in src/hooks/useProjectFiles.ts).
-- This migration cleans the existing stock.
--
-- The strip pattern mirrors the app-side regex: it removes the JSX/HTML
-- attribute forms `data-oid="..."`, `data-oid='...'`, and the expression
-- containers `data-oid={"..."}` / `data-oid={'...'}` / `data-oid={`...`}`,
-- always consuming the leading whitespace so no double space is left behind.
--
-- READ-SAFETY: the DO block first counts (and samples, via RAISE NOTICE) the
-- affected rows BEFORE writing, then updates only rows that actually contain the
-- marker, then re-counts so the before/after numbers are visible in the migration
-- output for verification.

DO $$
DECLARE
  before_rows  bigint;
  sample_path  text;
  after_rows   bigint;
BEGIN
  -- Count of forge_files rows still carrying a data-oid attribute (not just the
  -- literal substring: require the attribute form to avoid counting the rare
  -- source that mentions "data-oid" in a string/comment).
  SELECT count(*)
    INTO before_rows
    FROM forge_files
   WHERE content ~ 'data-oid=';

  -- Read-safety sample: log one affected path so the operator can eyeball it.
  SELECT path
    INTO sample_path
    FROM forge_files
   WHERE content ~ 'data-oid='
   LIMIT 1;

  RAISE NOTICE 'strip_data_oid: % forge_files rows contain data-oid before cleanup (sample path: %)',
    before_rows, COALESCE(sample_path, '(none)');

  -- The update: strip both the attribute and expression-container forms,
  -- consuming the leading whitespace. Applied only to rows that match, so the
  -- write set equals the count above.
  UPDATE forge_files
     SET content = regexp_replace(
                     regexp_replace(
                       content,
                       '\s+data-oid=("[^"]*"|''[^'']*'')',
                       '',
                       'g'
                     ),
                     '\s+data-oid=\{("[^"]*"|''[^'']*''|`[^`]*`)\}',
                     '',
                     'g'
                   )
   WHERE content ~ 'data-oid=';

  -- Re-count: should be 0 for the attribute forms this migration targets.
  SELECT count(*)
    INTO after_rows
    FROM forge_files
   WHERE content ~ 'data-oid=';

  RAISE NOTICE 'strip_data_oid: cleanup done — % rows contained data-oid before, % remain after',
    before_rows, after_rows;
END $$;
