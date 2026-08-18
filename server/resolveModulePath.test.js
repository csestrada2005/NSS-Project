import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatePathsFor, normalizePath } from '../src/utils/resolveModulePath.js';

// ---------------------------------------------------------------------------
// resolveModulePath — traduce el specifier que el error cita al path del
// proyecto que el compilador habría cargado. Es lo que permite al Verifier
// declarar ESCRIBIBLE un archivo ausente: sin esta traducción, la recreación
// que devuelve el batch repair se descarta y el compile repite el error.
// ---------------------------------------------------------------------------

test('normalizePath collapses . and ..', () => {
  assert.equal(normalizePath('src/pages/../components/X.tsx'), 'src/components/X.tsx');
  assert.equal(normalizePath('src/./pages/Index.tsx'), 'src/pages/Index.tsx');
});

// ---- el caso que rompía: delete excesivo de un módulo aliaseado ------------
test('alias specifier resolves to the src/ candidates the compiler tries', () => {
  const candidates = candidatePathsFor(
    '@/components/sections/MenuSection',
    'src/pages/Index.tsx'
  );
  assert.ok(candidates.includes('src/components/sections/MenuSection.tsx'));
  assert.ok(candidates.includes('src/components/sections/MenuSection.ts'));
  assert.ok(candidates.includes('src/components/sections/MenuSection/index.tsx'));
  assert.equal(candidates[0], 'src/components/sections/MenuSection.tsx');
});

test('relative specifier resolves against the importer directory', () => {
  const candidates = candidatePathsFor('./sections/MenuSection', 'src/pages/Index.tsx');
  assert.equal(candidates[0], 'src/pages/sections/MenuSection.tsx');

  const up = candidatePathsFor('../components/Nav', 'src/pages/Index.tsx');
  assert.equal(up[0], 'src/components/Nav.tsx');
});

test('a specifier that already carries an extension is taken as-is', () => {
  assert.deepEqual(
    candidatePathsFor('src/components/sections/MenuSection.tsx', 'src/pages/Index.tsx'),
    ['src/components/sections/MenuSection.tsx']
  );
});

// ---- lo que NO debe resolver: el filtro que impide inventar rutas ----------
test('non-path quoted segments resolve to nothing', () => {
  assert.deepEqual(candidatePathsFor('default', 'src/pages/Index.tsx'), []);
  assert.deepEqual(candidatePathsFor('MenuSection', 'src/pages/Index.tsx'), []);
  assert.deepEqual(candidatePathsFor('react-router-dom', 'src/pages/Index.tsx'), []);
  assert.deepEqual(candidatePathsFor('No matching export', 'src/pages/Index.tsx'), []);
  assert.deepEqual(candidatePathsFor('', 'src/pages/Index.tsx'), []);
});

test('a relative specifier without an importer resolves to nothing', () => {
  assert.deepEqual(candidatePathsFor('./MenuSection', null), []);
});
