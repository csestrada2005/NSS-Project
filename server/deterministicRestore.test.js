import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planDeterministicRestore,
  missingReferencedPaths,
  repairWriteScope,
  mergeRepairBlocks,
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

// ---------------------------------------------------------------------------
// LO RESTAURADO ES IMBORRABLE
//
// El agujero real: restaurar devuelve el archivo a `files`, y en el intento
// SIGUIENTE el compile ya no dice "Cannot resolve" (el módulo está) sino
// `No matching export in "virtual:src/pages/Menu.tsx" for import "Menu"`. Ese
// mensaje cita el path RESUELTO, así que referencedProjectFiles lo recoge, pasa
// a bloque editable, la regla 3 manda corregirlo y el merge acepta la
// reescritura: los 12 productos en español salen sustituidos por un "Sourdough
// Country Loaf €9.50" que el modelo se inventó.
// ---------------------------------------------------------------------------

/** El error del intento 2, verbatim del compilador. */
const EXPORT_MISMATCH = {
  message: 'No matching export in "virtual:src/pages/Menu.tsx" for import "Menu"',
  file: 'src/App.tsx',
  line: 1,
  lineText: "import { Menu } from './pages/Menu';",
};

/** Lo que el modelo devolvió en producción: la carta reinventada. */
const MENU_REINVENTADO = `export function Menu() {
  return <ul><li>Sourdough Country Loaf €9.50 <span className="badge">New</span></li></ul>;
}
`;

test('un path restaurado sale de known: la reescritura del modelo se rechaza', () => {
  const files = originalFiles();
  const batch = batchFor([EXPORT_MISMATCH], files);
  const refFiles = [{ path: 'src/pages/Menu.tsx', content: MENU_ORIGINAL }];

  // Sin protección — el comportamiento que produjo el bug.
  const open_ = repairWriteScope({
    batchFiles: batch.files, refFiles, missingRefs: [], protectedPaths: [],
  });
  assert.equal(open_.known.has('src/pages/Menu.tsx'), true);
  const clobbered = mergeRepairBlocks(
    files, new Map([['src/pages/Menu.tsx', MENU_REINVENTADO]]), open_.known
  );
  assert.equal(clobbered.files.get('src/pages/Menu.tsx'), MENU_REINVENTADO, 'así se perdía la carta');

  // Con el path restaurado protegido.
  const locked = repairWriteScope({
    batchFiles: batch.files, refFiles, missingRefs: [],
    protectedPaths: ['src/pages/Menu.tsx'],
  });
  assert.equal(locked.known.has('src/pages/Menu.tsx'), false, 'fuera de known');
  assert.deepEqual(locked.editableRefs, [], 'no es material editable');
  assert.deepEqual(locked.readOnlyRefs.map((f) => f.path), ['src/pages/Menu.tsx']);
  assert.deepEqual(locked.known, new Set(['src/App.tsx']), 'el consumidor sí es editable');

  const kept = mergeRepairBlocks(
    files, new Map([['src/pages/Menu.tsx', MENU_REINVENTADO]]), locked.known
  );
  assert.equal(kept.files.get('src/pages/Menu.tsx'), MENU_ORIGINAL, 'la restauración sobrevive');
  assert.deepEqual(kept.rejected, ['src/pages/Menu.tsx']);
  assert.deepEqual(kept.applied, []);
});

test('la protección cubre TODAS las vías, no sólo la de refFiles', () => {
  const files = originalFiles();

  // (a) el archivo restaurado es el que esbuild culpa.
  const asBlamed = repairWriteScope({
    batchFiles: [{ path: 'src/pages/Menu.tsx', content: MENU_ORIGINAL }],
    refFiles: [],
    missingRefs: [],
    protectedPaths: ['src/pages/Menu.tsx'],
  });
  assert.equal(asBlamed.known.has('src/pages/Menu.tsx'), false);
  assert.deepEqual(asBlamed.editableBatchFiles, []);
  assert.deepEqual(asBlamed.readOnlyRefs.map((f) => f.path), ['src/pages/Menu.tsx']);

  // (b) el archivo restaurado viaja como "ausente escribible" (cabecera
  //     x-forge-repair-missing-files): tampoco.
  const asMissing = repairWriteScope({
    batchFiles: [{ path: 'src/App.tsx', content: files.get('src/App.tsx') }],
    refFiles: [],
    missingRefs: [{ path: 'src/pages/Menu.tsx', writable: ['src/pages/Menu.tsx'], wasDeleted: true }],
    protectedPaths: ['src/pages/Menu.tsx'],
  });
  assert.deepEqual(asMissing.missingRefs, [], 'no se declara escribible');
  assert.equal(asMissing.known.has('src/pages/Menu.tsx'), false);

  // (c) el modelo devuelve el bloque igualmente: el merge lo tira.
  const merged = mergeRepairBlocks(
    files, new Map([['src/pages/Menu.tsx', MENU_REINVENTADO]]), asMissing.known
  );
  assert.equal(merged.files.get('src/pages/Menu.tsx'), MENU_ORIGINAL);
});

test('lo NO restaurado sigue siendo editable (la regla 3 no se rompe)', () => {
  const files = originalFiles();
  const batch = batchFor([EXPORT_MISMATCH], files);
  const refFiles = [{ path: 'src/pages/Menu.tsx', content: MENU_ORIGINAL }];

  const scope = repairWriteScope({
    batchFiles: batch.files, refFiles, missingRefs: [], protectedPaths: [],
  });
  assert.deepEqual(scope.editableRefs.map((f) => f.path), ['src/pages/Menu.tsx']);
  assert.deepEqual(scope.readOnlyRefs, []);

  const merged = mergeRepairBlocks(
    files, new Map([['src/pages/Menu.tsx', MENU_ORIGINAL + 'export const x = 1;\n']]), scope.known
  );
  assert.deepEqual(merged.applied, ['src/pages/Menu.tsx']);

  // Y una ruta que nadie declaró sigue sin entrar.
  const invented = mergeRepairBlocks(
    files, new Map([['src/pages/Inventada.tsx', 'export default () => null;']]), scope.known
  );
  assert.deepEqual(invented.rejected, ['src/pages/Inventada.tsx']);
  assert.equal(invented.files.has('src/pages/Inventada.tsx'), false);
});

test('una recreación vacía se sigue rechazando', () => {
  const files = originalFiles();
  files.delete('src/pages/Menu.tsx');
  const known = new Set(['src/pages/Menu.tsx']);
  const merged = mergeRepairBlocks(files, new Map([['src/pages/Menu.tsx', '   \n']]), known);
  assert.deepEqual(merged.rejected, ['src/pages/Menu.tsx']);
  assert.equal(merged.files.has('src/pages/Menu.tsx'), false);
});
