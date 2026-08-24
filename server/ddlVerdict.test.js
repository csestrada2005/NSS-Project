import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLIED,
  FAILED,
  UNVERIFIED,
  ddlVerdict,
  sanitizeReason,
} from '../src/utils/ddlVerdict.js';

// ---------------------------------------------------------------------------
// ddlVerdict — la etiqueta ES el diagnóstico.
//
// Nadie va a mirar la base para saber cómo acabó un DDL: van a consultar
// forge_intent_log. Si dos estados OPUESTOS comparten etiqueta, la consulta
// responde con seguridad algo falso — peor que no tener telemetría.
//
// La regla que estos tests congelan:
//   [DDL_FAILED:…]      no se aplicó, y lo sabemos (la base lo rechazó).
//   [DDL_UNVERIFIED:…]  pudo aplicarse; el instrumento no puede confirmarlo.
//   [DDL_APPLIED:…]     el diff del schema lo demuestra.
// ---------------------------------------------------------------------------

const SYNTAX = 'syntax error at or near "CREAT"';

test('diff con tablas y sin error → APPLIED', () => {
  const v = ddlVerdict(['orders'], null);
  assert.equal(v.verdict, APPLIED);
  assert.equal(v.outcome, 'success');
  assert.equal(v.reason, null);
  assert.equal(v.mark, ' [DDL_APPLIED:orders]');
});

test('el diff es la ÚNICA prueba de que algo se aplicó', () => {
  // Sin tablas no hay [DDL_APPLIED:] posible, pase lo que pase con el retorno.
  for (const err of [null, '', SYNTAX]) {
    assert.notEqual(ddlVerdict([], err).verdict, APPLIED);
  }
});

test('error de la base sin cambio de schema → FAILED, no UNVERIFIED', () => {
  // La base habló: sabemos que no se aplicó. Esto es lo que un SQL inválido a
  // propósito debe producir, y es lo que le da poder discriminante al
  // checkpoint C1.3.
  const v = ddlVerdict([], SYNTAX);
  assert.equal(v.verdict, FAILED);
  assert.equal(v.outcome, 'failed');
  assert.match(v.mark, /^ \[DDL_FAILED:error:/);
  assert.ok(!v.mark.includes('DDL_UNVERIFIED'));
});

test('ni cambio ni queja → UNVERIFIED, no FAILED', () => {
  // O era un no-op, o tocó RLS/índice/grant, que information_schema.columns no
  // mira. No podemos afirmar ninguna de las dos: no afirmamos ninguna.
  const v = ddlVerdict([], null);
  assert.equal(v.verdict, UNVERIFIED);
  assert.equal(v.mark, ' [DDL_UNVERIFIED:no_schema_change]');
  assert.ok(!v.mark.includes('DDL_FAILED'));
});

test('UNVERIFIED sigue siendo fail-closed: outcome="failed"', () => {
  // El sesgo NO cambia. Un falso negativo pide un reintento sobre DDL
  // mayormente idempotente; un falso positivo es el bug silencioso que esta
  // cirugía existe para matar. Lo único que cambia es que el log dice cuál de
  // los dos fallos es.
  assert.equal(ddlVerdict([], null).outcome, 'failed');
});

test('los dos fallos son distinguibles por SQL — que es el punto entero', () => {
  const rejected = ddlVerdict([], SYNTAX).mark;
  const invisible = ddlVerdict([], null).mark;
  assert.notEqual(rejected, invisible);
  // Un `where user_prompt like '%[DDL_FAILED:%'` no puede recoger el caso
  // no-verificable, y viceversa.
  assert.ok(rejected.includes('[DDL_FAILED:'));
  assert.ok(!rejected.includes('[DDL_UNVERIFIED:'));
  assert.ok(invisible.includes('[DDL_UNVERIFIED:'));
  assert.ok(!invisible.includes('[DDL_FAILED:'));
});

test('cambio de schema Y error → se dicen LAS DOS cosas', () => {
  // Por el camino actual (un solo POST, un solo `execute` en plpgsql, una sola
  // transacción) esto no debería poder darse. Si aparece, quedarse con
  // [DDL_APPLIED:] cantaría victoria sobre un estado que nadie ha comprobado.
  const v = ddlVerdict(['orders'], SYNTAX);
  assert.equal(v.verdict, APPLIED);
  assert.ok(v.mark.includes('[DDL_APPLIED:orders]'));
  assert.ok(v.mark.includes('[DDL_FAILED:partial:'));
});

test('varias tablas se listan en orden y sin repetir', () => {
  assert.equal(ddlVerdict(['orders', 'items', 'orders'], null).mark, ' [DDL_APPLIED:orders,items]');
});

test('R2: el outcome jamás sale del enum existente', () => {
  const inputs = [[[], null], [[], SYNTAX], [['t'], null], [['t'], SYNTAX]];
  for (const [tables, err] of inputs) {
    assert.ok(['success', 'failed'].includes(ddlVerdict(tables, err).outcome));
  }
});

test('toda marca respeta la gramática de sufijo ya establecida', () => {
  // Mismo patrón que [PARTIAL:...], [DELETE_REJECTED:...], [RESTORED:...] y
  // [DANGLING_REF:...]: espacio delante, contenido entre corchetes.
  for (const [tables, err] of [[[], null], [[], SYNTAX], [['t'], null], [['t'], SYNTAX]]) {
    assert.match(ddlVerdict(tables, err).mark, /^(?: \[[A-Z_]+:[^[\]]*\])+$/);
  }
});

test('un `]` en el error de Postgres no puede partir el sufijo', () => {
  // DETAIL/HINT de Postgres traen corchetes y saltos de línea; sin sanear,
  // cerrarían la marca antes de tiempo y toda consulta que parsee por
  // corchetes leería basura.
  const nasty = 'relation "t[0]" does not exist\nLINE 1: [detail]';
  const v = ddlVerdict([], nasty);
  const body = v.mark.slice(2, -1);
  assert.ok(!body.includes(']'), 'el cuerpo de la marca no puede contener ]');
  assert.ok(!body.includes('\n'), 'el cuerpo de la marca no puede contener saltos de línea');
  assert.match(v.mark, /^ \[DDL_FAILED:error:.+\]$/);
});

test('sanitizeReason recorta longitud y aguanta basura', () => {
  assert.equal(sanitizeReason(null), 'unknown');
  assert.equal(sanitizeReason(''), 'unknown');
  assert.equal(sanitizeReason('  hola   mundo  '), 'hola mundo');
  assert.ok(sanitizeReason('x'.repeat(500)).length <= 120);
  assert.ok(sanitizeReason('x'.repeat(500)).endsWith('...'));
});

test('entradas vacías o basura no revientan', () => {
  assert.equal(ddlVerdict(undefined, undefined).verdict, UNVERIFIED);
  assert.equal(ddlVerdict([null, '', 'orders'], undefined).mark, ' [DDL_APPLIED:orders]');
});

test('determinismo: mismas señales, mismo veredicto', () => {
  assert.deepEqual(ddlVerdict(['a'], SYNTAX), ddlVerdict(['a'], SYNTAX));
});
