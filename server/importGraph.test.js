import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSpecifiers,
  resolvedImportsOf,
  buildImportedByMap,
  importersOfPath,
  buildImportedByBlock,
} from '../src/utils/importGraph.js';

// ---------------------------------------------------------------------------
// importGraph — quién importa a quién, calculado de los contenidos reales.
// Es la evidencia que le faltaba al Architect (que decidía "código muerto" por
// semántica del nombre) y el guard determinista del Implementer.
// ---------------------------------------------------------------------------

/** Proyecto del caso real: la landing renderiza MenuSection; la página Menú no. */
function projectFixture() {
  return new Map([
    [
      'src/pages/Index.tsx',
      "import { HeroSection } from '@/components/sections/HeroSection';\n" +
        "import { MenuSection } from '@/components/sections/MenuSection';\n" +
        'export default function Index() { return <><HeroSection /><MenuSection /></>; }\n',
    ],
    [
      'src/pages/Menu.tsx',
      "import { MenuGrid } from '../components/menu/MenuGrid';\n" +
        'export default function Menu() { return <MenuGrid />; }\n',
    ],
    ['src/components/sections/HeroSection.tsx', 'export function HeroSection() { return null; }\n'],
    ['src/components/sections/MenuSection.tsx', 'export function MenuSection() { return null; }\n'],
    ['src/components/menu/MenuGrid.tsx', 'export function MenuGrid() { return null; }\n'],
    [
      'src/App.tsx',
      "import Index from './pages/Index';\nimport Menu from './pages/Menu';\nexport default function App() { return null; }\n",
    ],
  ]);
}

test('extractSpecifiers catches import, export-from, side-effect and dynamic forms', () => {
  const specs = extractSpecifiers(
    "import { a } from '@/a';\n" +
      "export { b } from './b';\n" +
      "import './styles.css';\n" +
      "const c = await import('@/c');\n" +
      "import React from 'react';\n"
  );
  assert.deepEqual(specs, ['@/a', './b', './styles.css', '@/c', 'react']);
});

test('resolvedImportsOf keeps only specifiers that resolve to real project files', () => {
  const files = projectFixture();
  assert.deepEqual(resolvedImportsOf('src/pages/Index.tsx', files), [
    'src/components/sections/HeroSection.tsx',
    'src/components/sections/MenuSection.tsx',
  ]);
  // Relativo + alias resuelven igual; los paquetes npm no producen arista.
  assert.deepEqual(resolvedImportsOf('src/pages/Menu.tsx', files), [
    'src/components/menu/MenuGrid.tsx',
  ]);
});

// ---- el caso que motivó el guard ------------------------------------------
test('MenuSection is NOT an orphan when the Menu page is deleted: Index still imports it', () => {
  const files = projectFixture();
  const plannedDeletes = ['src/pages/Menu.tsx', 'src/components/sections/MenuSection.tsx'];

  assert.deepEqual(
    importersOfPath('src/components/sections/MenuSection.tsx', files, {
      ignorePaths: plannedDeletes,
    }),
    ['src/pages/Index.tsx'],
    'la sección de la landing sigue viva: el delete debe rechazarse'
  );
});

test('a component only the deleted page imported IS deletable', () => {
  const files = projectFixture();
  const plannedDeletes = ['src/pages/Menu.tsx', 'src/components/menu/MenuGrid.tsx'];

  assert.deepEqual(
    importersOfPath('src/components/menu/MenuGrid.tsx', files, { ignorePaths: plannedDeletes }),
    [],
    'su único importador es la página que este mismo plan borra'
  );
});

test('a file nobody imports has no importers at all', () => {
  const files = projectFixture();
  files.set('src/components/sections/StaleSection.tsx', 'export function StaleSection() {}\n');
  assert.deepEqual(importersOfPath('src/components/sections/StaleSection.tsx', files), []);
});

test('the target never counts as its own importer', () => {
  const files = new Map([
    ['src/a.ts', "export * from './a';\nexport const a = 1;\n"],
  ]);
  assert.deepEqual(importersOfPath('src/a.ts', files), []);
});

test('buildImportedByMap is the reverse graph and ignores deleted importers', () => {
  const files = projectFixture();
  const full = buildImportedByMap(files);
  assert.deepEqual(full.get('src/components/sections/MenuSection.tsx'), ['src/pages/Index.tsx']);
  assert.deepEqual(full.get('src/pages/Index.tsx'), ['src/App.tsx']);

  const withoutIndex = buildImportedByMap(files, { ignorePaths: ['src/pages/Index.tsx'] });
  assert.equal(withoutIndex.get('src/components/sections/MenuSection.tsx'), undefined);
});

test('the prompt block states the real importer of each candidate', () => {
  const block = buildImportedByBlock(projectFixture());
  assert.match(
    block,
    /src\/components\/sections\/MenuSection\.tsx <- imported by: src\/pages\/Index\.tsx/
  );
  assert.match(block, /IMPORT GRAPH/);
});

test('the prompt block marks true orphans and skips ui\/lib noise', () => {
  const files = projectFixture();
  files.set('src/components/sections/StaleSection.tsx', 'export function StaleSection() {}\n');
  files.set('src/components/ui/button.tsx', 'export function Button() { return null; }\n');
  files.set('src/lib/utils.ts', 'export const cn = () => "";\n');

  const block = buildImportedByBlock(files);
  assert.match(block, /src\/components\/sections\/StaleSection\.tsx <- imported by: \(nobody\)/);
  assert.doesNotMatch(block, /src\/components\/ui\/button\.tsx <-/);
  assert.doesNotMatch(block, /src\/lib\/utils\.ts <-/);
});

test('the prompt block truncates and says so instead of silently dropping rows', () => {
  const files = new Map();
  for (let i = 0; i < 130; i++) files.set(`src/components/sections/S${i}.tsx`, 'export const x = 1;\n');
  const block = buildImportedByBlock(files, { limit: 5 });
  assert.match(block, /125 more files omitted/);
});

test('non-source and vendored files never enter the graph', () => {
  const files = new Map([
    ['README.md', "import { X } from '@/components/X';\n"],
    ['node_modules/pkg/index.js', "import { X } from '@/components/X';\n"],
    ['src/components/X.tsx', 'export function X() { return null; }\n'],
  ]);
  assert.deepEqual(importersOfPath('src/components/X.tsx', files), []);
});
