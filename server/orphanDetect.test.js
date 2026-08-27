import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORPHAN_SCOPE_PREFIX,
  createdComponentPaths,
  detectCreatedOrphans,
  orphanCreatedTelemetry,
} from '../src/utils/orphanDetect.js';
import { PROMPT_ROW_EXCLUDED_PREFIXES } from '../src/utils/importGraph.js';

// ---------------------------------------------------------------------------
// orphanDetect (G-2) — el huérfano DE CREACIÓN, medido y nada más.
//
// El incidente: instancia A (Flour & Stone, e279a8be). El plan creó un
// componente bajo src/components/ y el proyecto final no lo importaba desde
// ningún sitio. Compiló verde, persistió, el intent cerró en 'success' y ni el
// preview ni forge_intent_log dijeron nada: víctima-huérfana invisible por las
// dos vías. Estos tests fijan qué cuenta como huérfano y qué NO.
//
// FRONTERA: aquí no hay variante C (importado pero desactualizado) — ésa es de
// G-1. El criterio es topológico, nunca semántico.
// ---------------------------------------------------------------------------

/** Step del Architect tal y como llega post-trim. */
function step(order, file_path, action = 'create') {
  return { order, description: `${action} ${file_path}`, file_path, action, requires_steps: [] };
}

/**
 * Proyecto base: App monta Index, Index monta Hero. Nada más. Sirve de suelo
 * para colgar de él el archivo bajo prueba en cada caso.
 */
function baseProject() {
  return new Map([
    [
      'src/App.tsx',
      "import Index from './pages/Index';\n" +
        'export default function App() { return <Index />; }\n',
    ],
    [
      'src/pages/Index.tsx',
      "import Hero from '@/components/sections/Hero';\n" +
        'export default function Index() { return <Hero />; }\n',
    ],
    [
      'src/components/sections/Hero.tsx',
      'export default function Hero() { return <section>hero</section>; }\n',
    ],
  ]);
}

// --- El caso del incidente --------------------------------------------------

test('G-2: huérfano real — componente creado bajo src/components/ que nadie importa', () => {
  const files = baseProject();
  files.set(
    'src/components/sections/Testimonials.tsx',
    'export default function Testimonials() { return <section>t</section>; }\n'
  );
  const steps = [step(1, 'src/components/sections/Testimonials.tsx')];

  assert.deepEqual(detectCreatedOrphans(steps, files), [
    'src/components/sections/Testimonials.tsx',
  ]);
});

test('G-2: componente creado Y importado por un superviviente NO se marca', () => {
  const files = baseProject();
  files.set(
    'src/components/sections/Testimonials.tsx',
    'export default function Testimonials() { return <section>t</section>; }\n'
  );
  // Index pasa a montarlo: el archivo tiene un importador, deja de ser huérfano.
  files.set(
    'src/pages/Index.tsx',
    "import Hero from '@/components/sections/Hero';\n" +
      "import Testimonials from '@/components/sections/Testimonials';\n" +
      'export default function Index() { return <><Hero /><Testimonials /></>; }\n'
  );
  const steps = [
    step(1, 'src/components/sections/Testimonials.tsx'),
    step(2, 'src/pages/Index.tsx', 'modify'),
  ];

  assert.deepEqual(detectCreatedOrphans(steps, files), []);
  assert.equal(orphanCreatedTelemetry(detectCreatedOrphans(steps, files)), '');
});

test('G-2: un solo importador basta — el criterio es topológico, no semántico', () => {
  // Variante C (alcanzable pero desactualizado) es de G-1: aquí no aparece por
  // muy viejo que sea el contenido, porque alguien lo importa.
  const files = baseProject();
  files.set('src/components/sections/Stale.tsx', 'export default function Stale() { return null; }\n');
  files.set(
    'src/pages/Index.tsx',
    "import Stale from '@/components/sections/Stale';\n" +
      'export default function Index() { return <Stale />; }\n'
  );
  assert.deepEqual(detectCreatedOrphans([step(1, 'src/components/sections/Stale.tsx')], files), []);
});

// --- El scope: src/components/ y sólo src/components/ -----------------------

test('G-2: un create FUERA de src/components/ se ignora aunque nadie lo importe', () => {
  const files = baseProject();
  files.set('src/pages/About.tsx', 'export default function About() { return null; }\n');
  files.set('src/utils/format.ts', 'export const fmt = (s) => s;\n');
  files.set('src/hooks/useThing.ts', 'export function useThing() { return 1; }\n');

  const steps = [
    step(1, 'src/pages/About.tsx'),
    step(2, 'src/utils/format.ts'),
    step(3, 'src/hooks/useThing.ts'),
  ];
  // Ninguno lo importa nadie, y aun así ninguno es un hallazgo: fuera del árbol
  // de componentes "sin importadores" es un estado normal (la página la monta el
  // router, el util es el borde de un flujo).
  assert.deepEqual(detectCreatedOrphans(steps, files), []);
  assert.equal(ORPHAN_SCOPE_PREFIX, 'src/components/');
});

