import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIGRATION_INTENT_RISK,
  MIGRATION_INTENT_TYPE,
  buildMigrationIntentParams,
  describeIntentError,
  intentLogResult,
  withTelemetryFailure,
} from '../src/utils/migrationIntent.js';

// ---------------------------------------------------------------------------
// migrationIntent — la telemetría de un DDL aplicado NO puede perderse en
// silencio.
//
// EL INCIDENTE, EN LA CADENA COMPLETA
// -----------------------------------
//   MigrationRunner.close() no pasaba intentRisk
//   → logMigrationIntent lo tenía opcional
//   → logIntent enviaba `intent_risk: undefined`
//   → supabase-js OMITE las claves undefined al serializar
//   → intent_risk es text NOT NULL sin default
//   → PostgREST responde 400
//   → el try/catch de logIntent se lo tragaba.
// Resultado: DDL aplicado —lo único IRREVERSIBLE del sistema— y cero filas en
// forge_intent_log.
//
// POR QUÉ ESTOS TESTS MIRAN EL OBJETO Y NO UN MOCK DEL INSERT
// -----------------------------------------------------------
// Un insert mockeado acepta cualquier cosa, incluida una clave ausente: el bug
// pasaba por delante de él sin despeinarse. Lo que había que verificar es que
// la clave EXISTE en el payload construido, que es exactamente lo que se
// violaba. Por eso el payload se construye en una función pura y se asserta
// aquí sobre el objeto real.
// ---------------------------------------------------------------------------

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const BASE = {
  projectId: 'proj-1',
  prompt: 'Apply migration supabase/migrations/20260824000000_x.sql [DDL_APPLIED:users]',
  modifiedFiles: ['supabase/migrations/20260824000000_x.sql'],
  outcome: 'success',
  durationMs: 42,
};

test('el payload SIEMPRE lleva intent_risk, y su valor es "high"', () => {
  // El riesgo es DECLARADO, no clasificado: un DDL aplicado no se deshace, así
  // que tiene que salir en cualquier auditoría que filtre por riesgo.
  assert.equal(MIGRATION_INTENT_RISK, 'high');

  const shapes = [
    BASE,
    { ...BASE, outcome: 'failed', errorMessage: 'no_db', modifiedFiles: [] },
    // La forma MÍNIMA — la que el bug producía: sin modifiedFiles, sin
    // errorMessage y, antes, sin riesgo.
    { projectId: 'p', prompt: 'x', outcome: 'failed', durationMs: 0 },
  ];

  for (const shape of shapes) {
    const payload = buildMigrationIntentParams(shape);
    assert.ok(
      Object.prototype.hasOwnProperty.call(payload, 'intentRisk'),
      'la clave del riesgo debe EXISTIR en el payload: su ausencia es el bug'
    );
    assert.equal(payload.intentRisk, 'high');
    assert.notEqual(payload.intentRisk, undefined);
  }
});

test('el riesgo sobrevive a la serialización (undefined se pierde por el camino)', () => {
  // supabase-js serializa a JSON y JSON.stringify BORRA las claves undefined.
  // Un `intentRisk: undefined` habría pasado todas las aserciones de igualdad
  // laxas y aun así habría llegado a PostgREST sin la columna.
  const payload = buildMigrationIntentParams(BASE);
  const wire = JSON.parse(JSON.stringify(payload));
  assert.ok(
    Object.prototype.hasOwnProperty.call(wire, 'intentRisk'),
    'la clave debe seguir ahí DESPUÉS de serializar'
  );
  assert.equal(wire.intentRisk, 'high');
});

test('el intentType queda fijado a database_change y no lo pone el caller', () => {
  assert.equal(MIGRATION_INTENT_TYPE, 'database_change');
  const payload = buildMigrationIntentParams({ ...BASE, intentType: 'simple_edit', intentRisk: 'low' });
  assert.equal(payload.intentType, 'database_change');
  assert.equal(payload.intentRisk, 'high');
});

test('el resto del payload es el que el caller pidió, con defaults explícitos', () => {
  const payload = buildMigrationIntentParams(BASE);
  assert.equal(payload.projectId, 'proj-1');
  assert.equal(payload.prompt, BASE.prompt);
  assert.deepEqual(payload.modifiedFiles, BASE.modifiedFiles);
  assert.equal(payload.outcome, 'success');
  assert.equal(payload.errorMessage, null);
  assert.equal(payload.durationMs, 42);

  const minimal = buildMigrationIntentParams({ projectId: 'p', prompt: 'x', outcome: 'failed', durationMs: 0 });
  assert.deepEqual(minimal.modifiedFiles, []);
  assert.equal(minimal.errorMessage, null, 'null, no undefined: la columna es nullable, la clave no debe faltar');
});

