import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_BUILD_REQUIRED_PATHS,
  normalizePlanPath,
  missingRequiredPaths,
  injectMissingSteps,
  planRepairedTelemetry,
  buildPlanRepairNote,
} from '../src/utils/planGuard.js';

// ---------------------------------------------------------------------------
// G-1 — GARANTÍA ESTRUCTURAL DEL CHROME EN EL INITIAL BUILD.
//
// EL AGUJERO: en el primer build el Architect a veces PLIEGA el header o el
// footer dentro de la descripción de otro step en vez de darles un step propio.
// El Implementer sólo abre `step.file_path`, así que esa mención no escribe
// nada: el proyecto sale con el navbar "App Name" del scaffold. El
// `initialBuildRule` prohíbe el plegado con ese texto exacto desde a246007
// ("Do NOT fold...") y f5e99dc ("must never be consolidated away"), ambos
// ANCESTROS de las regresiones observadas. La mitigación por prompt está
// medida como fallida.
//
// LA REPARACIÓN: un guard determinista fuera del modelo, con el mismo criterio
// que isUndeletablePath — la regla del prompt se queda, y debajo hay una red.
// Este archivo cubre el módulo puro; el gate por initial build vive en el
// orquestador y aquí se documenta como frontera, no se simula.
// ---------------------------------------------------------------------------

const HEADER = 'src/components/layout/Header.tsx';
const FOOTER = 'src/components/layout/Footer.tsx';
const INDEX = 'src/pages/Index.tsx';

/** Step mínimo con la forma que emite el Architect. */
const step = (order, file_path, action = 'modify') => ({
  order,
  description: `does something to ${file_path}`,
  file_path,
  action,
  requires_steps: [],
});

/** Plan de initial build completo: tres secciones + los tres obligatorios. */
const completePlan = () => [
  step(1, 'src/data/site.ts'),
  step(2, 'src/components/sections/HeroSection.tsx', 'create'),
  step(3, 'src/components/sections/PricingSection.tsx', 'create'),
  step(4, INDEX),
  step(5, HEADER),
  step(6, FOOTER),
];

// --- Detección --------------------------------------------------------------

test('G-1: plan completo no tiene faltantes', () => {
  assert.deepEqual(missingRequiredPaths(completePlan()), []);
});

test('G-1: plan completo sobrevive intacto — inyectar nada es un no-op', () => {
  const plan = completePlan();
  const before = JSON.stringify(plan);
  const after = injectMissingSteps(plan, missingRequiredPaths(plan));

  assert.deepEqual(after, plan);
  assert.equal(JSON.stringify(after), before);
  // No muta el original ni cambia su longitud.
  assert.equal(JSON.stringify(plan), before);
  assert.equal(after.length, plan.length);
  // Los steps previos son las MISMAS referencias, no copias.
  for (let i = 0; i < plan.length; i++) assert.equal(after[i], plan[i]);
});

test('G-1: falta 1 — el footer plegado en la descripción de otro step', () => {
  const plan = [
    step(1, 'src/components/sections/HeroSection.tsx', 'create'),
    step(2, INDEX),
    step(3, HEADER),
  ];
  // El plegado real: el footer se "menciona" y nadie lo escribe.
  plan[2].description = 'Header with the brand name, and footer updated to match';

  assert.deepEqual(missingRequiredPaths(plan), [FOOTER]);
});

test('G-1: faltan 2, en orden canónico', () => {
  const plan = [step(1, INDEX), step(2, 'src/components/sections/HeroSection.tsx', 'create')];
  assert.deepEqual(missingRequiredPaths(plan), [HEADER, FOOTER]);
});

test('G-1: faltan los 3, en orden canónico', () => {
  const plan = [
    step(1, 'src/components/sections/HeroSection.tsx', 'create'),
    step(2, 'src/components/sections/AboutSection.tsx', 'create'),
  ];
  assert.deepEqual(missingRequiredPaths(plan), [HEADER, FOOTER, INDEX]);
  // El orden reportado es el canónico del módulo, no el del plan.
  assert.deepEqual(missingRequiredPaths(plan), [...INITIAL_BUILD_REQUIRED_PATHS]);
});