test('G-2: src/components/ui/ y src/lib/ excluidos — mismas exclusiones que el bloque de prompt', () => {
  const files = baseProject();
  files.set('src/components/ui/button.tsx', 'export const Button = () => null;\n');
  files.set('src/lib/utils.ts', 'export const cn = (...a) => a.join(" ");\n');

  const steps = [step(1, 'src/components/ui/button.tsx'), step(2, 'src/lib/utils.ts')];
  assert.deepEqual(detectCreatedOrphans(steps, files), []);

  // La lista no es una copia literal: es la MISMA constante que filtra las filas
  // del bloque del Architect, así que no pueden desincronizarse.
  assert.deepEqual(PROMPT_ROW_EXCLUDED_PREFIXES, ['src/components/ui/', 'src/lib/']);
  assert.deepEqual(createdComponentPaths([step(1, 'src/components/ui/card.tsx')]), []);
});

// --- La acción: sólo 'create' ----------------------------------------------

test('G-2: `modify` JAMÁS cuenta, ni sobre un archivo sin importadores', () => {
  const files = baseProject();
  // Huérfano PREEXISTENTE: ya vivía descolgado antes de este intent.
  files.set('src/components/sections/Legacy.tsx', 'export default function Legacy() { return null; }\n');

  assert.deepEqual(detectCreatedOrphans([step(1, 'src/components/sections/Legacy.tsx', 'modify')], files), []);
  // El mismo path con action 'create' sí es hallazgo: la diferencia es la acción.
  assert.deepEqual(detectCreatedOrphans([step(1, 'src/components/sections/Legacy.tsx', 'create')], files), [
    'src/components/sections/Legacy.tsx',
  ]);
});

test('G-2: `delete` tampoco cuenta', () => {
  const files = baseProject();
  files.set('src/components/sections/Gone.tsx', 'export default function Gone() { return null; }\n');
  assert.deepEqual(detectCreatedOrphans([step(1, 'src/components/sections/Gone.tsx', 'delete')], files), []);
});

// --- Presencia en el mapa final --------------------------------------------

test('G-2: creado pero AUSENTE del mapa final (borrado por el camino) no marca', () => {
  const files = baseProject();
  // El step lo creó; un delete posterior del plan, o el barrido, lo dejó fuera.
  // Un archivo que no está no es un huérfano: es un archivo que no está.
  const steps = [
    step(1, 'src/components/sections/Ephemeral.tsx'),
    step(2, 'src/components/sections/Ephemeral.tsx', 'delete'),
  ];
  assert.equal(files.has('src/components/sections/Ephemeral.tsx'), false);
  assert.deepEqual(detectCreatedOrphans(steps, files), []);
});

// --- Sin hallazgos ----------------------------------------------------------

test('G-2: sin hallazgos → cadena vacía (plan vacío, sin creates, proyecto limpio)', () => {
  assert.equal(orphanCreatedTelemetry(detectCreatedOrphans([], baseProject())), '');
  assert.equal(
    orphanCreatedTelemetry(detectCreatedOrphans([step(1, 'src/pages/Index.tsx', 'modify')], baseProject())),
    ''
  );
  assert.equal(orphanCreatedTelemetry([]), '');
});

// --- La gramática del sufijo ------------------------------------------------

test('G-2: la marca calca [TARGETS:...] — ordenada, deduplicada, contra el regex', () => {
  const mark = orphanCreatedTelemetry([
    'src/components/sections/Testimonials.tsx',
    'src/components/sections/About.tsx',
    'src/components/sections/Testimonials.tsx',
  ]);

  assert.equal(
    mark,
    ' [ORPHAN_CREATED:src/components/sections/About.tsx,src/components/sections/Testimonials.tsx]'
  );
  // Misma gramática que [TARGETS:...], [PLAN_REPAIRED:...] y [TRIMMED:...]:
  // espacio delante, contenido entre corchetes, concatenable sin separador.
  assert.match(mark, /^ \[[A-Z_]+:[^\]]*\]$/);
  assert.equal(`prompt${mark}`, `prompt${mark}`);
  assert.equal(`prompt${mark}`.startsWith('prompt ['), true);
});

test('G-2: dos huérfanos del mismo plan salen ordenados en una sola marca', () => {
  const files = baseProject();
  files.set('src/components/sections/Zeta.tsx', 'export default function Zeta() { return null; }\n');
  files.set('src/components/sections/Alpha.tsx', 'export default function Alpha() { return null; }\n');
  const steps = [step(1, 'src/components/sections/Zeta.tsx'), step(2, 'src/components/sections/Alpha.tsx')];

  assert.deepEqual(detectCreatedOrphans(steps, files), [
    'src/components/sections/Alpha.tsx',
    'src/components/sections/Zeta.tsx',
  ]);
  assert.equal(
    orphanCreatedTelemetry(detectCreatedOrphans(steps, files)),
    ' [ORPHAN_CREATED:src/components/sections/Alpha.tsx,src/components/sections/Zeta.tsx]'
  );
});

