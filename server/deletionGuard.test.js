import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandDeletionTargets,
  deleteVerdict,
  deletionTargetsTelemetry,
  NOT_TARGETED_STILL_IMPORTED,
} from '../src/utils/deletionGuard.js';

// ---------------------------------------------------------------------------
// deletionGuard — la legalidad de un delete se mide contra el ORIGINAL.
//
// El incidente que motiva el módulo: "Elimina la página Menú" produjo un plan
// autoconsistente de 6 steps — 3 modifies que descablean, 3 deletes — y uno de
// los deletes borraba la sección que renderiza la LANDING, justificada con "no
// longer imported by Index.tsx". Cierto sólo porque el modify del step 2 acababa
// de quitar el import. El guard anterior leía el mapa vivo y aprobaba la
// evidencia que el propio plan fabricaba.
// ---------------------------------------------------------------------------

/**
 * originalFiles del proyecto real (panadería): la landing renderiza
 * MenuSection; la página Menú, que es otra cosa, renderiza MenuCategorySection.
 * Comparten la palabra "Menu" y nada más.
 */
function bakeryOriginalFiles() {
  return new Map([
    [
      'src/App.tsx',
      "import { BrowserRouter, Routes, Route } from 'react-router-dom';\n" +
        "import Index from './pages/Index';\n" +
        "import Menu from './pages/Menu';\n" +
        'export default function App() {\n' +
        '  return (<BrowserRouter><Routes>' +
        '<Route path="/" element={<Index />} />' +
        '<Route path="/menu" element={<Menu />} />' +
        '</Routes></BrowserRouter>);\n' +
        '}\n',
    ],
    [
      'src/pages/Index.tsx',
      "import { HeroSection } from '@/components/sections/HeroSection';\n" +
        "import { MenuSection } from '@/components/sections/MenuSection';\n" +
        "import { ContactSection } from '@/components/sections/ContactSection';\n" +
        'export default function Index() {\n' +
        '  return (<><HeroSection /><MenuSection /><ContactSection /></>);\n' +
        '}\n',
    ],
    [
      'src/pages/Menu.tsx',
      "import { MenuCategorySection } from '@/components/sections/MenuCategorySection';\n" +
        'export function Menu() { return (<MenuCategorySection />); }\n' +
        'export default Menu;\n',
    ],
    [
      'src/components/sections/MenuSection.tsx',
      "import { Card } from '@/components/ui/card';\n" +
        'export function MenuSection() { return <Card>Nuestros panes</Card>; }\n',
    ],
    [
      'src/components/sections/MenuCategorySection.tsx',
      "import { Card } from '@/components/ui/card';\n" +
        'export function MenuCategorySection() { return <Card>Categoría</Card>; }\n',
    ],
    [
      'src/components/sections/HeroSection.tsx',
      'export function HeroSection() { return null; }\n',
    ],
    [
      'src/components/sections/ContactSection.tsx',
      'export function ContactSection() { return null; }\n',
    ],
    [
      'src/components/layout/Header.tsx',
      "import { Link } from 'react-router-dom';\n" +
        'export function Header() { return (<nav><Link to="/">Inicio</Link><Link to="/menu">Menú</Link></nav>); }\n',
    ],
    ['src/components/ui/card.tsx', 'export function Card() { return null; }\n'],
  ]);
}

/** Los 6 steps EXACTOS del incidente, en su orden y con sus dependencias. */
function incidentPlan() {
  return [
    { order: 1, action: 'modify', file_path: 'src/App.tsx', requires_steps: [] },
    { order: 2, action: 'modify', file_path: 'src/components/layout/Header.tsx', requires_steps: [] },
    { order: 3, action: 'modify', file_path: 'src/pages/Index.tsx', requires_steps: [] },
    { order: 4, action: 'delete', file_path: 'src/pages/Menu.tsx', requires_steps: [1, 2] },
    { order: 5, action: 'delete', file_path: 'src/components/sections/MenuCategorySection.tsx', requires_steps: [4] },
    { order: 6, action: 'delete', file_path: 'src/components/sections/MenuSection.tsx', requires_steps: [3] },
  ];
}

/**
 * Reproduce el recorrido del Implementer sobre los steps `delete`: mismo orden,
 * misma reducción de plannedDeletes al rechazar (un archivo que se queda vuelve
 * a contar como importador vivo).
 */
