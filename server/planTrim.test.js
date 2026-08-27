import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIM_MAX_STEPS,
  PROTECTED_TRIM_PATHS,
  isProtectedTrimPath,
  trimPlan,
  trimTelemetry,
  buildTrimWarning,
} from '../src/utils/planTrim.js';

// ---------------------------------------------------------------------------
// G-3 — CIRUGÍA DEL TRIM DEL ARCHITECT.
//
// EL AGUJERO (tres a la vez, en el mismo bloque de src/services/Architect.ts):
//
//  1. El corte era POR POSICIÓN DE ARRAY (`nonLayoutSteps.slice(0, room)`),
//     pero el orden de ejecución lo fija `order` y el sort por `order` vive
//     AGUAS ABAJO, en src/services/Implementer.ts. Con el array desordenado
//     —cosa que el contrato del plan no prohíbe— se caían steps tempranos y
//     sobrevivían tardíos.
//  2. El set protegido eran DOS archivos (Header, Footer) cuando la garantía
//     estructural del initial build (G-1) exige TRES (+ Index) y el router
//     `src/App.tsx` decide si las páginas creadas son alcanzables.
//  3. La telemetría moría en un `console.warn` y en un warning efímero cuyo
//     texto ("Only the first 6 were built") llevaba stale desde f5e99dc, que
//     subió el tope real a 8.
//
// ESTE ARCHIVO cubre el módulo puro (src/utils/planTrim.js). El cableado —los
// dos `logIntent` del plan lane y el warning de la respuesta— vive en el
// orquestador y aquí se documenta como frontera, igual que hace planGuard.test.js
// con su gate de initial build.
//
// NOTA SOBRE EL ANCLA INVERTIDA: no había tests previos que anclasen el
// comportamiento por posición (`grep -n trim server/*.test.js` sólo devolvía
// `.trim()` de strings), así que este archivo no reescribe ninguno — lo que
// documenta es que el criterio anclado a partir de ahora es `order`.
// ---------------------------------------------------------------------------

const HEADER = 'src/components/layout/Header.tsx';
const FOOTER = 'src/components/layout/Footer.tsx';
const INDEX = 'src/pages/Index.tsx';
const APP = 'src/App.tsx';

/** Step mínimo con la forma que emite el Architect. */
const step = (order, file_path, action = 'modify') => ({
  order,
  description: `does something to ${file_path}`,
  file_path,
  action,
  requires_steps: [],
});

/** Sección genérica número `n`, siempre recortable. */
const section = (order, n = order) =>
  step(order, `src/components/sections/Section${n}.tsx`, 'create');

// Null-safe a propósito: hay un caso que mete basura (null, strings, números)
// en el plan, y esos trozos pueden sobrevivir al recorte como cualquier otro
// step no protegido.
const paths = (result) =>
  result.steps.map((s) => (s !== null && typeof s === 'object' ? s.file_path : undefined));
const orders = (result) =>
  result.steps.map((s) => (s !== null && typeof s === 'object' ? s.order : undefined));

// --- El set protegido -------------------------------------------------------

test('G-3: el set protegido son CUATRO archivos, no dos', () => {
  assert.deepEqual([...PROTECTED_TRIM_PATHS], [HEADER, FOOTER, INDEX, APP]);
  for (const path of [HEADER, FOOTER, INDEX, APP]) {
    assert.equal(isProtectedTrimPath(path), true, `${path} debe estar protegido`);
  }
});

test('G-3: isProtectedTrimPath normaliza separadores y prefijos', () => {
  assert.equal(isProtectedTrimPath('src\\components\\layout\\Header.tsx'), true);
  assert.equal(isProtectedTrimPath('./src/pages/Index.tsx'), true);
  assert.equal(isProtectedTrimPath('  src/App.tsx  '), true);
});

test('G-3: isProtectedTrimPath no protege lo que no escribe el archivo real', () => {
  // La protección compra que el archivo SE ESCRIBA, y el Implementer lo abre
  // con `files.get(step.file_path)`. Un path que no es el del mapa no escribe
  // el header pase lo que pase: protegerlo sólo gastaría presupuesto.
  assert.equal(isProtectedTrimPath('src/components/sections/Header.tsx'), false);
  assert.equal(isProtectedTrimPath('src/pages/MyApp.tsx'), false);
  assert.equal(isProtectedTrimPath(''), false);
  assert.equal(isProtectedTrimPath(null), false);
  assert.equal(isProtectedTrimPath(undefined), false);
  assert.equal(isProtectedTrimPath(42), false);
});