test('G-1: el orden de los faltantes no depende del orden del plan', () => {
  const a = [step(1, FOOTER)];
  const b = [step(9, FOOTER)];
  assert.deepEqual(missingRequiredPaths(a), [HEADER, INDEX]);
  assert.deepEqual(missingRequiredPaths(b), [HEADER, INDEX]);
});

// --- Normalización ----------------------------------------------------------

test('G-1: la comparación normaliza separadores y prefijos', () => {
  assert.equal(normalizePlanPath('src\\components\\layout\\Header.tsx'), HEADER);
  assert.equal(normalizePlanPath('  ./src/pages/Index.tsx  '), INDEX);
  assert.equal(normalizePlanPath('/src/pages/Index.tsx'), INDEX);
  assert.equal(normalizePlanPath(''), '');
  assert.equal(normalizePlanPath(null), '');
  assert.equal(normalizePlanPath(undefined), '');

  const plan = [
    step(1, 'src\\components\\layout\\Header.tsx'),
    step(2, './src/components/layout/Footer.tsx'),
    step(3, '/src/pages/Index.tsx'),
  ];
  assert.deepEqual(missingRequiredPaths(plan), []);
});

test('G-1: un path parecido NO cuenta como el obligatorio', () => {
  const plan = [
    step(1, 'src/components/Header.tsx'),
    step(2, 'src/components/layout/FooterNav.tsx'),
    step(3, 'src/pages/index.tsx'),
  ];
  assert.deepEqual(missingRequiredPaths(plan), [HEADER, FOOTER, INDEX]);
});

test('G-1: la detección mira file_path, no action', () => {
  // Vigilar la acción es trabajo de isUndeletablePath, que ya cubre los tres.
  const plan = [step(1, HEADER, 'create'), step(2, FOOTER, 'delete'), step(3, INDEX, 'modify')];
  assert.deepEqual(missingRequiredPaths(plan), []);
});

// --- Inyección --------------------------------------------------------------

test('G-1: inyección con file_path exacto, action modify y descripción plana', () => {
  const plan = [step(1, 'src/components/sections/HeroSection.tsx', 'create')];
  const repaired = injectMissingSteps(plan, missingRequiredPaths(plan));

  assert.equal(repaired.length, 4);
  assert.deepEqual(repaired.slice(1).map((s) => s.file_path), [HEADER, FOOTER, INDEX]);

  for (const injected of repaired.slice(1)) {
    // Los tres archivos existen en el scaffold: nunca 'create'.
    assert.equal(injected.action, 'modify');
    assert.deepEqual(injected.requires_steps, []);
    assert.equal(typeof injected.description, 'string');
    assert.ok(injected.description.length > 0);
    // Contrato del system prompt del Architect: texto plano de una línea.
    assert.ok(!injected.description.includes('\n'));
    assert.ok(!injected.description.includes('\r'));
    assert.ok(!injected.description.includes('`'));
  }
});

test('G-1: order continúa desde el máximo y no colisiona', () => {
  const plan = [step(3, 'src/data/site.ts'), step(7, 'src/components/sections/HeroSection.tsx')];
  const repaired = injectMissingSteps(plan, missingRequiredPaths(plan));

  const orders = repaired.map((s) => s.order);
  assert.deepEqual(orders, [3, 7, 8, 9, 10]);
  assert.equal(new Set(orders).size, orders.length);
});

