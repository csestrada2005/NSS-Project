import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLogFetch, extractTypeErrorsFromBuildLog, fetchVercelTypeErrors, parseEventsBody } from './vercelBuildLog.js';

// Log real de Vercel que pegó Samuel (2026-09-30), como lo entrega la API:
// un evento por línea, texto en payload.text (o en text, la otra forma).
const REAL = [
  'Running "npm run build"',
  '> tsc -b && vite build',
  'src/components/sections/CommentsSection.tsx(99,15): error TS2554: Expected 2 arguments, but got 1.',
  'src/components/sections/ProfileUploadSection.tsx(69,19): error TS2345: Argument of type \'{ url: string | null; error: string | null; }\' is not assignable to parameter of type \'SetStateAction<string | null>\'.',
  "src/lib/aiChat.ts(64,10): error TS2352: Conversion of type 'ImportMeta' to type 'Record<string, unknown>' may be a mistake.",
  "  Type 'ImportMeta' is not comparable to type 'Record<string, unknown>'.",
  "    Index signature for type 'string' is missing in type 'ImportMeta'.",
  'Error: Command "npm run build" exited with 2',
];

test('extrae los errores de tsc del log real, con su detalle indentado', () => {
  const events = REAL.map((text, i) => (i % 2 ? { type: 'stderr', payload: { text } } : { type: 'stdout', text }));
  const errors = extractTypeErrorsFromBuildLog(events);
  assert.deepEqual(errors.map((e) => `${e.file}:${e.line}:TS${e.code}`), [
    'src/components/sections/CommentsSection.tsx:99:TS2554',
    'src/components/sections/ProfileUploadSection.tsx:69:TS2345',
    'src/lib/aiChat.ts:64:TS2352',
  ]);
  assert.equal(errors[2].message.split('\n').length, 3, 'las dos líneas de detalle se suman al error');
  assert.equal(errors[1].column, 19);
});

test('tolera la hora delante (formato del panel de Vercel) y rutas absolutas del builder', () => {
  const text = [
    '15:50:16.217 /vercel/path1/src/pages/AdminPanel.tsx(170,17): error TS2322: Type X is not assignable.',
    "15:50:16.219   Property 'onCancel' does not exist on type 'Y'.",
  ].join('\n');
  const [e] = extractTypeErrorsFromBuildLog([{ payload: { text } }]);
  assert.equal(e.file, 'src/pages/AdminPanel.tsx');
  assert.match(e.message, /onCancel/);
});

test('un build que falla por otra cosa no inventa errores de tipos', () => {
  const events = [{ text: 'npm ERR! code ERESOLVE' }, { text: 'Error: Command "npm install" exited with 1' }];
  assert.deepEqual(extractTypeErrorsFromBuildLog(events), []);
  assert.deepEqual(extractTypeErrorsFromBuildLog(null), []);
  assert.deepEqual(extractTypeErrorsFromBuildLog([null, 5, { payload: {} }]), []);
});

// Check de Samuel (2026-09-30): el panel mostraba los errores, pero Wyrd dio
// el mensaje genérico. Defensas para las formas en que la API puede entregarlos.
const SAMUEL = [
  "src/components/layout/Header.tsx(6,1): error TS6133: 'cn' is declared but its value is never read.",
  "src/components/sections/WhyUsSection.tsx(89,23): error TS2322: Type '{ className: string; }' is not assignable.",
  "  Property 'style' does not exist on type 'IntrinsicAttributes'.",
];

test('quita los códigos de color de terminal', () => {
  const [e] = extractTypeErrorsFromBuildLog([{ type: 'stderr', text: '\x1b[96msrc/components/layout/Header.tsx\x1b[0m(6,1): \x1b[91merror\x1b[0m TS6133: x' }]);
  assert.deepEqual([e.file, e.line, e.code], ['src/components/layout/Header.tsx', 6, 6133]);
});

test('acepta el formato "pretty" de tsc, con y sin color', () => {
  for (const text of ['src/A.tsx:6:1 - error TS6133: x', '\x1b[96msrc/A.tsx\x1b[0m:\x1b[93m6\x1b[0m:\x1b[93m1\x1b[0m - \x1b[91merror\x1b[0m\x1b[90m TS6133: \x1b[0mx']) {
    const [p] = extractTypeErrorsFromBuildLog([{ text }]);
    assert.deepEqual([p.file, p.line, p.column, p.code, p.message], ['src/A.tsx', 6, 1, 6133, 'x']);
  }
});

test('lee la respuesta como lista JSON, como objeto envoltorio y como stream (un JSON por línea)', () => {
  const events = SAMUEL.map((text) => ({ type: 'stderr', payload: { text } }));
  assert.equal(extractTypeErrorsFromBuildLog(parseEventsBody(JSON.stringify(events))).length, 2);
  assert.equal(extractTypeErrorsFromBuildLog(parseEventsBody(JSON.stringify({ events }))).length, 2);
  assert.equal(extractTypeErrorsFromBuildLog(parseEventsBody(events.map((e) => JSON.stringify(e)).join('\n'))).length, 2);
  assert.deepEqual(parseEventsBody(''), []);
});

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test('si el log llega incompleto, lo pide otra vez una sola vez', async () => {
  const bodies = [JSON.stringify([{ text: 'Running "npm run build"' }]), JSON.stringify(SAMUEL.map((text) => ({ text })))];
  let calls = 0;
  const r = await fetchVercelTypeErrors({ url: 'u', token: 't', retryDelayMs: 0, fetchImpl: async () => response(200, bodies[calls++]) });
  assert.equal(calls, 2);
  assert.equal(r.typeErrors.length, 2);
  assert.equal(describeLogFetch(r), '[deploy] log de Vercel: status 200, 3 eventos, 2 errores de tipos');
});

test('un status de error queda registrado en la línea de diagnóstico y nunca lanza', async () => {
  let calls = 0;
  const r = await fetchVercelTypeErrors({ url: 'u', token: 't', retryDelayMs: 0, fetchImpl: async () => (calls++, response(403, 'forbidden')) });
  assert.equal(calls, 2);
  assert.match(describeLogFetch(r), /status 403, 0 eventos, 0 errores de tipos; final del log: ""/);
  const boom = await fetchVercelTypeErrors({ url: 'u', token: 't', retryDelayMs: 0, fetchImpl: async () => { throw new Error('red caída'); } });
  assert.match(describeLogFetch(boom), /error: red caída/);
});
