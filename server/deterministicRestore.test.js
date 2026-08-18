import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planDeterministicRestore,
  missingReferencedPaths,
  absentFilesTelemetry,
} from '../src/utils/deterministicRestore.js';
import { groupCompileErrors } from '../src/utils/groupCompileErrors.js';
import { compileFiles } from './compiler.js';

// ---------------------------------------------------------------------------
// El caso de producción, byte a byte: el plan borró src/pages/Menu.tsx, que
// src/App.tsx sigue importando con un specifier RELATIVO ('./pages/Menu'). El
// path está en originalFiles (existía antes del intent) y en los deletedPaths
// del plan, así que su contenido exacto sigue disponible y la reparación
// correcta NO es generativa.
//
// Los mensajes y los `file` de los errores son los que emite de verdad el
// plugin virtual del compilador (server/compiler.js): esbuild ancla el error
// en el IMPORTADOR, y ese path es el que permite resolver un specifier
// relativo.
// ---------------------------------------------------------------------------

const MENU_ORIGINAL = `export default function Menu() {
  return <section className="menu">Carta</section>;
}
`;
const HOME_ORIGINAL = `export default function Home() {
  return <section className="home">Inicio</section>;
}
`;

/** Proyecto previo al intent. */
function originalFiles() {
  return new Map([
    ['src/main.tsx', "import App from './App';\n"],
    ['src/App.tsx', "export default function App() { return null; }\n"],
    ['src/pages/Menu.tsx', MENU_ORIGINAL],
    ['src/pages/Home.tsx', HOME_ORIGINAL],
  ]);
}

/** Mapa vivo tras aplicar el plan: App reescrita, ambas páginas BORRADAS. */
function filesAfterPlan(deletedPaths = ['src/pages/Menu.tsx', 'src/pages/Home.tsx']) {
  const files = originalFiles();
  files.set(
    'src/App.tsx',
    "import Menu from './pages/Menu';\nimport Home from '@/pages/Home';\n" +
      'export default function App() { return <><Home /><Menu /></>; }\n'
  );
  for (const path of deletedPaths) files.delete(path);
  return files;
}

/** Los dos errores que devuelve el compile con esas páginas ausentes. */
const RESOLVE_ERRORS = [
  {
    message: 'Cannot resolve "./pages/Menu" from "src/App.tsx"',
    file: 'src/App.tsx',
    line: 1,
    lineText: "import Menu from './pages/Menu';",
  },
  {
    message: 'Cannot resolve "@/pages/Home" from "src/App.tsx"',
    file: 'src/App.tsx',
    line: 2,
    lineText: "import Home from '@/pages/Home';",
  },
];

function batchFor(errors, files) {
  const batches = groupCompileErrors(errors, (p) => files.get(p));
  assert.equal(batches.length, 1, 'los errores de resolución forman un solo lote');
  return batches[0];
}

// ---- el caso exacto: specifier relativo + path borrado por el plan ---------

test('un specifier RELATIVO cuyo módulo borró el plan se restaura sin llamar al modelo', () => {
  const universe = originalFiles();
  const files = filesAfterPlan();
  const batch = batchFor(RESOLVE_ERRORS, files);

  const restore = planDeterministicRestore(batch, files, universe);

  // 1. Se restauró — el relativo './pages/Menu' incluido, no sólo el alias.
  assert.deepEqual(restore.restored, ['src/pages/Menu.tsx', 'src/pages/Home.tsx']);

  // 2. Sin llamada al modelo: el lote queda íntegramente reparado, así que el
  //    Verifier se salta el fixBatch (no hay nada que reparar y el contrato de
  //    repair dejaría al modelo quitar la referencia como último recurso).
  assert.equal(restore.skipModel, true);

  // 3. Contenido IDÉNTICO al de originalFiles, byte a byte.
  assert.equal(restore.files.get('src/pages/Menu.tsx'), MENU_ORIGINAL);
  assert.equal(restore.files.get('src/pages/Home.tsx'), HOME_ORIGINAL);

  // El mapa de entrada no se muta: la restauración devuelve uno nuevo.
  assert.equal(files.has('src/pages/Menu.tsx'), false);

  // 4. Sufijo de telemetría: restored_files presente, recreated_files ausente
  //    (nadie llamó al modelo).
  const suffix = absentFilesTelemetry(restore.restored, []);
  assert.equal(suffix, '| restored_files=[src/pages/Menu.tsx,src/pages/Home.tsx]');
  assert.ok(!suffix.includes('recreated_files'));
});