test('G-1: la inyección puede dejar el plan en 9 pasos, y es deliberado', () => {
  // El máximo de 8 del Architect es una heurística de coste; la presencia del
  // chrome es una garantía. El guard corre DESPUÉS del trim y no recorta nada.
  const plan = Array.from({ length: 8 }, (_, i) =>
    step(i + 1, `src/components/sections/S${i + 1}.tsx`, 'create')
  );
  const repaired = injectMissingSteps(plan, missingRequiredPaths(plan));

  assert.equal(repaired.length, 11);
  assert.deepEqual(repaired.slice(8).map((s) => s.order), [9, 10, 11]);
  // Ningún step preexistente se desplaza: el recorte tiene un dueño único.
  for (let i = 0; i < 8; i++) assert.equal(repaired[i], plan[i]);
});

test('G-1: nunca duplica un step que ya existe, aunque se le pida', () => {
  const plan = [step(1, HEADER), step(2, FOOTER)];
  // Lista desactualizada: pide los tres cuando sólo falta Index.
  const repaired = injectMissingSteps(plan, [HEADER, FOOTER, INDEX]);

  assert.equal(repaired.length, 3);
  assert.equal(repaired.filter((s) => s.file_path === HEADER).length, 1);
  assert.equal(repaired.filter((s) => s.file_path === FOOTER).length, 1);
  assert.equal(repaired.filter((s) => s.file_path === INDEX).length, 1);
});

test('G-1: idempotente — reparar un plan ya reparado no añade nada', () => {
  const plan = [step(1, 'src/components/sections/HeroSection.tsx', 'create')];
  const once = injectMissingSteps(plan, missingRequiredPaths(plan));
  const twice = injectMissingSteps(once, missingRequiredPaths(once));

  assert.deepEqual(missingRequiredPaths(once), []);
  assert.deepEqual(twice, once);
  assert.equal(twice.length, once.length);
});

test('G-1: un path fuera del set requerido no se inyecta', () => {
  const plan = completePlan();
  const repaired = injectMissingSteps(plan, ['src/components/sections/Inventada.tsx']);
  assert.deepEqual(repaired, plan);
});

// --- Fail-closed ------------------------------------------------------------

test('G-1: plan vacío o basura no revienta y falla cerrado', () => {
  // Fail-closed: lo que no se puede leer no cubre nada, así que falta todo.
  const all = [...INITIAL_BUILD_REQUIRED_PATHS];
  assert.deepEqual(missingRequiredPaths([]), all);
  assert.deepEqual(missingRequiredPaths(null), all);
  assert.deepEqual(missingRequiredPaths(undefined), all);
  assert.deepEqual(missingRequiredPaths('no soy un plan'), all);
  assert.deepEqual(missingRequiredPaths({ steps: [] }), all);
  assert.deepEqual(missingRequiredPaths([null, undefined, 42, 'x']), all);
  assert.deepEqual(missingRequiredPaths([{ file_path: null }, { file_path: '   ' }, {}]), all);
});

test('G-1: inyectar sobre un plan ilegible produce un plan legible', () => {
  const repaired = injectMissingSteps(null, INITIAL_BUILD_REQUIRED_PATHS);
  assert.equal(repaired.length, 3);
  // Sin orders legibles la numeración arranca en 1, como manda el contrato.
  assert.deepEqual(repaired.map((s) => s.order), [1, 2, 3]);
  assert.deepEqual(missingRequiredPaths(repaired), []);
});

test('G-1: orders no numéricos no rompen la numeración', () => {
  const plan = [
    { order: 'dos', description: 'x', file_path: 'src/a.tsx', action: 'create', requires_steps: [] },
    { order: NaN, description: 'x', file_path: 'src/b.tsx', action: 'create', requires_steps: [] },
    step(4, 'src/c.tsx'),
  ];
  const repaired = injectMissingSteps(plan, missingRequiredPaths(plan));
  assert.deepEqual(repaired.slice(3).map((s) => s.order), [5, 6, 7]);
});

test('G-1: missing vacío o basura es un no-op', () => {
  const plan = [step(1, HEADER)];
  assert.deepEqual(injectMissingSteps(plan, []), plan);
  assert.deepEqual(injectMissingSteps(plan, null), plan);
  assert.deepEqual(injectMissingSteps(plan, undefined), plan);
  assert.deepEqual(injectMissingSteps(plan, [null, 42, '']), plan);
});