// --- El corte es por `order`, no por posición -------------------------------

test('G-3: con la lista DESORDENADA cae el de `order` mayor, no el último del array', () => {
  // El array llega en un orden que no es el de ejecución: el step de mayor
  // `order` (9) está en la posición 1 y el de menor (1) en la última. El trim
  // anterior, que cortaba por posición, habría conservado el 9 y tirado el 1.
  const plan = [
    section(5),
    section(9),
    section(2),
    section(7),
    section(3),
    section(8),
    section(4),
    section(6),
    section(1),
  ];
  const result = trimPlan(plan);

  assert.equal(result.wasTrimmed, true);
  assert.equal(result.originalCount, 9);
  assert.equal(result.keptCount, TRIM_MAX_STEPS);
  // Sobreviven los 8 de menor `order`: 1..8. Cae el 9, que es el SEGUNDO del
  // array — la prueba de que el criterio ya no es la posición.
  assert.deepEqual(orders(result).slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(orders(result).includes(9), false, 'el de `order` mayor es el que cae');
});

test('G-3: la emisión conserva el orden ORIGINAL del array; sólo el corte usa `order`', () => {
  // Quien decide la ejecución es el sort del Implementer. Reordenar aquí sólo
  // cambiaría lo que se ve en `plan_steps` del log, sin cambiar nada real.
  const plan = [section(5), section(9), section(2), section(7), section(3), section(8), section(4), section(6), section(1)];
  assert.deepEqual(orders(trimPlan(plan)), [5, 2, 7, 3, 8, 4, 6, 1]);
});

test('G-3: empates de `order` desempatan por posición — sort estable', () => {
  const plan = [
    section(1, 'a'), section(1, 'b'), section(1, 'c'), section(1, 'd'),
    section(1, 'e'), section(1, 'f'), section(1, 'g'), section(1, 'h'),
    section(1, 'i'),
  ];
  const result = trimPlan(plan);
  assert.equal(result.keptCount, 8);
  // Con todos los `order` iguales, el desempate es el índice: cae el último.
  assert.deepEqual(
    paths(result).map((p) => p.slice(-5, -4)),
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  );
});

// --- Los protegidos sobreviven cualquier trim -------------------------------

test('G-3: los cuatro protegidos sobreviven aunque su `order` sea el más alto', () => {
  // Peor caso posible para un corte por `order`: el chrome va al final del plan
  // (que es donde el Architect lo suele poner) y hay secciones de sobra por
  // delante. Ninguno de los cuatro puede caer.
  const plan = [
    section(1), section(2), section(3), section(4), section(5), section(6),
    section(7), section(8), section(9), section(10),
    step(11, HEADER),
    step(12, FOOTER),
    step(13, INDEX),
    step(14, APP),
  ];
  const result = trimPlan(plan);

  assert.equal(result.wasTrimmed, true);
  assert.equal(result.originalCount, 14);
  for (const protectedPath of [HEADER, FOOTER, INDEX, APP]) {
    assert.ok(paths(result).includes(protectedPath), `${protectedPath} debe sobrevivir`);
  }
});

test('G-3: los protegidos NO cuentan como recortables — consumen el hueco antes de repartirlo', () => {
  // 4 protegidos + 6 secciones = 10 steps, tope 8. El hueco para recortables es
  // 8 - 4 = 4, así que sobreviven las 4 secciones de menor `order` (1..4) y
  // caen las dos de `order` 5 y 6. Si los protegidos hubieran competido por el
  // hueco, alguno habría caído.
  const plan = [
    step(1, HEADER), step(2, FOOTER), step(3, INDEX), step(4, APP),
    section(5), section(6), section(7), section(8), section(9), section(10),
  ];
  const result = trimPlan(plan);

  assert.equal(result.keptCount, TRIM_MAX_STEPS);
  assert.deepEqual(orders(result), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const protectedPath of [HEADER, FOOTER, INDEX, APP]) {
    assert.ok(paths(result).includes(protectedPath));
  }
});

test('G-3: si los protegidos superan el tope, la GARANTÍA gana al PRESUPUESTO', () => {
  // Misma doctrina que G-1 (planGuard acepta dejar el plan en 9 o 10 pasos con
  // tal de no perder el chrome): el tope es una heurística de coste, la
  // presencia de los protegidos es una garantía. Aquí el plan trae los cuatro
  // protegidos DUPLICADOS —9 protegidos sobre un tope de 8— y sobreviven todos.
  const plan = [
    step(1, HEADER), step(2, FOOTER), step(3, INDEX), step(4, APP),
    step(5, HEADER), step(6, FOOTER), step(7, INDEX), step(8, APP),
    step(9, APP),
    section(10), section(11),
  ];
  const result = trimPlan(plan);

  assert.equal(result.wasTrimmed, true);
  assert.equal(result.originalCount, 11);
  assert.equal(result.keptCount, 9, 'los 9 protegidos sobreviven, por encima del tope de 8');
  assert.ok(result.keptCount > TRIM_MAX_STEPS);
  assert.deepEqual(orders(result), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Cero hueco para recortables: las dos secciones caen enteras.
  assert.equal(paths(result).some((p) => p.includes('sections/')), false);
});

// --- Sin exceso, no-op byte-idéntico ---------------------------------------

test('G-3: sin exceso no hay recorte y el array sale por la MISMA referencia', () => {
  const plan = [
    section(1), section(2), section(3), section(4),
    step(5, HEADER), step(6, FOOTER), step(7, INDEX), step(8, APP),
  ];
  const result = trimPlan(plan);

  assert.equal(result.wasTrimmed, false);
  assert.equal(result.originalCount, 8);
  assert.equal(result.keptCount, 8);
  assert.equal(result.steps, plan, 'exactamente 8 steps: ni se copia ni se reordena');
});

test('G-3: un plan que cabe con el array desordenado tampoco se reordena', () => {
  const plan = [section(7), section(2), section(9)];
  const result = trimPlan(plan);
  assert.equal(result.steps, plan);
  assert.deepEqual(orders(result), [7, 2, 9]);
});

test('G-3: sin recorte, la marca de telemetría es la cadena VACÍA', () => {
  const plan = [section(1), section(2)];
  const { originalCount, keptCount } = trimPlan(plan);
  assert.equal(trimTelemetry(originalCount, keptCount), '');
  assert.equal(buildTrimWarning(originalCount, keptCount), '');
});

// --- La marca [TRIMMED:N→M] -------------------------------------------------

test('G-3: la marca es ` [TRIMMED:9→8]` con la gramática de sufijo establecida', () => {
  const plan = [
    section(1), section(2), section(3), section(4), section(5),
    section(6), section(7), section(8), section(9),
  ];
  const { originalCount, keptCount } = trimPlan(plan);
  const mark = trimTelemetry(originalCount, keptCount);

  assert.equal(mark, ' [TRIMMED:9→8]');
  // Misma gramática que [TARGETS:...] y [PLAN_REPAIRED:...]: espacio delante,
  // contenido entre corchetes, concatenable al user_prompt sin separador.
  assert.match(mark, /^ \[[A-Z_]+:[^\]]*\]$/);
  assert.equal(`prompt${mark}`, 'prompt [TRIMMED:9→8]');
});

test('G-3: la marca lleva los DOS conteos — 14→8 y 9→8 no son el mismo evento', () => {
  assert.equal(trimTelemetry(14, 8), ' [TRIMMED:14→8]');
  assert.equal(trimTelemetry(9, 8), ' [TRIMMED:9→8]');
  assert.notEqual(trimTelemetry(14, 8), trimTelemetry(9, 8));
});

test('G-3: la marca sobrevive al caso "protegidos por encima del tope"', () => {
  assert.equal(trimTelemetry(11, 9), ' [TRIMMED:11→9]');
});

// --- Determinismo -----------------------------------------------------------

test('G-3: mismo plan, mismo recorte y misma marca — sin estado entre llamadas', () => {
  const build = () => [
    section(5), step(11, FOOTER), section(9), section(2), step(10, HEADER),
    section(7), section(3), section(8), section(4), section(6), section(1),
  ];
  const a = trimPlan(build());
  const b = trimPlan(build());
  const c = trimPlan(build());

  assert.deepEqual(paths(a), paths(b));
  assert.deepEqual(paths(b), paths(c));
  assert.equal(trimTelemetry(a.originalCount, a.keptCount), trimTelemetry(c.originalCount, c.keptCount));
  assert.equal(buildTrimWarning(a.originalCount, a.keptCount), buildTrimWarning(c.originalCount, c.keptCount));
});

test('G-3: trimPlan no muta el plan de entrada', () => {
  const plan = [
    section(9), section(1), section(2), section(3), section(4),
    section(5), section(6), section(7), section(8),
  ];
  const before = plan.map((s) => s.order);
  trimPlan(plan);
  assert.equal(plan.length, 9);
  assert.deepEqual(plan.map((s) => s.order), before, 'ni recorta ni reordena el original');
});

// --- Basura: fail-closed ----------------------------------------------------

test('G-3: un plan que no es un array no recorta nada NI declara recorte', () => {
  for (const junk of [null, undefined, 'steps', 42, { steps: [] }]) {
    const result = trimPlan(junk);
    assert.deepEqual(result.steps, []);
    assert.equal(result.wasTrimmed, false);
    assert.equal(result.originalCount, 0);
    assert.equal(result.keptCount, 0);
    assert.equal(trimTelemetry(result.originalCount, result.keptCount), '');
  }
});

test('G-3: los steps con `order` ilegible son los PRIMEROS en caer', () => {
  // Fail-closed: un step sin `order` numérico es el menos fiable del plan (el
  // Implementer tampoco sabrá cuándo ejecutarlo). Ordena al final y se recorta
  // antes que cualquier step legible. Lo contrario —tratarlo como 0— lo pondría
  // a salvo por ser basura.
  const plan = [
    step('nope', 'src/components/sections/Junk1.tsx', 'create'),
    step(undefined, 'src/components/sections/Junk2.tsx', 'create'),
    step(NaN, 'src/components/sections/Junk3.tsx', 'create'),
    section(1), section(2), section(3), section(4), section(5), section(6),
  ];
  const result = trimPlan(plan);

  assert.equal(result.keptCount, TRIM_MAX_STEPS);
  assert.equal(paths(result).some((p) => p.includes('Junk')), true, 'sólo cae lo que sobra');
  // 9 steps, tope 8: cae exactamente uno, y es el ÚLTIMO de los ilegibles.
  assert.equal(paths(result).includes('src/components/sections/Junk3.tsx'), false);
  assert.equal(paths(result).includes('src/components/sections/Junk1.tsx'), true);
});

test('G-3: steps null/no-objeto no rompen el recorte y no se protegen solos', () => {
  const plan = [
    null, undefined, 'not a step', 7,
    section(1), section(2), section(3), section(4), section(5),
    step(6, HEADER),
  ];
  const result = trimPlan(plan);

  assert.equal(result.originalCount, 10);
  assert.equal(result.keptCount, TRIM_MAX_STEPS);
  assert.ok(paths(result).includes(HEADER), 'el protegido sobrevive entre la basura');
  // La basura tiene `order` ilegible, así que es lo primero que se cae: caen
  // dos de los cuatro trozos ilegibles y ningún step legible.
  for (const s of [1, 2, 3, 4, 5]) {
    assert.ok(orders(result).includes(s), `el step ${s} no debe caer por culpa de la basura`);
  }
});

test('G-3: conteos ilegibles no inventan una marca', () => {
  assert.equal(trimTelemetry(NaN, 8), '');
  assert.equal(trimTelemetry(9, NaN), '');
  assert.equal(trimTelemetry(undefined, undefined), '');
  assert.equal(trimTelemetry('nueve', 'ocho'), '');
  assert.equal(trimTelemetry(8, 9), '', 'M > N es imposible: no se marca');
  assert.equal(trimTelemetry(8, 8), '', 'sin recorte no hay marca');
  assert.equal(trimTelemetry(9, -1), '', 'un conteo negativo no es un recorte');
});

// --- El warning efímero deja de estar stale ---------------------------------

test('G-3: el warning dice el tope REAL y los conteos REALES', () => {
  const warning = buildTrimWarning(12, 8);

  assert.match(warning, /needed 12 steps/);
  assert.match(warning, /Only 8 were built/);
  assert.match(warning, new RegExp(`limit: ${TRIM_MAX_STEPS} steps`));
  // Lo que decía antes, fosilizado por partida doble: el tope real es 8 desde
  // f5e99dc, y el corte ya no es por posición ("the first").
  assert.equal(warning.includes('first 6'), false);
  assert.equal(warning.includes('the first'), false);
});

test('G-3: el warning no se contradice cuando los protegidos superan el tope', () => {
  // "Only 9 were built (limit: 8 steps per request)" sería incoherente para
  // quien lo lee: el mensaje explica por qué el tope cedió.
  const warning = buildTrimWarning(11, 9);
  assert.match(warning, /Only 9 were built/);
  assert.match(warning, /protected file/);
  assert.equal(warning.includes(`limit: ${TRIM_MAX_STEPS} steps per request`), false);
});

test('G-3: el tope del módulo es el que declara el prompt del Architect', () => {
  assert.equal(TRIM_MAX_STEPS, 8);
});