test('tras restaurar, el módulo deja de contar como ausente (no viaja al modelo)', () => {
  const universe = originalFiles();
  const files = filesAfterPlan();
  const batch = batchFor(RESOLVE_ERRORS, files);

  // Antes: los dos paths son ausentes y ESCRIBIBLES sólo en su path exacto.
  const before = missingReferencedPaths(batch, files, universe);
  assert.deepEqual(before.map((r) => r.path), ['src/pages/Menu.tsx', 'src/pages/Home.tsx']);
  assert.ok(before.every((r) => r.wasDeleted));
  assert.deepEqual(before[0].writable, ['src/pages/Menu.tsx']);

  // Después: ninguno. Sin `missingRefs` no se envía la cabecera
  // x-forge-repair-missing-files ni se declara nada escribible por el modelo.
  const { files: restored } = planDeterministicRestore(batch, files, universe);
  assert.deepEqual(missingReferencedPaths(batch, restored, universe), []);
});

// ---- lo que NO debe saltarse la llamada al modelo --------------------------

test('un módulo que nunca existió sigue yendo al modelo (regla 4 intacta)', () => {
  const universe = originalFiles();
  universe.delete('src/pages/Menu.tsx'); // nunca existió: no hay nada que restaurar
  const files = filesAfterPlan(['src/pages/Menu.tsx', 'src/pages/Home.tsx']);

  const batch = batchFor(RESOLVE_ERRORS, files);
  const restore = planDeterministicRestore(batch, files, universe);

  assert.deepEqual(restore.restored, ['src/pages/Home.tsx']);
  assert.equal(restore.skipModel, false, 'Menu.tsx sigue ausente: el modelo debe escribirlo');
  assert.equal(restore.files.has('src/pages/Menu.tsx'), false);
});

test('un error del lote que la restauración no toca conserva la llamada al modelo', () => {
  const universe = originalFiles();
  const files = filesAfterPlan(['src/pages/Menu.tsx']);
  const errors = [
    RESOLVE_ERRORS[0],
    {
      // Paquete bare: no resuelve a ningún path del proyecto, así que ninguna
      // restauración puede repararlo.
      message: 'Cannot resolve "react-router-dom" from "src/App.tsx"',
      file: 'src/App.tsx',
      line: 3,
      lineText: "import { Link } from 'react-router-dom';",
    },
  ];

  const batch = batchFor(errors, files);
  const restore = planDeterministicRestore(batch, files, universe);

  assert.deepEqual(restore.restored, ['src/pages/Menu.tsx']);
  assert.equal(restore.skipModel, false, 'el error del paquete bare sigue vivo');
});

test('sin nada que restaurar no se salta nada y el sufijo queda vacío', () => {
  const universe = originalFiles();
  const files = originalFiles();
  const errors = [
    {
      message: 'No matching export in "virtual:src/pages/Menu.tsx" for import "default"',
      file: 'src/App.tsx',
      line: 1,
      lineText: "import Menu from './pages/Menu';",
    },
  ];

  const batch = batchFor(errors, files);
  const restore = planDeterministicRestore(batch, files, universe);

  assert.deepEqual(restore.restored, []);
  assert.equal(restore.skipModel, false);
  assert.equal(restore.files, files, 'sin restauraciones se devuelve el mismo mapa');
  assert.equal(absentFilesTelemetry([], []), '');
});

// ---- de punta a punta contra el compilador real ---------------------------

test('el ciclo real: compile falla, se restaura sin modelo y el recompile sale verde', async () => {
  const MENU = 'export default function Menu() { return <section>Carta</section>; }\n';
  const universe = new Map([
    ['src/main.tsx',
      "import React from 'react';\n" +
      "import ReactDOM from 'react-dom/client';\n" +
      "import App from './App';\n" +
      "ReactDOM.createRoot(document.getElementById('root')).render(<App />);\n"],
    ['src/App.tsx', 'export default function App() { return null; }\n'],
    ['src/pages/Menu.tsx', MENU],
  ]);

  // El plan reescribe App para usar Menu... y borra Menu.
  let files = new Map(universe);
  files.set(
    'src/App.tsx',
    "import Menu from './pages/Menu';\nexport default function App() { return <Menu />; }\n"
  );
  files.delete('src/pages/Menu.tsx');

  const failed = await compileFiles(Object.fromEntries(files));
  assert.match(failed.error, /Cannot resolve "\.\/pages\/Menu" from "src\/App\.tsx"/);

  const batch = batchFor(failed.errorDetailList, files);
  const restore = planDeterministicRestore(batch, files, universe);
  assert.deepEqual(restore.restored, ['src/pages/Menu.tsx']);
  assert.equal(restore.skipModel, true);
  files = restore.files;

  // Sin haber llamado a ningún modelo, el proyecto vuelve a compilar y el
  // archivo repuesto es el original byte a byte.
  const green = await compileFiles(Object.fromEntries(files));
  assert.equal(green.error, undefined);
  assert.equal(files.get('src/pages/Menu.tsx'), MENU);
});