test('insert fallido → el retorno lo dice; insert ok → limpio', () => {
  // supabase-js NO lanza cuando PostgREST rechaza: devuelve `{ error }`. Sin
  // mirar ese campo, un 400 es indistinguible de un éxito.
  assert.deepEqual(intentLogResult(null), { ok: true });
  assert.deepEqual(intentLogResult(undefined), { ok: true });
  assert.deepEqual(intentLogResult(''), { ok: true });

  const failed = intentLogResult({
    message: 'null value in column "intent_risk" violates not-null constraint',
    code: '23502',
    details: 'Failing row contains (...).',
  });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /intent_risk/);
  assert.match(failed.error, /23502/, 'el código de Postgres es lo que identifica el fallo');
});

test('describeIntentError devuelve el mensaje COMPLETO, sin recortar', () => {
  assert.equal(describeIntentError('boom'), 'boom');
  assert.equal(describeIntentError(new Error('kaput')), 'kaput');
  assert.equal(describeIntentError(null), 'unknown');
  assert.equal(describeIntentError({ nope: 1 }), '{"nope":1}');

  const long = 'x'.repeat(400);
  assert.equal(
    describeIntentError({ message: long }),
    long,
    'a consola va el mensaje entero; el recorte es cosa del sufijo del log'
  );
});

test('withTelemetryFailure anexa la marca y NO toca el outcome', () => {
  // Ni siquiera recibe el outcome: el apply y su registro son verdades
  // independientes. Degradar un apply real a 'failed' porque se perdiera su log
  // sería mentir sobre la base.
  assert.equal(withTelemetryFailure('no_db', { ok: true }), 'no_db');
  assert.equal(withTelemetryFailure(undefined, { ok: true }), undefined);

  const failed = { ok: false, error: 'null value in column "intent_risk" violates not-null constraint' };
  const marked = withTelemetryFailure('no_schema_change', failed);
  assert.match(marked, /^no_schema_change /, 'el reason original se conserva delante');
  assert.match(marked, /telemetry_failed:/);
  assert.match(marked, /intent_risk/);

  // Sin reason previo (un apply limpio), la marca va sola.
  assert.match(withTelemetryFailure(undefined, failed), /^telemetry_failed:/);
});

test('la marca cabe dentro de un sufijo [..] del log', () => {
  // sanitizeReason: sin corchetes (partirían la marca en dos) y acotada.
  const marked = withTelemetryFailure(undefined, {
    ok: false,
    error: `bad [thing]\nDETAIL: ${'y'.repeat(300)}`,
  });
  assert.ok(!marked.includes('['), 'un corchete rompería cualquier consulta que parsee la marca');
  assert.ok(!marked.includes(']'));
  assert.ok(!marked.includes('\n'));
  assert.ok(marked.length < 160);
});

test('logMigrationIntent ya no acepta intentRisk como parámetro', () => {
  // Si volviera a ser opcional, volvería a poder llegar undefined a una columna
  // NOT NULL — que es el bug entero.
  const src = fs.readFileSync(path.join(SRC, 'services', 'AIOrchestrator.ts'), 'utf8');
  const at = src.indexOf('static async logMigrationIntent(params: {');
  assert.ok(at > -1, 'logMigrationIntent debe seguir existiendo');
  const signature = src.slice(at, src.indexOf('}): Promise', at));
  assert.ok(
    !signature.includes('intentRisk'),
    'la firma no debe exponer intentRisk: lo fija migrationIntent.js'
  );
});

test('logIntent sigue mapeando intentRisk a la columna intent_risk', () => {
  // El puente entre el payload que se assertó arriba y la columna NOT NULL. Si
  // este mapeo cambiara de nombre, el payload seguiría siendo correcto y la
  // fila seguiría sin entrar.
  const src = fs.readFileSync(path.join(SRC, 'services', 'AIOrchestrator.ts'), 'utf8');
  assert.ok(src.includes('intent_risk: params.intentRisk'));
});

test('MigrationRunner propaga la señal de telemetría en TODOS sus cierres', () => {
  const src = fs.readFileSync(path.join(SRC, 'services', 'MigrationRunner.ts'), 'utf8');
  const closes = (src.match(/await close\(/g) ?? []).length;
  const propagations = (src.match(/withTelemetryFailure\(/g) ?? []).length;
  assert.ok(closes > 0, 'el runner debe seguir cerrando sus intentos');
  assert.equal(
    propagations,
    closes,
    `cada cierre debe propagar su señal: ${closes} cierres, ${propagations} propagaciones`
  );
  assert.ok(
    src.includes('console.error'),
    'un insert fallido tiene que salir por consola con su mensaje completo'
  );
});