function runDeleteSteps(plan, originalFiles, deletionTargets) {
  const targets = expandDeletionTargets(deletionTargets, originalFiles);
  const planned = new Set(
    plan.filter((s) => s.action === 'delete').map((s) => s.file_path)
  );
  const deleted = [];
  const rejected = [];
  for (const step of [...plan].sort((a, b) => a.order - b.order)) {
    if (step.action !== 'delete') continue;
    const verdict = deleteVerdict({
      path: step.file_path,
      originalFiles,
      plannedDeletes: planned,
      deletionTargets: targets,
    });
    if (verdict.allowed) {
      deleted.push(step.file_path);
    } else {
      planned.delete(step.file_path);
      rejected.push({ path: step.file_path, reason: verdict.reason, importers: verdict.importers });
    }
  }
  return { deleted, rejected, targets };
}

// ---------------------------------------------------------------------------
// El caso real, entero
// ---------------------------------------------------------------------------

test('incidente Menú: la sección de la landing se rechaza, los otros dos deletes pasan', () => {
  const originalFiles = bakeryOriginalFiles();
  const { deleted, rejected } = runDeleteSteps(incidentPlan(), originalFiles, [
    'src/pages/Menu.tsx',
    'src/components/sections/MenuCategorySection.tsx',
  ]);

  assert.deepEqual(deleted, [
    'src/pages/Menu.tsx',
    'src/components/sections/MenuCategorySection.tsx',
  ]);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].path, 'src/components/sections/MenuSection.tsx');
  assert.equal(rejected[0].reason, NOT_TARGETED_STILL_IMPORTED);
  // El motivo se lee del ORIGINAL: Index.tsx lo importaba antes del intent, y el
  // modify del step 3 que lo desconecta no cambia el veredicto.
  assert.deepEqual(rejected[0].importers, ['src/pages/Index.tsx']);
});

test('la telemetría registra los targets EXPANDIDOS, no sólo la semilla', () => {
  // El log es lo único consultable por SQL, y auditar un delete exige ver la
  // autorización COMPLETA: con sólo la semilla, MenuCategorySection.tsx aparece
  // borrada sin que nada en la fila explique por qué, aunque el usuario nunca la
  // nombró. El sufijo lleva el conjunto que de verdad autorizó los borrados.
  const { targets } = runDeleteSteps(incidentPlan(), bakeryOriginalFiles(), [
    'src/pages/Menu.tsx',
  ]);
  assert.equal(
    deletionTargetsTelemetry(targets),
    ' [TARGETS:src/components/sections/MenuCategorySection.tsx,src/pages/Menu.tsx]'
  );
});

test('el descableado planificado no autoriza: MenuSection sigue rechazada aunque el modify ya corriera', () => {
  const originalFiles = bakeryOriginalFiles();
  // Mapa POST-plan: los 3 modifies ya se aplicaron, Index.tsx ya no importa
  // MenuSection. Es el mapa que aprobaba el guard anterior.
  const postPlan = new Map(originalFiles);
  postPlan.set(
    'src/pages/Index.tsx',
    "import { HeroSection } from '@/components/sections/HeroSection';\n" +
      "import { ContactSection } from '@/components/sections/ContactSection';\n" +
      'export default function Index() { return (<><HeroSection /><ContactSection /></>); }\n'
  );

  // Contra el post-plan, nadie lo importa: el delete pasaría.
  assert.equal(
    deleteVerdict({
      path: 'src/components/sections/MenuSection.tsx',
      originalFiles: postPlan,
      plannedDeletes: ['src/pages/Menu.tsx'],
      deletionTargets: [],
    }).allowed,
    true
  );
  // Contra el original, no.
  const verdict = deleteVerdict({
    path: 'src/components/sections/MenuSection.tsx',
    originalFiles,
    plannedDeletes: ['src/pages/Menu.tsx'],
    deletionTargets: [],
  });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, NOT_TARGETED_STILL_IMPORTED);
});

test('un target inventado sobre la sección de la landing NO la salva del guard', () => {
  // Capa 1 puede equivocarse; lo que no puede es inventarse la expansión. Un
  // target directo sí autoriza (es la petición del usuario), así que el hueco
  // que queda es exactamente ese y está registrado en telemetría: el test fija
  // que la expansión automática jamás lo produce sola.
  const targets = expandDeletionTargets(['src/pages/Menu.tsx'], bakeryOriginalFiles());
  assert.equal(targets.has('src/components/sections/MenuSection.tsx'), false);
});

// ---------------------------------------------------------------------------
// Expansión: huérfanas exclusivas PRE-plan, y sólo esas
// ---------------------------------------------------------------------------

test('expandDeletionTargets añade la huérfana exclusiva de la página, no la de la landing', () => {
  const targets = expandDeletionTargets(['src/pages/Menu.tsx'], bakeryOriginalFiles());
  assert.deepEqual([...targets].sort(), [
    'src/components/sections/MenuCategorySection.tsx',
    'src/pages/Menu.tsx',
  ]);
});

