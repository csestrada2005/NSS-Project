import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveProjectRoutes } from '../src/utils/projectRoutes.js';

test('deriveProjectRoutes: Index.tsx becomes "/"', () => {
  const files = new Map([
    ['src/pages/Index.tsx', ''],
    ['src/pages/About.tsx', ''],
  ]);
  assert.deepEqual(deriveProjectRoutes(files), ['/', '/about']);
});

test('deriveProjectRoutes: Home.tsx also becomes "/"', () => {
  const files = new Map([['src/pages/Home.tsx', '']]);
  assert.deepEqual(deriveProjectRoutes(files), ['/']);
});

test('deriveProjectRoutes: "/" always sorts first, rest alphabetical', () => {
  const files = new Map([
    ['src/pages/Pricing.tsx', ''],
    ['src/pages/About.tsx', ''],
    ['src/pages/Index.tsx', ''],
  ]);
  assert.deepEqual(deriveProjectRoutes(files), ['/', '/about', '/pricing']);
});

test('deriveProjectRoutes: ignores non-page files and non-tsx/jsx files', () => {
  const files = new Map([
    ['src/pages/Index.tsx', ''],
    ['src/components/About.tsx', ''],
    ['src/pages/notes.txt', ''],
  ]);
  assert.deepEqual(deriveProjectRoutes(files), ['/']);
});

test('deriveProjectRoutes: dedupes routes that normalize to the same path', () => {
  const files = new Map([
    ['src/pages/About.tsx', ''],
    ['src/pages/about.jsx', ''],
  ]);
  assert.deepEqual(deriveProjectRoutes(files), ['/about']);
});

test('deriveProjectRoutes: accepts a plain iterable of paths, not only a Map', () => {
  assert.deepEqual(deriveProjectRoutes(['src/pages/Index.tsx', 'src/pages/Contact.tsx']), ['/', '/contact']);
});

test('deriveProjectRoutes: empty input gives an empty list', () => {
  assert.deepEqual(deriveProjectRoutes(new Map()), []);
});
