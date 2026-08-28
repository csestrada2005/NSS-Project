import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATED_ACTION, planRejectedTelemetry, shouldGatePlan } from '../src/utils/planGate.js';

// ---------------------------------------------------------------------------
// planGate — parar el plan es fricción, no es el control de borrados.
//
// QUÉ FIJAN ESTOS TESTS
// ---------------------
// Dos reglas que se comportan de manera OPUESTA ante una entrada ilegible, y
// que por eso son fáciles de fundir en un solo `if` equivocado:
//
//   - El plan con un delete gatea porque en el plan SE LEE un delete. Si el
//     plan no se puede leer, no hay evidencia de nada, y el gate no se inventa
//     una pausa: quien decide si ese borrado puede ejecutarse es
//     src/utils/deletionGuard.js, que corre pase lo que pase. Un gate que
//     parase ante cada respuesta malformada del modelo convertiría el ruido en
//     una pregunta que el usuario no puede contestar.
//
//   - El toggle gatea porque el usuario lo pidió, y esa petición no depende de
//     que el plan sea legible. Plan vacío, plan basura, plan inofensivo: para
//     igual. Dejarlo caer porque el plan salió raro sería ejecutar sin permiso
//     justo en el turno en que se pidió permiso.
//
// Y el sufijo: ' [PLAN_REJECTED]' EXACTO. Es una marca que se lee a ojo en el
// `user_prompt` de forge_intent_log y que consultas posteriores buscan por
// literal; el espacio de delante y la ausencia de payload son parte del
// contrato, no cosmética. El plan rechazado viaja en la columna plan_steps del
// mismo log, así que duplicarlo en el sufijo sólo crearía dos verdades.
// ---------------------------------------------------------------------------

/** Step con la forma que mira el gate; el resto de campos no le importan. */
const step = (over = {}) => ({ order: 1, action: 'create', file_path: 'src/pages/Index.tsx', ...over });

const deleteStep = (over = {}) => step({ action: 'delete', file_path: 'src/pages/Old.tsx', ...over });

// --- (1) el plan con delete gatea -----------------------------------------

test('un plan con un solo step delete gatea', () => {
  assert.equal(shouldGatePlan([deleteStep()], false), true);
});

test('gatea aunque el delete esté enterrado entre steps inofensivos', () => {
  const plan = [step({ order: 1 }), step({ order: 2 }), deleteStep({ order: 3 }), step({ order: 4 })];
  assert.equal(shouldGatePlan(plan, false), true);
});

test('gatea con varios deletes igual que con uno (el gate no cuenta, decide)', () => {
  assert.equal(shouldGatePlan([deleteStep(), deleteStep({ file_path: 'src/pages/Other.tsx' })], false), true);
});

test('la action que gatea es exactamente GATED_ACTION', () => {
  assert.equal(GATED_ACTION, 'delete');
  assert.equal(shouldGatePlan([step({ action: GATED_ACTION })], false), true);
});

// --- (2) el plan sin delete no gatea --------------------------------------

test('un plan de creates y modifies no gatea', () => {
  const plan = [step({ action: 'create' }), step({ action: 'modify' }), step({ action: 'update' })];
  assert.equal(shouldGatePlan(plan, false), false);
});

test('un plan vacío no gatea sin toggle', () => {
  assert.equal(shouldGatePlan([], false), false);
});

test('actions parecidas a delete NO gatean: la comparación es exacta', () => {
  // Si esto cambiase a includes/endsWith, un futuro 'undelete' o 'soft_delete'
  // heredaría la pausa sin que nadie lo hubiera decidido.
  for (const action of ['undelete', 'soft_delete', 'delete_file', 'DELETE', 'Delete', ' delete']) {
    assert.equal(shouldGatePlan([step({ action })], false), false, action);
  }
});

// --- (3) el toggle gatea cualquier plan -----------------------------------

test('el toggle gatea el plan vacío', () => {
  assert.equal(shouldGatePlan([], true), true);
});

test('el toggle gatea un plan inofensivo', () => {
  assert.equal(shouldGatePlan([step(), step({ order: 2 })], true), true);
});

test('el toggle gatea aunque el plan sea basura ilegible', () => {
  // La petición del usuario no depende de que sepamos leer el plan.
  for (const plan of [undefined, null, 'plan', 42, {}, [null], [undefined], [{}], [[]]]) {
    assert.equal(shouldGatePlan(plan, true), true, JSON.stringify(plan) ?? String(plan));
  }
});

