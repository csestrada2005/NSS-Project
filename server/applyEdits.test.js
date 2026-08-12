import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSearchReplaceBlocks,
  applySearchReplace,
  applyEditsFromResponse,
} from '../src/utils/applyEdits.js';

// ---------------------------------------------------------------------------
// applyEdits — deterministic SEARCH/REPLACE applier for diff-based modifies
// (CAMBIO 2). The contract is all-or-nothing: every SEARCH block must match
// EXACTLY ONCE, otherwise the whole edit is rejected and the caller falls back
// to a full-file rewrite. These tests pin the three cases the surgery calls
// out: single match, no match, and multiple matches.
// ---------------------------------------------------------------------------

const SAMPLE = `import { cn } from '@/lib/utils';

export function Hero() {
  return <section className="p-4">Hello</section>;
}
`;

function block(search, replace) {
  return `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
}

// ---- match único ----------------------------------------------------------
test('single unique match applies and returns full updated content', () => {
  const res = applyEditsFromResponse(
    SAMPLE,
    block('className="p-4"', 'className="p-8 bg-white"')
  );
  assert.equal(res.ok, true);
  assert.equal(res.appliedCount, 1);
  assert.ok(res.result.includes('className="p-8 bg-white"'));
  assert.ok(!res.result.includes('className="p-4"'));
  // Everything else is preserved verbatim.
  assert.ok(res.result.includes("import { cn } from '@/lib/utils';"));
  assert.ok(res.result.includes('export function Hero()'));
});

test('multiple distinct blocks each apply once, sequentially', () => {
  const text =
    block('export function Hero()', 'export function HeroSection()') +
    '\n\n' +
    block('Hello', 'Welcome');
  const res = applyEditsFromResponse(SAMPLE, text);
  assert.equal(res.ok, true);
  assert.equal(res.appliedCount, 2);
  assert.ok(res.result.includes('export function HeroSection()'));
  assert.ok(res.result.includes('>Welcome<'));
});

test('a later block sees an earlier block’s replacement (running content)', () => {
  const text =
    block('Hello', 'Hola mundo') + '\n' + block('Hola mundo', 'Bonjour');
  const res = applyEditsFromResponse(SAMPLE, text);
  assert.equal(res.ok, true);
  assert.ok(res.result.includes('Bonjour'));
});

// ---- no-match -------------------------------------------------------------
test('no match rejects the whole edit and never mutates source', () => {
  const res = applyEditsFromResponse(
    SAMPLE,
    block('className="does-not-exist"', 'className="p-8"')
  );
  assert.equal(res.ok, false);
  assert.match(res.reason, /not found/);
});

test('one failing block among several rejects the ENTIRE edit (all-or-nothing)', () => {
  const text =
    block('className="p-4"', 'className="p-8"') + // would match
    '\n' +
    block('NOT_PRESENT', 'x'); // fails
  const res = applySearchReplace(SAMPLE, parseSearchReplaceBlocks(text));
  assert.equal(res.ok, false);
  // The good block must NOT have been partially applied — caller gets no result.
  assert.equal(res.result, undefined);
});

// ---- multi-match ----------------------------------------------------------
test('a SEARCH that matches multiple times is rejected (must be unique)', () => {
  const dup = 'const a = 1;\nconst a = 1;\n';
  const res = applyEditsFromResponse(dup, block('const a = 1;', 'const a = 2;'));
  assert.equal(res.ok, false);
  assert.match(res.reason, /matched 2 times/);
});

// ---- guards ---------------------------------------------------------------
test('empty SEARCH is rejected', () => {
  const res = applySearchReplace(SAMPLE, [{ search: '', replace: 'x' }]);
  assert.equal(res.ok, false);
  assert.match(res.reason, /empty SEARCH/);
});

test('no parseable blocks yields ok:false', () => {
  const res = applyEditsFromResponse(SAMPLE, 'just prose, no markers here');
  assert.equal(res.ok, false);
  assert.match(res.reason, /no SEARCH\/REPLACE blocks/);
});

// ---- parser ---------------------------------------------------------------
test('parser captures search and replace bodies including blank lines', () => {
  const text = block('line1\n\nline2', 'newline1\n\nnewline2');
  const blocks = parseSearchReplaceBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].search, 'line1\n\nline2');
  assert.equal(blocks[0].replace, 'newline1\n\nnewline2');
});

test('parser tolerates CRLF line endings around markers', () => {
  const text = '<<<<<<< SEARCH\r\nHello\r\n=======\r\nWorld\r\n>>>>>>> REPLACE';
  const blocks = parseSearchReplaceBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].search, 'Hello');
  assert.equal(blocks[0].replace, 'World');
});

test('replacement text with $ is inserted literally (no regex substitution)', () => {
  const src = 'const price = OLD;\n';
  const res = applyEditsFromResponse(src, block('OLD', '$1_$&_$$'));
  assert.equal(res.ok, true);
  assert.ok(res.result.includes('const price = $1_$&_$$;'));
});
