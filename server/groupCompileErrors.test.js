import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupCompileErrors,
  classifyError,
  labelForError,
  MAX_FILES_PER_BATCH,
} from '../src/utils/groupCompileErrors.js';

// ---------------------------------------------------------------------------
// groupCompileErrors — batching of esbuild compile errors so the Verifier
// repairs a whole error CLASS in one LLM call. The dispatch cascade (3 export
// mismatches across 3 files) is the documented case the batcher must collapse
// to a single repair.
// ---------------------------------------------------------------------------

const err = (message, file) => ({ message, file, line: 1, lineText: '' });

// ---- classifyError: same class → same key regardless of file/identifier -----
test('classifyError collapses the exports cascade to one key', () => {
  const a = classifyError('No matching export in "virtual:src/App.tsx" for import "HeroSection"');
  const b = classifyError('No matching export in "virtual:src/pages/Home.tsx" for import "ContactSection"');
  const c = classifyError("No matching export in 'src/x.tsx' for import 'Nav'");
  assert.equal(a, b);
  assert.equal(b, c);
});

test('classifyError separates distinct error classes', () => {
  const exportErr = classifyError('No matching export in "src/App.tsx" for import "Hero"');
  const resolveErr = classifyError('Could not resolve "framer-motion"');
  assert.notEqual(exportErr, resolveErr);
});

test('labelForError recognizes the export-mismatch class', () => {
  assert.equal(
    labelForError('No matching export in "src/App.tsx" for import "Hero"'),
    'export/import name mismatch'
  );
});

// ---- THE CASCADE: 3 export errors in 3 files → 1 batch, 1 fix call ----------
test('exports cascade: 3 same-class errors across 3 files collapse to ONE batch', () => {
  const files = {
    'src/App.tsx': 'export function App() {}',
    'src/pages/Home.tsx': 'export function Home() {}',
    'src/pages/About.tsx': 'export function About() {}',
  };
  const errors = [
    err('No matching export in "virtual:src/App.tsx" for import "HeroSection"', 'src/App.tsx'),
    err('No matching export in "virtual:src/pages/Home.tsx" for import "ContactSection"', 'src/pages/Home.tsx'),
    err('No matching export in "virtual:src/pages/About.tsx" for import "TeamSection"', 'src/pages/About.tsx'),
  ];

  const batches = groupCompileErrors(errors, (p) => files[p]);

  assert.equal(batches.length, 1, 'one batch for the whole cascade');
  assert.equal(batches[0].errors.length, 3, 'all three errors in the batch');
  assert.equal(batches[0].files.length, 3, 'all three files carried with content');
  assert.equal(batches[0].label, 'export/import name mismatch');
  // Full contents travel with the batch (per-level context rule: complete files).
  assert.equal(batches[0].files[0].content, 'export function App() {}');
});

// ---- distinct classes → distinct batches ------------------------------------
test('two error classes produce two batches', () => {
  const files = { 'src/A.tsx': 'a', 'src/B.tsx': 'b' };
  const errors = [
    err('No matching export in "src/A.tsx" for import "X"', 'src/A.tsx'),
    err('Could not resolve "missing-pkg"', 'src/B.tsx'),
  ];
  const batches = groupCompileErrors(errors, (p) => files[p]);
  assert.equal(batches.length, 2);
});

// ---- errors on the SAME file are not double-counted as files ----------------
test('multiple errors on one file collapse to a single file unit', () => {
  const files = { 'src/A.tsx': 'a' };
  const errors = [
    err('No matching export in "src/A.tsx" for import "X"', 'src/A.tsx'),
    err('No matching export in "src/A.tsx" for import "Y"', 'src/A.tsx'),
  ];
  const batches = groupCompileErrors(errors, (p) => files[p]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].files.length, 1, 'one file');
  assert.equal(batches[0].errors.length, 2, 'both errors');
});

// ---- SAFETY CAP: > MAX_FILES_PER_BATCH files of one class split into two -----
test('a class with more than the file cap splits into multiple batches', () => {
  const files = {};
  const errors = [];
  const n = MAX_FILES_PER_BATCH + 2; // 8 files
  for (let i = 0; i < n; i++) {
    const p = `src/F${i}.tsx`;
    files[p] = `export function F${i}() {}`;
    errors.push(err(`No matching export in "${p}" for import "X${i}"`, p));
  }
  const batches = groupCompileErrors(errors, (p) => files[p]);
  assert.ok(batches.length >= 2, 'split into at least two batches');
  for (const b of batches) {
    assert.ok(b.files.length <= MAX_FILES_PER_BATCH, 'each batch honors the file cap');
  }
  // No file lost across the split.
  const total = batches.reduce((s, b) => s + b.files.length, 0);
  assert.equal(total, n);
});

// ---- SAFETY CAP: char budget splits even with few files ---------------------
test('a class exceeding the char cap splits by content size', () => {
  const big = 'x'.repeat(40000);
  const files = { 'src/A.tsx': big, 'src/B.tsx': big };
  const errors = [
    err('No matching export in "src/A.tsx" for import "X"', 'src/A.tsx'),
    err('No matching export in "src/B.tsx" for import "Y"', 'src/B.tsx'),
  ];
  const batches = groupCompileErrors(errors, (p) => files[p], { maxChars: 60000 });
  assert.equal(batches.length, 2, 'two 40k files exceed 60k together → split');
});

// ---- errors with no resolvable file contribute no batch ---------------------
test('errors with no identifiable file are dropped (nothing to repair)', () => {
  const errors = [err('Some global esbuild error', null)];
  const batches = groupCompileErrors(errors, () => undefined);
  assert.equal(batches.length, 0);
});

test('empty input yields no batches', () => {
  assert.deepEqual(groupCompileErrors([], () => undefined), []);
});
