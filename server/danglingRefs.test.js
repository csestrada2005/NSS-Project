/**
 * Tests del escaneo determinista de referencias post-delete.
 *
 * El caso central es el incidente que motivó el módulo: "Elimina la página
 * Menú" borró src/pages/Menu.tsx y el diff de src/App.tsx quitó el import pero
 * dejó <Menu /> en el JSX. esbuild no reporta identificadores no definidos, así
 * que el verify pasaba en verde y el preview reventaba en runtime.
 *
 * El resto cubre la otra mitad del contrato: NO disparar. Un falso positivo
 * tumba el intent entero (fail-closed), así que la precisión se prueba tan
 * explícitamente como la detección.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findDanglingRefs,
  syntheticDanglingErrors,
  danglingRefsTelemetry,
  exportedSymbols,
  boundNames,
  maskNonCode,
} from '../src/utils/danglingRefs.js';

const MENU_PAGE = `import { MenuSection } from '@/components/sections/MenuSection';

export default function Menu() {
  return <MenuSection />;
}
`;

/** App.tsx íntegro: import presente y ruta cableada. */
const APP_WIRED = `import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Index from '@/pages/Index';
import Menu from '@/pages/Menu';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/menu" element={<Menu />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
`;

/** El diff de 62 tokens: se fue el import, se quedó la ruta. */
const APP_HALF_UNWIRED = APP_WIRED.replace("import Menu from '@/pages/Menu';\n", '');

/** El descableado COMPLETO, que es lo que el plan debía producir. */
const APP_UNWIRED = APP_HALF_UNWIRED.replace(
  '        <Route path="/menu" element={<Menu />} />\n',
  ''
);

const INDEX_PAGE = `export default function Index() {
  return <main>Home</main>;
}
`;

function projectAfterDelete(appContent) {
  return new Map([
    ['src/App.tsx', appContent],
    ['src/pages/Index.tsx', INDEX_PAGE],
  ]);
}

function projectBefore(appContent) {
  return new Map([
    ['src/App.tsx', appContent],
    ['src/pages/Index.tsx', INDEX_PAGE],
    ['src/pages/Menu.tsx', MENU_PAGE],
  ]);
}

// ---------------------------------------------------------------------------
// El incidente
// ---------------------------------------------------------------------------

test('descableado a medias: <Menu /> sin import se detecta como referencia colgante', () => {
  const refs = findDanglingRefs(
    ['src/pages/Menu.tsx'],
    projectAfterDelete(APP_HALF_UNWIRED),
    projectBefore(APP_WIRED)
  );

  assert.equal(refs.length, 1);
  assert.equal(refs[0].deleted, 'src/pages/Menu.tsx');
  assert.equal(refs[0].survivor, 'src/App.tsx');
  assert.equal(refs[0].kind, 'symbol');
  assert.deepEqual(refs[0].symbols, ['Menu']);
  assert.match(refs[0].lineText, /<Menu \/>/);
});

test('descableado completo: sin referencias, el verify puede dar verde', () => {
  const refs = findDanglingRefs(
    ['src/pages/Menu.tsx'],
    projectAfterDelete(APP_UNWIRED),
    projectBefore(APP_WIRED)
  );
  assert.deepEqual(refs, []);
});

test('import colgante: el import sobrevive al borrado y se reporta como tal', () => {
  // Esta forma normalmente la coge el compilador ("Cannot resolve"), pero no
  // cuando esbuild elide el import (import type / uso sólo en posición de tipo).
  const refs = findDanglingRefs(
    ['src/pages/Menu.tsx'],
    projectAfterDelete(APP_WIRED),
    projectBefore(APP_WIRED)
  );

  assert.equal(refs.length, 1);
  assert.equal(refs[0].kind, 'import');
  assert.equal(refs[0].survivor, 'src/App.tsx');
  assert.match(refs[0].lineText, /import Menu from/);
});

// ---------------------------------------------------------------------------
// No disparar: la mitad cara del contrato
// ---------------------------------------------------------------------------

test('un delete ya revertido (restaurado/recreado) deja de contar como borrado', () => {
  const live = projectAfterDelete(APP_HALF_UNWIRED);
  live.set('src/pages/Menu.tsx', MENU_PAGE); // el repair lo repuso
  const refs = findDanglingRefs(['src/pages/Menu.tsx'], live, projectBefore(APP_WIRED));
  assert.deepEqual(refs, []);
});

test('un path que nunca existió no produce hallazgos', () => {
  const refs = findDanglingRefs(
    ['src/pages/Fantasma.tsx'],
    projectAfterDelete(APP_UNWIRED),
    projectBefore(APP_WIRED)
  );
  assert.deepEqual(refs, []);
});