// --- Determinismo -----------------------------------------------------------

test('G-1: mismo plan, mismo resultado', () => {
  const build = () => [
    step(2, 'src/data/site.ts'),
    step(5, 'src/components/sections/HeroSection.tsx', 'create'),
  ];
  const a = injectMissingSteps(build(), missingRequiredPaths(build()));
  const b = injectMissingSteps(build(), missingRequiredPaths(build()));
  assert.equal(JSON.stringify(a), JSON.stringify(b));

  // Y el orden de la lista de faltantes tampoco cambia el resultado.
  const c = injectMissingSteps(build(), [INDEX, FOOTER, HEADER]);
  assert.equal(JSON.stringify(c), JSON.stringify(a));
});

// --- Telemetría -------------------------------------------------------------

test('G-1: [PLAN_REPAIRED:...] ordenado y deduplicado, vacío cuando no hay', () => {
  // Misma gramática que [TARGETS:...]: espacio delante, contenido entre
  // corchetes, cadena vacía cuando no hubo nada que reparar.
  assert.equal(planRepairedTelemetry([]), '');
  assert.equal(planRepairedTelemetry(undefined), '');
  assert.equal(planRepairedTelemetry(null), '');
  assert.equal(
    planRepairedTelemetry([INDEX, HEADER, FOOTER, INDEX]),
    ' [PLAN_REPAIRED:src/components/layout/Footer.tsx,src/components/layout/Header.tsx,src/pages/Index.tsx]'
  );
  assert.equal(planRepairedTelemetry([FOOTER]), ` [PLAN_REPAIRED:${FOOTER}]`);
});

test('G-1: la marca respeta la forma del sufijo (espacio + corchetes)', () => {
  const mark = planRepairedTelemetry([HEADER]);
  assert.ok(mark.startsWith(' ['));
  assert.ok(mark.endsWith(']'));
  assert.ok(!mark.includes('\n'));
  // Concatenada al prompt, no lo altera.
  assert.equal('haz una landing' + mark, `haz una landing [PLAN_REPAIRED:${HEADER}]`);
});

// --- Nota del reintento -----------------------------------------------------

test('G-1: la nota del reintento nombra los paths ausentes', () => {
  const note = buildPlanRepairNote([HEADER, FOOTER]);
  assert.ok(note.includes(HEADER));
  assert.ok(note.includes(FOOTER));
  assert.ok(!note.includes(INDEX));
  assert.ok(note.includes('modify'));
  assert.equal(buildPlanRepairNote([]), '');
  assert.equal(buildPlanRepairNote(undefined), '');
});

test('G-1: la nota es determinista y deduplica', () => {
  assert.equal(buildPlanRepairNote([HEADER, HEADER]), buildPlanRepairNote([HEADER]));
});

// --- Frontera: fuera del initial build ---------------------------------------

test('G-1: fuera del initial build el módulo no interviene — el gate es del caller', () => {
  // El guard no conoce la señal de initial build: la pone el orquestador con
  // `isInitialBuild`. Este test fija la frontera — un plan de edición normal,
  // que legítimamente no toca el chrome, sólo queda intacto porque nadie
  // llama al guard. Aquí se comprueba que llamar SIN faltantes no altera nada,
  // que es la mitad del contrato que sí vive en este módulo.
  const editPlan = [step(1, 'src/components/sections/PricingSection.tsx')];
  const before = JSON.stringify(editPlan);

  // Nadie invoca injectMissingSteps fuera del initial build; si alguien lo
  // hiciera con lista vacía, sigue siendo un no-op.
  assert.deepEqual(injectMissingSteps(editPlan, []), editPlan);
  assert.equal(JSON.stringify(editPlan), before);
  assert.equal(planRepairedTelemetry([]), '');
});