test('el toggle gatea también cuando el plan ya gatearía por sí mismo', () => {
  assert.equal(shouldGatePlan([deleteStep()], true), true);
});

test('sólo el booleano true activa el toggle, no cualquier valor truthy', () => {
  // `planModeEnabled` llega de estado de UI y de payloads: 'false' es una
  // cadena truthy, y gatear por ella pararía todos los turnos de alguien que
  // tiene el modo APAGADO.
  for (const toggle of ['false', 'true', 1, {}, [], 'on']) {
    assert.equal(shouldGatePlan([step()], toggle), false, JSON.stringify(toggle) ?? String(toggle));
  }
});

test('los valores falsy del toggle dejan decidir al plan', () => {
  for (const toggle of [false, undefined, null, 0, '']) {
    assert.equal(shouldGatePlan([step()], toggle), false, String(toggle));
    assert.equal(shouldGatePlan([deleteStep()], toggle), true, String(toggle));
  }
});

// --- (4) basura sin toggle no gatea (fail-closed hacia NO parar) ----------

test('un plan que no es array no gatea sin toggle', () => {
  for (const plan of [undefined, null, 'delete', 42, true, {}, { action: 'delete' }, new Set([deleteStep()])]) {
    assert.equal(shouldGatePlan(plan, false), false, String(plan));
  }
});

test('steps sin action legible no gatean', () => {
  const plan = [null, undefined, 42, 'delete', [], {}, { action: null }, { action: undefined }];
  assert.equal(shouldGatePlan(plan, false), false);
});

test('una cadena "delete" suelta dentro del array no es un step delete', () => {
  assert.equal(shouldGatePlan(['delete'], false), false);
});

test('la basura no tapa un delete real que sí está en el plan', () => {
  assert.equal(shouldGatePlan([null, 'ruido', deleteStep(), {}], false), true);
});

test('el gate no lee el file_path: un delete sin path sigue gateando', () => {
  // El gate decide si se enseña el plan; qué paths pueden borrarse es asunto
  // de deletionGuard.js.
  assert.equal(shouldGatePlan([{ action: 'delete' }], false), true);
});

// --- (5) el sufijo de telemetría ------------------------------------------

test('planRejectedTelemetry devuelve exactamente " [PLAN_REJECTED]"', () => {
  assert.equal(planRejectedTelemetry(), ' [PLAN_REJECTED]');
});

test('el sufijo respeta la gramática de trimTelemetry y deletionTargetsTelemetry', () => {
  const suffix = planRejectedTelemetry();
  assert.equal(suffix.startsWith(' ['), true, 'espacio delante y corchete de apertura');
  assert.equal(suffix.endsWith(']'), true, 'corchete de cierre');
  assert.equal(suffix.includes(':'), false, 'sin payload: el plan viaja en plan_steps');
  assert.equal(suffix.slice(2, -1), 'PLAN_REJECTED');
});

test('el sufijo concatena limpio sobre un user_prompt', () => {
  assert.equal(`añade una landing${planRejectedTelemetry()}`, 'añade una landing [PLAN_REJECTED]');
});

// --- (6) determinismo ------------------------------------------------------

test('misma entrada → misma salida (el gate no tiene estado)', () => {
  const cases = [
    [[deleteStep()], false],
    [[step()], false],
    [[], true],
    [null, false],
    [null, true],
    [[null, {}, 'x'], false],
  ];
  for (const [steps, toggle] of cases) {
    const first = shouldGatePlan(steps, toggle);
    for (let i = 0; i < 20; i += 1) {
      assert.equal(shouldGatePlan(steps, toggle), first, JSON.stringify([steps, toggle]));
    }
  }
});

test('el gate no muta el plan que recibe', () => {
  const plan = [step({ order: 1 }), deleteStep({ order: 2 })];
  const before = JSON.stringify(plan);
  shouldGatePlan(plan, false);
  shouldGatePlan(plan, true);
  assert.equal(JSON.stringify(plan), before);
  assert.equal(plan.length, 2);
});

test('el sufijo es estable entre llamadas', () => {
  assert.equal(planRejectedTelemetry(), planRejectedTelemetry());
});