test('sin deletes, el escaneo es un no-op', () => {
  assert.deepEqual(findDanglingRefs([], projectAfterDelete(APP_WIRED), projectBefore(APP_WIRED)), []);
});

test('el superviviente tiene su PROPIO Menu: nombre ligado, no se reporta', () => {
  const own = `import Menu from '@/components/Menu';

export default function Layout() {
  return <Menu />;
}
`;
  const live = new Map([
    ['src/Layout.tsx', own],
    ['src/components/Menu.tsx', 'export default function Menu() { return null; }\n'],
  ]);
  const before = new Map([...live, ['src/pages/Menu.tsx', MENU_PAGE]]);
  assert.deepEqual(findDanglingRefs(['src/pages/Menu.tsx'], live, before), []);
});

test('el nombre sólo aparece en un comentario o en una cadena: no se reporta', () => {
  const app = `export default function App() {
  // La página Menu se eliminó a petición del usuario.
  const label = 'Menu';
  return <nav aria-label="Menu">{label}</nav>;
}
`;
  const live = new Map([['src/App.tsx', app]]);
  const before = new Map([...live, ['src/pages/Menu.tsx', MENU_PAGE]]);
  assert.deepEqual(findDanglingRefs(['src/pages/Menu.tsx'], live, before), []);
});

test('el nombre sólo aparece como texto JSX en prosa: no se reporta', () => {
  const app = `export default function App() {
  return <nav><a href="/">Menu</a></nav>;
}
`;
  const live = new Map([['src/App.tsx', app]]);
  const before = new Map([...live, ['src/pages/Menu.tsx', MENU_PAGE]]);
  assert.deepEqual(findDanglingRefs(['src/pages/Menu.tsx'], live, before), []);
});

test('borrar la página Y su sección propia no se reporta entre ellas', () => {
  const before = projectBefore(APP_WIRED);
  before.set(
    'src/components/sections/MenuSection.tsx',
    'export function MenuSection() { return <div />; }\n'
  );
  const live = projectAfterDelete(APP_UNWIRED);
  const refs = findDanglingRefs(
    ['src/pages/Menu.tsx', 'src/components/sections/MenuSection.tsx'],
    live,
    before
  );
  assert.deepEqual(refs, []);
});

test('un export con nombre que sigue usándose sí se reporta', () => {
  const before = new Map([
    ['src/data/menu.ts', 'export const menuItems = [];\nexport type MenuItem = { id: string };\n'],
    ['src/App.tsx', "import { menuItems } from '@/data/menu';\n\nexport default function App() {\n  return <ul>{menuItems.map((i) => i)}</ul>;\n}\n"],
  ]);
  const live = new Map([
    ['src/App.tsx', 'export default function App() {\n  return <ul>{menuItems.map((i) => i)}</ul>;\n}\n'],
  ]);
  const refs = findDanglingRefs(['src/data/menu.ts'], live, before);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0].symbols, ['menuItems']);
});

// ---------------------------------------------------------------------------
// Mensaje sintético — el contrato con el ciclo de reparación
// ---------------------------------------------------------------------------

test('el mensaje sintético NO lleva comillas (o la restauración determinista repondría el borrado)', () => {
  const refs = findDanglingRefs(
    ['src/pages/Menu.tsx'],
    projectAfterDelete(APP_HALF_UNWIRED),
    projectBefore(APP_WIRED)
  );
  const [err] = syntheticDanglingErrors(refs);

  // scanErrorRefs (deterministicRestore) trata todo segmento entrecomillado del
  // MENSAJE como candidato a specifier: una comilla aquí resucita el archivo que
  // el usuario mandó borrar.
  assert.ok(!err.message.includes('"'), 'el mensaje no puede llevar comillas dobles');
  assert.ok(!err.message.includes("'"), 'el mensaje no puede llevar comillas simples');
});

test('el mensaje sintético apunta al consumidor y prohíbe recrear el borrado', () => {
  const refs = findDanglingRefs(
    ['src/pages/Menu.tsx'],
    projectAfterDelete(APP_HALF_UNWIRED),
    projectBefore(APP_WIRED)
  );
  const [err] = syntheticDanglingErrors(refs);

  assert.equal(err.file, 'src/App.tsx'); // el archivo culpado es el SUPERVIVIENTE
  assert.match(err.message, /^deleted file src\/pages\/Menu\.tsx still referenced by src\/App\.tsx:/);
  assert.match(err.message, /do NOT recreate it/);
  assert.match(err.message, /UNWIRE src\/App\.tsx/);
  assert.match(err.lineText, /<Menu \/>/);
  assert.equal(typeof err.line, 'number');
});

