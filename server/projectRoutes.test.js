import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveProjectRoutes, derivePageEntries } from '../src/utils/projectRoutes.js';

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

test('derivePageEntries: "/" gets the "Inicio" label regardless of file name', () => {
  const files = new Map([['src/pages/Index.tsx', '']]);
  assert.deepEqual(derivePageEntries(files), [{ name: 'Inicio', route: '/' }]);

  const files2 = new Map([['src/pages/Home.tsx', '']]);
  assert.deepEqual(derivePageEntries(files2), [{ name: 'Inicio', route: '/' }]);
});

test('derivePageEntries: inserts spaces before capitals in multi-word file names', () => {
  const files = new Map([['src/pages/AboutUs.tsx', '']]);
  assert.deepEqual(derivePageEntries(files), [{ name: 'About Us', route: '/aboutus' }]);
});

test('derivePageEntries: single-word names are left untouched', () => {
  const files = new Map([['src/pages/Contact.tsx', '']]);
  assert.deepEqual(derivePageEntries(files), [{ name: 'Contact', route: '/contact' }]);
});

test('derivePageEntries: first file found wins on a route collision', () => {
  const files = new Map([
    ['src/pages/About.tsx', ''],
    ['src/pages/about.jsx', ''],
  ]);
  assert.deepEqual(derivePageEntries(files), [{ name: 'About', route: '/about' }]);
});

test('derivePageEntries: "/" always sorts first', () => {
  const files = new Map([
    ['src/pages/Pricing.tsx', ''],
    ['src/pages/Index.tsx', ''],
  ]);
  const entries = derivePageEntries(files);
  assert.equal(entries[0].route, '/');
  assert.equal(entries[1].route, '/pricing');
});