// --- Determinismo -----------------------------------------------------------

test('G-2: mismo plan y mismo mapa, misma marca — sin estado entre llamadas', () => {
  const build = () => {
    const files = baseProject();
    files.set('src/components/sections/Zeta.tsx', 'export default function Zeta() { return null; }\n');
    files.set('src/components/sections/Alpha.tsx', 'export default function Alpha() { return null; }\n');
    return files;
  };
  const steps = () => [
    step(2, 'src/components/sections/Alpha.tsx'),
    step(1, 'src/components/sections/Zeta.tsx'),
  ];

  const a = orphanCreatedTelemetry(detectCreatedOrphans(steps(), build()));
  const b = orphanCreatedTelemetry(detectCreatedOrphans(steps(), build()));
  assert.equal(a, b);
  // El orden de los steps no altera el resultado: la marca ordena por path.
  const reversed = orphanCreatedTelemetry(
    detectCreatedOrphans([...steps()].reverse(), build())
  );
  assert.equal(a, reversed);
});

test('G-2: el mapa final acepta objeto plano igual que Map (misma política que importGraph)', () => {
  const plain = {
    'src/App.tsx': "import Index from './pages/Index';\n",
    'src/pages/Index.tsx': 'export default function Index() { return null; }\n',
    'src/components/sections/Orphan.tsx': 'export default function Orphan() { return null; }\n',
  };
  assert.deepEqual(detectCreatedOrphans([step(1, 'src/components/sections/Orphan.tsx')], plain), [
    'src/components/sections/Orphan.tsx',
  ]);
});

// --- Basura → fail-closed ---------------------------------------------------

test('G-2: basura en los steps no marca y no lanza', () => {
  const files = baseProject();
  files.set('src/components/sections/Real.tsx', 'export default function Real() { return null; }\n');

  for (const garbage of [null, undefined, 'plan', 42, {}, [null], [42], [{}], [{ action: 'create' }]]) {
    assert.deepEqual(detectCreatedOrphans(garbage, files), [], `steps=${JSON.stringify(garbage)}`);
  }
  // Un file_path ilegible dentro de un step por lo demás válido tampoco marca.
  for (const bad of [null, undefined, '', '   ', 42, {}]) {
    assert.deepEqual(
      detectCreatedOrphans([{ order: 1, action: 'create', file_path: bad }], files),
      []
    );
  }
  // Una acción que no es exactamente 'create' no cuenta (ni 'CREATE', ni 'created').
  for (const action of ['CREATE', 'Create', 'created', '', null, undefined, 1]) {
    assert.deepEqual(
      detectCreatedOrphans([{ order: 1, action, file_path: 'src/components/sections/Real.tsx' }], files),
      []
    );
  }
});

test('G-2: basura en el mapa final no marca y no lanza', () => {
  const steps = [step(1, 'src/components/sections/Real.tsx')];
  for (const garbage of [null, undefined, 'files', 42, [], {}]) {
    assert.deepEqual(detectCreatedOrphans(steps, garbage), [], `files=${JSON.stringify(garbage)}`);
  }
  // Contenido no-string en un path escaneable: importGraph lo ignora, no revienta.
  assert.deepEqual(
    detectCreatedOrphans(steps, {
      'src/components/sections/Real.tsx': 'export default function Real() { return null; }\n',
      'src/App.tsx': null,
    }),
    ['src/components/sections/Real.tsx']
  );
});

test('G-2: basura en la marca no lanza y no deja rastro', () => {
  for (const garbage of [null, undefined, 42, {}, { a: 1 }]) {
    assert.equal(orphanCreatedTelemetry(garbage), '', `paths=${JSON.stringify(garbage)}`);
  }
  // Entradas no-string dentro de un iterable válido se descartan.
  assert.equal(orphanCreatedTelemetry([null, '', 42, {}]), '');
  assert.equal(orphanCreatedTelemetry(['a', null, 'b']), ' [ORPHAN_CREATED:a,b]');
});

// --- Normalización del path del step ---------------------------------------

test('G-2: el path del step se normaliza antes de comparar (./ y \\ como en planGuard)', () => {
  const files = baseProject();
  files.set('src/components/sections/Norm.tsx', 'export default function Norm() { return null; }\n');

  assert.deepEqual(createdComponentPaths([step(1, './src/components/sections/Norm.tsx')]), [
    'src/components/sections/Norm.tsx',
  ]);
  assert.deepEqual(detectCreatedOrphans([step(1, 'src\\components\\sections\\Norm.tsx')], files), [
    'src/components/sections/Norm.tsx',
  ]);
  // Y el mismo path repetido en dos steps aparece una sola vez.
  assert.deepEqual(
    detectCreatedOrphans(
      [step(1, 'src/components/sections/Norm.tsx'), step(2, './src/components/sections/Norm.tsx')],
      files
    ),
    ['src/components/sections/Norm.tsx']
  );
});