test('la expansión es transitiva: la sub-sección que sólo usa la huérfana también cae', () => {
  const files = bakeryOriginalFiles();
  files.set(
    'src/components/sections/MenuCategorySection.tsx',
    "import { MenuItemRow } from '@/components/sections/MenuItemRow';\n" +
      'export function MenuCategorySection() { return <MenuItemRow />; }\n'
  );
  files.set('src/components/sections/MenuItemRow.tsx', 'export function MenuItemRow() { return null; }\n');

  const targets = expandDeletionTargets(['src/pages/Menu.tsx'], files);
  assert.equal(targets.has('src/components/sections/MenuItemRow.tsx'), true);
});

test('la expansión no arrastra lo compartido: card.tsx lo usan las dos secciones', () => {
  const targets = expandDeletionTargets(['src/pages/Menu.tsx'], bakeryOriginalFiles());
  assert.equal(targets.has('src/components/ui/card.tsx'), false);
});

test('una semilla que no existe en el original no autoriza nada', () => {
  const targets = expandDeletionTargets(
    ['src/pages/Fantasma.tsx', '', '   '],
    bakeryOriginalFiles()
  );
  assert.equal(targets.size, 0);
});

// ---------------------------------------------------------------------------
// Degradación sin targets, y el resto del contrato
// ---------------------------------------------------------------------------

test('sin deletion_targets no se borra nada del incidente: el plan pierde su autorización', () => {
  const originalFiles = bakeryOriginalFiles();
  const { deleted, rejected } = runDeleteSteps(incidentPlan(), originalFiles, []);

  // Menu.tsx cae primero: App.tsx la importaba en el ORIGINAL y App.tsx
  // sobrevive; el modify del step 1 que quita la ruta ya no vale como permiso.
  // Al quedarse, deja de ser un delete planificado y vuelve a contar como
  // importador vivo, así que arrastra a MenuCategorySection consigo.
  assert.deepEqual(deleted, []);
  assert.deepEqual(rejected.map((r) => r.path), [
    'src/pages/Menu.tsx',
    'src/components/sections/MenuCategorySection.tsx',
    'src/components/sections/MenuSection.tsx',
  ]);
  assert.ok(rejected.every((r) => r.reason === NOT_TARGETED_STILL_IMPORTED));
  // El coste de no declarar targets son archivos muertos de más — inofensivos y
  // registrados en [DELETE_REJECTED:...] — nunca una página rota. Ese es el lado
  // seguro del trade-off, y es la razón por la que Capa 1 es obligatoria para
  // que una eliminación legítima llegue a ejecutarse.
});

test('un delete rechazado devuelve a su archivo la condición de importador vivo', () => {
  const files = new Map([
    ['src/pages/Index.tsx', "import { A } from '@/components/sections/A';\nexport default function Index() { return <A />; }\n"],
    ['src/components/sections/A.tsx', "import { B } from '@/components/sections/B';\nexport function A() { return <B />; }\n"],
    ['src/components/sections/B.tsx', 'export function B() { return null; }\n'],
  ]);
  const plan = [
    { order: 1, action: 'delete', file_path: 'src/components/sections/A.tsx', requires_steps: [] },
    { order: 2, action: 'delete', file_path: 'src/components/sections/B.tsx', requires_steps: [] },
  ];
  const { deleted, rejected } = runDeleteSteps(plan, files, []);

  // A se rechaza (Index.tsx la importa y sobrevive); al quedarse, sus imports
  // vuelven a contar, así que B tampoco puede irse.
  assert.deepEqual(deleted, []);
  assert.deepEqual(rejected.map((r) => r.path), [
    'src/components/sections/A.tsx',
    'src/components/sections/B.tsx',
  ]);
});

test('un archivo huérfano en el original se borra sin necesidad de target', () => {
  const files = new Map([
    ['src/pages/Index.tsx', 'export default function Index() { return null; }\n'],
    ['src/components/sections/Vieja.tsx', 'export function Vieja() { return null; }\n'],
  ]);
  const verdict = deleteVerdict({
    path: 'src/components/sections/Vieja.tsx',
    originalFiles: files,
    plannedDeletes: ['src/components/sections/Vieja.tsx'],
    deletionTargets: [],
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.targeted, false);
});

test('telemetría: [TARGETS:...] ordenado y deduplicado, vacío cuando no hay', () => {
  assert.equal(deletionTargetsTelemetry([]), '');
  assert.equal(deletionTargetsTelemetry(undefined), '');
  assert.equal(
    deletionTargetsTelemetry([
      'src/pages/Menu.tsx',
      'src/components/sections/MenuCategorySection.tsx',
      'src/pages/Menu.tsx',
    ]),
    ' [TARGETS:src/components/sections/MenuCategorySection.tsx,src/pages/Menu.tsx]'
  );
});