test('la marca de telemetría es un par por referencia, deduplicado', () => {
  assert.equal(danglingRefsTelemetry([]), '');
  assert.equal(
    danglingRefsTelemetry([
      { deleted: 'a.tsx', survivor: 'b.tsx' },
      { deleted: 'a.tsx', survivor: 'b.tsx' },
      { deleted: 'a.tsx', survivor: 'c.tsx' },
    ]),
    ' [DANGLING_REF:a.tsx->b.tsx,a.tsx->c.tsx]'
  );
});

// ---------------------------------------------------------------------------
// Piezas deterministas
// ---------------------------------------------------------------------------

test('exportedSymbols extrae nombrados, el default declarado y el basename PascalCase', () => {
  assert.deepEqual(exportedSymbols(MENU_PAGE, 'src/pages/Menu.tsx'), ['Menu']);

  assert.deepEqual(
    exportedSymbols('export default function () { return null; }\n', 'src/pages/Menu.tsx'),
    ['Menu']
  );
  assert.deepEqual(
    exportedSymbols('const X = 1;\nexport { X as Y };\n', 'src/lib/x.ts'),
    ['Y']
  );
  assert.deepEqual(
    exportedSymbols('const Page = () => null;\nexport { Page as default };\n', 'src/pages/Menu.tsx'),
    ['Menu', 'Page']
  );
  // Sin export por defecto no se añade el basename.
  assert.deepEqual(exportedSymbols('export const a = 1;\n', 'src/pages/Menu.tsx'), ['a']);
});

test('boundNames cubre imports, declaraciones, desestructuración y parámetros', () => {
  const bound = boundNames(
    maskNonCode(`import Menu, { Card as Tile } from '@/x';
import * as NS from 'y';
const { alpha, beta: gamma } = obj;
function helper(delta) { return delta; }
const arrow = (epsilon) => epsilon;
`)
  );
  for (const name of ['Menu', 'Tile', 'NS', 'alpha', 'gamma', 'helper', 'delta', 'arrow', 'epsilon']) {
    assert.ok(bound.has(name), `esperaba ${name} ligado`);
  }
});

test('maskNonCode conserva la longitud y los saltos de línea', () => {
  const src = `// comentario\nconst a = "cadena";\n/* bloque */\nconst t = \`x \${a} y\`;\n<p>prosa</p>\n`;
  const masked = maskNonCode(src);
  assert.equal(masked.length, src.length);
  assert.equal(masked.split('\n').length, src.split('\n').length);
  assert.ok(!masked.includes('comentario'));
  assert.ok(!masked.includes('cadena'));
  assert.ok(!masked.includes('bloque'));
  assert.ok(!masked.includes('prosa'));
  assert.ok(masked.includes('${a}'), 'las expresiones de plantilla son código y se conservan');
});

test('maskNonCode no se come el código alrededor de una comparación >', () => {
  const masked = maskNonCode('{count > total && <Badge />}');
  assert.ok(masked.includes('total'), 'un tramo con operadores no es texto JSX');
});

// ---------------------------------------------------------------------------
// Integración con el ciclo de reparación existente
// ---------------------------------------------------------------------------

test('el error sintético entra en el batching con el superviviente como archivo culpado', async () => {
  const { groupCompileErrors, labelForError } = await import('../src/utils/groupCompileErrors.js');

  const live = projectAfterDelete(APP_HALF_UNWIRED);
  const errors = syntheticDanglingErrors(
    findDanglingRefs(['src/pages/Menu.tsx'], live, projectBefore(APP_WIRED))
  );

  const batches = groupCompileErrors(errors, (path) => live.get(path));
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].files.map((f) => f.path), ['src/App.tsx']);

  // La clase NO puede caer en las que se rutean a Haiku (syntax / import-name
  // mismatch): descablear un consumidor sin amputar nada más exige juicio.
  assert.equal(labelForError(errors[0].message), 'compilation error');
});

test('la restauración determinista NO repone el archivo borrado a partir del error sintético', async () => {
  const { planDeterministicRestore, missingReferencedPaths } = await import(
    '../src/utils/deterministicRestore.js'
  );
  const { groupCompileErrors } = await import('../src/utils/groupCompileErrors.js');

  const live = projectAfterDelete(APP_HALF_UNWIRED);
  const universe = projectBefore(APP_WIRED);
  const errors = syntheticDanglingErrors(
    findDanglingRefs(['src/pages/Menu.tsx'], live, universe)
  );
  const [batch] = groupCompileErrors(errors, (path) => live.get(path));

  // Éste es EL invariante: un delete intencional no puede resucitar por la
  // puerta de atrás de la reposición byte a byte.
  assert.deepEqual(missingReferencedPaths(batch, live, universe), []);
  const restore = planDeterministicRestore(batch, live, universe);
  assert.deepEqual(restore.restored, []);
  assert.equal(restore.skipModel, false);
  assert.equal(restore.files.has('src/pages/Menu.tsx'), false);
});
